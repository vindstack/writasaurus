import type { Page } from "playwright";
import { createTestApp } from "../helpers.ts";

function assert(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

async function launchBrowser() {
  const nodeFs = await import("node:fs");
  const existsSync = nodeFs.default.existsSync;
  nodeFs.default.existsSync = (path) => {
    if (
      path === "/proc/sys/fs/binfmt_misc/WSLInterop" ||
      path === "/run/WSL"
    ) return false;
    return existsSync(path);
  };
  let chromium: typeof import("playwright").chromium;
  try {
    ({ chromium } = await import("playwright"));
  } finally {
    nodeFs.default.existsSync = existsSync;
  }
  const customPath = Deno.env.get("PLAYWRIGHT_CHROME_PATH");
  if (customPath) {
    return await chromium.launch({
      executablePath: customPath,
      headless: true,
      args: ["--no-sandbox"],
    });
  }

  // Look for system-installed Chromium/Chrome/Brave binaries if the default Playwright cache doesn't exist
  const candidates = [
    "/snap/bin/chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/usr/bin/brave-browser",
  ];

  for (const candidate of candidates) {
    try {
      const stat = await Deno.stat(candidate);
      if (stat.isFile || stat.isSymlink) {
        return await chromium.launch({
          executablePath: candidate,
          headless: true,
          args: ["--no-sandbox"],
        });
      }
    } catch {
      // not available, continue
    }
  }

  // Fall back to Playwright's default resolution
  return await chromium.launch({
    executablePath: chromium.executablePath(),
    headless: true,
  });
}

async function openSidebar(page: Page): Promise<void> {
  const sidebar = page.getByTestId("chapters-sidebar");
  if (await sidebar.getAttribute("data-collapsed") === "true") {
    await page.getByRole("button", { name: "Toggle chapters panel" }).click();
  }
}

const STAT_BUTTON = 'button[title="Cycle statistics (Ctrl+G)"]';
const PANEL = '[data-testid="assistance-panel"]';
const ISSUES = `${PANEL} li[data-category="spelling"]`;

function browserTest(name: string, fn: () => Promise<void>): void {
  Deno.test({
    name,
    fn,
    permissions: {
      read: true,
      write: true,
      env: true,
      net: true,
      run: true,
      sys: ["homedir", "osRelease"],
    },
  });
}

function editorTestHandler(desktop: boolean): (request: Request) => Response | Promise<Response> {
  const app = createTestApp().fetch;
  return (request) =>
    new URL(request.url).pathname === "/api/editor/status"
      ? Response.json({ isDesktop: desktop, activeFile: null, activePath: null })
      : app(request);
}

async function withEditorPage(
  test: (page: Page) => Promise<void>,
  desktop = true,
): Promise<void> {
  const server = Deno.serve(
    { hostname: "127.0.0.1", port: 0, onListen() {} },
    editorTestHandler(desktop),
  );
  const address = server.addr as Deno.NetAddr;
  const browser = await launchBrowser();
  const page = await browser.newPage();

  try {
    await page.addInitScript(() => {
      // Prevent a locally persisted file handle from affecting fixture state.
      Object.defineProperty(globalThis, "indexedDB", {
        configurable: true,
        value: {
          open: () => {
            throw new Error("IndexedDB is disabled in this test fixture.");
          },
        },
      });
      sessionStorage.removeItem("writasaurus-manuscript-v1:state");
      sessionStorage.setItem("writasaurus-session:skip-welcome", "true");
    });
    await page.goto(`http://${address.hostname}:${address.port}/`);
    await page.waitForSelector('[data-ready="true"]');
    await test(page);
  } finally {
    await browser.close();
    await server.shutdown();
  }
}

browserTest("browser: chapters and assistance share the same slideout shell", async () => {
  await withEditorPage(async (page) => {
    const styles = await page.evaluate(() => {
      const chapters = document.querySelector('[data-testid="chapters-sidebar"]');
      const assistance = document.querySelector('[data-testid="assistance-panel"]');
      return {
        chaptersClass: chapters?.classList.contains("slideoutPanel"),
        assistanceClass: assistance?.classList.contains("slideoutPanel"),
        chaptersRadius: chapters && getComputedStyle(chapters).borderRadius,
        assistanceRadius: assistance && getComputedStyle(assistance).borderRadius,
      };
    });
    assert(
      styles.chaptersClass && styles.assistanceClass,
      "Expected both panels to use the shared slideout",
    );
    assert(
      styles.chaptersRadius === styles.assistanceRadius && styles.chaptersRadius === "0px",
      `Expected square panel edges, got ${styles.chaptersRadius} and ${styles.assistanceRadius}`,
    );
  });
});

browserTest("browser: chapters and assistance panels use compact spacing", async () => {
  await withEditorPage(async (page) => {
    const spacing = await page.evaluate(() => {
      const chapters = document.querySelector('[data-testid="chapters-sidebar"]');
      const assistance = document.querySelector('[data-testid="assistance-panel"]');
      const chaptersHeading = chapters?.querySelector(".heading");
      const assistanceHeading = assistance?.querySelector(".heading");
      if (!chapters || !assistance || !chaptersHeading || !assistanceHeading) return null;
      return {
        chaptersPadding: getComputedStyle(chapters).padding,
        assistancePadding: getComputedStyle(assistance).padding,
        chaptersHeadingPadding: getComputedStyle(chaptersHeading).paddingBottom,
        assistanceGap: getComputedStyle(assistance).gap,
      };
    });
    assert(spacing, "Expected chapter and assistance panels");
    assert(
      spacing.chaptersPadding === "8px" && spacing.assistancePadding === "8px",
      `Expected compact, matching panel padding, got ${spacing.chaptersPadding} and ${spacing.assistancePadding}`,
    );
    assert(
      spacing.chaptersHeadingPadding === "4px" && spacing.assistanceGap === "8px",
      `Expected compact header and section spacing, got ${spacing.chaptersHeadingPadding} and ${spacing.assistanceGap}`,
    );
  });
});

browserTest("browser: editor app renders its shell and adds a chapter", async () => {
  await withEditorPage(async (page) => {
    await page.waitForSelector("header #manuscript-title");
    await page.waitForSelector("#editor");
    await openSidebar(page);

    const items = page.locator("[data-drag-item]");
    const initialChapters = await items.count();
    assert(initialChapters > 0, "Expected the editor to render at least one chapter");

    await page.getByTestId("chapters-sidebar").getByRole("button", { name: "Add" }).click();
    await page.waitForFunction(
      (count) => document.querySelectorAll("[data-drag-item]").length === count + 1,
      initialChapters,
    );

    await page.waitForFunction(
      (expected) =>
        (document.querySelector("#chapter-title") as HTMLInputElement).value === expected,
      `Chapter ${initialChapters + 1}: Untitled`,
    ).catch(() => {});
    const chapterTitle = await page.locator("#chapter-title").inputValue();
    assert(
      chapterTitle === `Chapter ${initialChapters + 1}: Untitled`,
      `Unexpected new chapter title: ${chapterTitle}`,
    );
  });
});

browserTest("browser: editor tokens follow the system color scheme", async () => {
  await withEditorPage(async (page) => {
    await page.emulateMedia({ colorScheme: "light" });
    const lightColors = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      return {
        background: root.getPropertyValue("--bg").trim(),
        accent: root.getPropertyValue("--accent").trim(),
        accentStrong: root.getPropertyValue("--accent-strong").trim(),
      };
    });
    assert(
      lightColors.background === "#f5f2e9",
      `Unexpected light background: ${lightColors.background}`,
    );
    assert(lightColors.accent === "#596b46", `Unexpected light accent: ${lightColors.accent}`);
    assert(
      lightColors.accentStrong === "#405234",
      `Unexpected light strong accent: ${lightColors.accentStrong}`,
    );

    await page.emulateMedia({ colorScheme: "dark" });
    const darkColors = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      return {
        background: root.getPropertyValue("--bg").trim(),
        surface: root.getPropertyValue("--surface").trim(),
        surfaceSunken: root.getPropertyValue("--surface-sunken").trim(),
        accent: root.getPropertyValue("--accent").trim(),
        accentStrong: root.getPropertyValue("--accent-strong").trim(),
      };
    });
    assert(
      darkColors.background === "#242321",
      `Unexpected dark background: ${darkColors.background}`,
    );
    assert(darkColors.surface === "#302e2b", `Unexpected dark surface: ${darkColors.surface}`);
    assert(
      darkColors.surfaceSunken === "#3b3834",
      `Unexpected dark sunken surface: ${darkColors.surfaceSunken}`,
    );
    assert(darkColors.accent === "#a8ba8a", `Unexpected dark accent: ${darkColors.accent}`);
    assert(
      darkColors.accentStrong === "#c5d3a9",
      `Unexpected dark strong accent: ${darkColors.accentStrong}`,
    );
  });
});

browserTest("browser: primary link buttons keep their accessible foreground color", async () => {
  await withEditorPage(async (page) => {
    const colors = await page.evaluate(() => {
      const button = document.createElement("a");
      button.href = "/";
      button.className = "button button--primary";
      button.textContent = "Return to Editor";
      document.body.append(button);
      const styles = getComputedStyle(button);
      return { background: styles.backgroundColor, foreground: styles.color };
    });
    assert(
      colors.background === "rgb(89, 107, 70)",
      `Expected primary olive background, got ${colors.background}`,
    );
    assert(
      colors.foreground === "rgb(255, 253, 247)",
      `Expected light text on the primary button, got ${colors.foreground}`,
    );
  });
});

browserTest("browser: chapter delete control renders visible neutral text", async () => {
  await withEditorPage(async (page) => {
    await openSidebar(page);
    const deleteButton = page.locator('[data-drag-item] button[title="Delete chapter"]');

    assert(await deleteButton.isVisible(), "Expected the chapter delete button to be visible");
    assert(
      await deleteButton.getAttribute("aria-label") === "Delete Chapter 1",
      "Expected an accessible delete label",
    );
    assert(
      (await deleteButton.textContent())?.trim() === "Delete",
      "Expected the delete button to contain its text label",
    );

    const colors = await deleteButton.evaluate((element) => ({
      button: getComputedStyle(element).color,
      text: getComputedStyle(document.querySelector("[data-chapter-title]")!).color,
    }));
    assert(
      colors.button === colors.text,
      "Expected the delete button to use the primary text color",
    );
  });
});

browserTest("browser: dragging a chapter handle reorders chapters", async () => {
  await withEditorPage(async (page) => {
    await openSidebar(page);
    const addChapter = page.getByTestId("chapters-sidebar").getByRole("button", { name: "Add" });
    await addChapter.click();
    await addChapter.click();
    await page.waitForFunction(() => document.querySelectorAll("[data-drag-item]").length === 3);

    const chapterTitle = page.locator("#chapter-title");
    await page.locator("[data-drag-item]").nth(0).locator("[data-chapter-title]").click();
    await chapterTitle.fill("Opening Chapter 1");
    await page.locator("[data-drag-item]").nth(1).locator("[data-chapter-title]").click();
    await chapterTitle.fill("Chapter 2: Middle");
    await page.locator("[data-drag-item]").nth(2).locator("[data-chapter-title]").click();
    await chapterTitle.fill("Appendix");

    const source = await page.locator("[data-drag-item]").nth(0).locator("[data-drag-handle]")
      .boundingBox();
    const destination = await page.locator("[data-drag-item]").nth(2).boundingBox();
    assert(source && destination, "Expected draggable chapter handles");

    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      destination.x + destination.width / 2,
      destination.y + destination.height / 2,
      { steps: 10 },
    );
    await page.mouse.up();

    const titles = await page.locator("[data-chapter-title]").allTextContents();
    assert(
      titles.join("|") === "Chapter 1: Middle|Appendix|Opening Chapter 3",
      `Unexpected reordered titles: ${titles.join("|")}`,
    );

    const status = await page.locator("#save-status").textContent() ?? "";
    assert(
      status.includes("Unsaved changes"),
      "Expected chapter reordering to mark the manuscript dirty",
    );
  });
});

browserTest("browser: save status shows the saved indicator", async () => {
  await withEditorPage(async (page) => {
    const status = page.locator("#save-status");
    assert((await status.textContent())?.includes("Saved"), "Expected the Saved message");
    const color = await status.locator("[data-indicator]").evaluate((element) =>
      getComputedStyle(element).backgroundColor
    );
    assert(color === "rgb(77, 104, 75)", `Expected saved indicator color, got ${color}`);
  });
});

async function chapterWords(page: Page): Promise<number> {
  const text = await page.locator(STAT_BUTTON).textContent() ?? "";
  return Number(text.match(/Chapter: ([\d,]+) words/)?.[1]?.replace(/,/g, "") ?? -1);
}

browserTest("browser: status bar renders live stats from the editor store", async () => {
  await withEditorPage(async (page) => {
    const before = await chapterWords(page);
    assert(before >= 0, "Expected the status bar to render chapter words");

    await page.locator("#editor").click();
    await page.keyboard.press("End");
    await page.keyboard.type(" Hello brave new world");

    await page.waitForFunction(
      ([selector, expected]) =>
        document.querySelector(selector as string)?.textContent?.includes(
          `Chapter: ${expected} words`,
        ) === true,
      [STAT_BUTTON, before + 4] as const,
    );

    const stats = page.locator(STAT_BUTTON);
    await stats.click();
    await stats.click();
    assert(
      (await stats.textContent())?.trim() === "Daily Goal: 4 / 1,500 words",
      "Expected today’s writing progress to include newly written words",
    );

    const saveStatus = await page.locator("#save-status").textContent() ?? "";
    assert(
      saveStatus.includes("Unsaved changes"),
      `Expected the topbar to show unsaved changes, got ${saveStatus}`,
    );
  });
});

browserTest(
  "browser: status bar rotates chapter, manuscript, and daily writing stats",
  async () => {
    await withEditorPage(async (page) => {
      const stats = page.locator(STAT_BUTTON);

      const chapterStats = (await stats.textContent())?.trim();
      assert(chapterStats?.startsWith("Chapter:"), `Expected chapter stats, got ${chapterStats}`);
      assert(chapterStats?.includes("pages"), `Expected chapter pages, got ${chapterStats}`);
      assert(
        !chapterStats?.includes("characters"),
        `Expected no chapter characters, got ${chapterStats}`,
      );

      await stats.click();
      const manuscriptStats = (await stats.textContent())?.trim();
      assert(
        manuscriptStats?.startsWith("Manuscript:"),
        `Expected manuscript stats, got ${manuscriptStats}`,
      );

      await stats.click();
      const dailyStats = (await stats.textContent())?.trim();
      assert(
        dailyStats === "Daily Goal: 0 / 1,500 words",
        `Expected default daily goal stats, got ${dailyStats}`,
      );

      // Verify Ctrl+G shortcut cycles stats and hint is present
      const kbdHint = page.locator("footer kbd", { hasText: "Ctrl+G" });
      assert(await kbdHint.isVisible(), "Expected Ctrl+G kbd hint to be visible");
      assert((await kbdHint.textContent())?.trim() === "Ctrl+G", "Expected Ctrl+G text in hint");

      await page.keyboard.press("Control+g");
      const cycledChapterStats = (await stats.textContent())?.trim();
      assert(
        cycledChapterStats?.startsWith("Chapter:"),
        `Expected Ctrl+G to cycle back to Chapter stats, got ${cycledChapterStats}`,
      );
    });
  },
);

browserTest("browser: Desktop writing assistance corrects a local spelling warning", async () => {
  await withEditorPage(async (page) => {
    const panel = page.locator(PANEL);
    await panel.waitFor({ state: "attached" });
    await page.locator("#editor").fill("This is teh cat.");
    await page.waitForTimeout(750);
    assert(
      !await page.evaluate(() => CSS.highlights.has("writing-assistance-spelling")),
      "Expected writing assistance to remain inactive while its panel is closed",
    );

    await page.locator("footer").getByRole("button", {
      name: "Toggle writing assistance panel",
    }).click();
    await page.waitForFunction(() => {
      const panel = document.querySelector('[data-testid="assistance-panel"]');
      if (!panel || panel.getAttribute("data-collapsed") === "true") return false;
      const bounds = panel.getBoundingClientRect();
      return bounds.left < innerWidth && bounds.right > 0;
    });
    try {
      await page.waitForFunction(
        () =>
          document.querySelector('[data-testid="assistance-panel"]')?.textContent?.includes(
            "1 issue",
          ),
        undefined,
        { timeout: 60_000 },
      );
    } catch {
      throw new Error(
        `Expected writing assistance issue, got: ${(await panel.textContent())?.trim()}`,
      );
    }
    assert(
      await page.evaluate(() => CSS.highlights.has("writing-assistance-spelling")),
      "Expected the spelling warning to be highlighted in the editor",
    );

    await page.keyboard.press("Control+n");
    await page.waitForFunction(() =>
      document.querySelector('[data-testid="assistance-panel"]')?.getAttribute("data-collapsed") ===
        "true"
    );
    assert(
      !await page.evaluate(() => CSS.highlights.has("writing-assistance-spelling")),
      "Expected closing writing assistance to clear its highlights",
    );
    await page.keyboard.press("Control+n");
    await page.waitForFunction(() =>
      document.querySelector('[data-testid="assistance-panel"]')?.textContent?.includes("1 issue")
    );

    await panel.getByRole("button", { name: "Replace with “the”" }).click();
    await page.waitForFunction(() =>
      document.querySelector("#editor")?.textContent === "This is the cat."
    );

    await page.locator("#editor").fill("They is here.");
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="assistance-panel"]')?.textContent?.includes(
          "Make the verb agree with its subject.",
        ) === true,
    );
    assert(
      await page.evaluate(() => CSS.highlights.has("writing-assistance-grammar")),
      "Expected the grammar warning to be highlighted in the editor",
    );
  }, true);
});

browserTest(
  "browser: writing assistance color codes issues and navigates to the active one",
  async () => {
    await withEditorPage(async (page) => {
      await page.locator(PANEL).waitFor({ state: "attached" });
      await page.keyboard.press("Control+n");

      // A long chapter keeps the reported issue off screen until the panel scrolls to it.
      await page.locator("#editor").evaluate((element) => {
        const filler = Array.from({ length: 60 }, () => "<p>All is well in this chapter.</p>");
        element.innerHTML = `${filler.join("")}<p>This is teh cat.</p>`;
        element.dispatchEvent(new Event("input", { bubbles: true }));
      });

      const issue = page.locator(`${ISSUES} [data-issue]`);
      await issue.waitFor({ state: "visible", timeout: 60_000 });
      assert(
        (await page.locator(`${ISSUES} [data-kind]`)
          .textContent())?.trim() === "Spelling",
        "Expected the issue to be labelled with its category",
      );

      const colors = await page.evaluate(() => {
        const item = document.querySelector(
          '[data-testid="assistance-panel"] li[data-category="spelling"]',
        )!;
        return {
          item: getComputedStyle(item).borderLeftColor,
          kind: getComputedStyle(item.querySelector("[data-kind]")!).color,
          danger: getComputedStyle(document.documentElement).getPropertyValue("--danger").trim(),
        };
      });
      assert(
        colors.item === colors.kind,
        `Expected the spelling accent to match its label color, got ${colors.item} and ${colors.kind}`,
      );
      assert(colors.danger.length > 0, "Expected a danger color token to be defined");

      assert(
        !await page.evaluate(() => CSS.highlights.has("writing-assistance-active")),
        "Expected no active highlight before an issue is selected",
      );

      await issue.click();
      await page.waitForFunction(() => CSS.highlights.has("writing-assistance-active"));
      await page.waitForFunction(() =>
        document.querySelector('[data-testid="assistance-panel"] li[data-category="spelling"]')
          ?.getAttribute("data-active") === "true"
      );
      assert(
        await page.locator(`${ISSUES} [data-issue]`)
          .getAttribute("aria-current") === "true",
        "Expected the selected issue to be marked as current",
      );
      await page.waitForFunction(() =>
        (document.querySelector("[data-editor-viewport]")?.scrollTop ?? 0) > 0
      );
    }, true);
  },
);

browserTest("browser: toolbar bold command formats the selected editor content", async () => {
  await withEditorPage(async (page) => {
    await page.locator("#editor").evaluate((element) => {
      element.textContent = "Selected text";
      const selection = getSelection();
      const range = document.createRange();
      range.selectNodeContents(element);
      selection?.removeAllRanges();
      selection?.addRange(range);
    });

    await page.locator('button[data-command="bold"]').click();

    const formatted = await page.locator("#editor").evaluate((element) => {
      return element.querySelector("b, strong")?.textContent;
    });
    assert(formatted === "Selected text", `Expected bold content, got ${formatted ?? "none"}`);
  });
});

browserTest("browser: toolbar has its own row and can format headings", async () => {
  await withEditorPage(async (page) => {
    const toolbarPosition = await page.evaluate(() => {
      const toolbar = document.querySelector('[role="toolbar"]');
      const editor = document.querySelector("#editor");
      if (!toolbar || !editor) return null;
      const toolbarRect = toolbar.getBoundingClientRect();
      const editorRect = editor.getBoundingClientRect();
      return {
        toolbarBottom: toolbarRect.bottom,
        editorTop: editorRect.top,
      };
    });
    assert(toolbarPosition, "Expected toolbar and editor to render");
    assert(
      toolbarPosition.toolbarBottom <= toolbarPosition.editorTop,
      "Expected the toolbar to be on a separate line above the editor",
    );

    await page.locator("#editor").evaluate((element) => {
      element.textContent = "Chapter heading";
      const selection = getSelection();
      const range = document.createRange();
      range.selectNodeContents(element);
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
    await page.getByRole("button", { name: "Heading" }).click();
    await page.getByRole("menuitem", { name: "Heading 2" }).click();

    const heading = await page.locator("#editor h2").textContent();
    assert(heading === "Chapter heading", `Expected heading formatting, got ${heading ?? "none"}`);
  });
});

browserTest("browser: editor header and footer are compact and equally sized", async () => {
  await withEditorPage(async (page) => {
    const measurements = await page.evaluate(() => {
      const header = document.querySelector("header.topbar");
      const toolbar = document.querySelector('[role="toolbar"]');
      const footer = document.querySelector("footer.statusbar");
      const title = document.querySelector<HTMLInputElement>("#manuscript-title");
      const filename = document.querySelector("#filename");
      const saveStatus = document.querySelector("#save-status");
      const titleGroup = document.querySelector(".titleGroup");
      const menu = document.querySelector(".right");
      if (
        !header || !toolbar || !footer || !title || !filename || !saveStatus || !titleGroup ||
        !menu
      ) {
        return null;
      }
      const titleRect = title.getBoundingClientRect();
      const filenameRect = filename.getBoundingClientRect();
      const saveStatusRect = saveStatus.getBoundingClientRect();
      const headerBackground = getComputedStyle(header).backgroundColor;
      const toolbarBackground = getComputedStyle(toolbar).backgroundColor;
      const toolbarButtons = [...toolbar.querySelectorAll("button")].filter((button) =>
        button.getClientRects().length > 0
      );
      return {
        headerHeight: header.getBoundingClientRect().height,
        toolbarHeight: toolbar.getBoundingClientRect().height,
        footerHeight: footer.getBoundingClientRect().height,
        headerBackground,
        toolbarBackground,
        titleCenterY: titleRect.top + titleRect.height / 2,
        filenameCenterY: filenameRect.top + filenameRect.height / 2,
        saveStatusCenterY: saveStatusRect.top + saveStatusRect.height / 2,
        titleLeft: titleRect.left,
        titleRight: titleRect.right,
        filenameLeft: filenameRect.left,
        titleFilenameGap: filenameRect.left - titleRect.right,
        saveStatusLeft: saveStatusRect.left,
        saveStatusRight: saveStatusRect.right,
        titleFieldSizing: getComputedStyle(title).fieldSizing,
        titleTextWidth: (() => {
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          if (!context) return null;
          const style = getComputedStyle(title);
          context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
          return context.measureText(title.value).width;
        })(),
        titleInputWidth: titleRect.width,
        titleGroupAlignment: getComputedStyle(titleGroup).justifyContent,
        titleGroupLeft: titleGroup.getBoundingClientRect().left,
        titleGroupRight: titleGroup.getBoundingClientRect().right,
        menuLeft: menu.getBoundingClientRect().left,
        quietButtonsAreSmall: [...document.querySelectorAll(".app button.button--quiet")].every(
          (button) => button.classList.contains("button--small"),
        ),
        toolbarButtonsAreSmall: toolbarButtons.length > 0 &&
          toolbarButtons.every((button) => button.classList.contains("button--small")),
      };
    });
    assert(measurements, "Expected editor header and footer");
    assert(
      Math.abs(measurements.headerHeight - measurements.footerHeight) < 1,
      `Expected matching header/footer heights, got ${measurements.headerHeight}px and ${measurements.footerHeight}px`,
    );
    assert(
      Math.abs(measurements.toolbarHeight - measurements.headerHeight) < 1,
      `Expected toolbar/header heights to match, got ${measurements.toolbarHeight}px and ${measurements.headerHeight}px`,
    );
    assert(
      measurements.headerHeight < 44,
      `Expected compact editor bars, got ${measurements.headerHeight}px`,
    );
    assert(measurements.quietButtonsAreSmall, "Expected editor quiet buttons to use small sizing");
    assert(measurements.toolbarButtonsAreSmall, "Expected toolbar buttons to use small sizing");
    assert(
      measurements.toolbarBackground !== measurements.headerBackground,
      "Expected the toolbar background to be subtly distinct from the header",
    );
    assert(
      measurements.titleRight <= measurements.filenameLeft &&
        measurements.titleLeft < measurements.filenameLeft &&
        measurements.filenameLeft < measurements.saveStatusLeft,
      "Expected the title, filename, and save status to appear left-to-right",
    );
    assert(
      measurements.titleFilenameGap <= 12,
      `Expected standard title/filename spacing, got ${measurements.titleFilenameGap}px`,
    );
    assert(
      measurements.titleGroupAlignment === "flex-start" &&
        measurements.titleLeft >= measurements.titleGroupLeft,
      "Expected the manuscript details group to align from the left",
    );
    assert(
      Math.abs(measurements.titleGroupRight - measurements.saveStatusRight) < 2 &&
        measurements.titleGroupRight < measurements.menuLeft,
      "Expected the manuscript details group to size to its content",
    );
    assert(
      measurements.titleFieldSizing === "content" &&
        measurements.titleTextWidth !== null &&
        Math.abs(measurements.titleInputWidth - measurements.titleTextWidth) < 4,
      `Expected title input width to closely fit its text, got ${measurements.titleInputWidth}px for ${measurements.titleTextWidth}px of text`,
    );
    assert(
      Math.abs(measurements.titleCenterY - measurements.filenameCenterY) < 2 &&
        Math.abs(measurements.filenameCenterY - measurements.saveStatusCenterY) < 2,
      "Expected the title, filename, and save status to be inline and vertically aligned",
    );
  });
});

browserTest("browser: manuscript title uses a text cursor without a focus outline", async () => {
  await withEditorPage(async (page) => {
    const title = page.locator("#manuscript-title");
    await title.click();
    const style = await title.evaluate((element) => {
      const computed = getComputedStyle(element);
      return {
        cursor: computed.cursor,
        outlineStyle: computed.outlineStyle,
        boxShadow: computed.boxShadow,
      };
    });
    assert(style.cursor === "text", `Expected text cursor, got ${style.cursor}`);
    assert(
      style.outlineStyle === "none" || style.outlineStyle === "0px",
      `Expected no focus outline, got ${style.outlineStyle}`,
    );
    assert(style.boxShadow === "none", `Expected no focus shadow, got ${style.boxShadow}`);
  });
});

browserTest("browser: quiet buttons underline their text", async () => {
  await withEditorPage(async (page) => {
    const styles = await page.locator(".statusbar button.button--quiet").first().evaluate(
      (button) => {
        const keyboardShortcut = button.querySelector("kbd");
        return {
          buttonDecoration: getComputedStyle(button).textDecorationLine,
          keyboardShortcutDisplay: keyboardShortcut && getComputedStyle(keyboardShortcut).display,
          keyboardShortcutDecoration: keyboardShortcut &&
            getComputedStyle(keyboardShortcut).textDecorationLine,
          statsButtonIsQuietSmall: (() => {
            const statsButton = document.querySelector(".statusbar .stat");
            return statsButton?.classList.contains("button--quiet") &&
              statsButton.classList.contains("button--small");
          })(),
        };
      },
    );
    assert(
      styles.buttonDecoration.includes("underline"),
      `Expected quiet-button underline, got ${styles.buttonDecoration}`,
    );
    assert(
      styles.keyboardShortcutDisplay === "block" && styles.keyboardShortcutDecoration === "none",
      `Expected keyboard shortcut indicators to stay separate from the button underline, got ${styles.keyboardShortcutDisplay}`,
    );
    assert(
      styles.statsButtonIsQuietSmall,
      "Expected the statistics control to use the quiet small-button style",
    );
  });
});

browserTest("browser: menu contains direct manuscript and save actions", async () => {
  await withEditorPage(async (page) => {
    await page.locator("#menu-toggle").click();
    await page.waitForFunction(() =>
      document.querySelector("#app-menu")?.getAttribute("data-open") === "true"
    );
    const menu = page.locator("#app-menu");
    assert(
      (await menu.locator("#menu-save-epub").textContent())?.includes("Save As"),
      "Expected Save As action",
    );
    assert(
      (await menu.locator("#menu-new-manuscript").textContent())?.includes("New Manuscript"),
      "Expected New Manuscript action",
    );
    assert(
      (await menu.locator("#menu-open-manuscript").textContent())?.includes("Open Manuscript"),
      "Expected Open Manuscript action",
    );
    assert(await page.locator("#editor-file-input").count() === 1, "Expected direct file input");
    assert(
      await menu.locator("#menu-new-manuscript").evaluate((element) =>
        getComputedStyle(element).borderTopWidth
      ) === "0px",
      "Expected a standard borderless menu item",
    );
  });
});

browserTest("browser: hamburger menu toggles toolbar and reports its state", async () => {
  await withEditorPage(async (page) => {
    const toolbar = page.locator('[role="toolbar"]');
    const toggle = page.locator("#menu-toggle");
    await toggle.click();
    const menuItem = page.locator("#menu-toggle-toolbar");
    assert((await menuItem.textContent())?.includes("Hide toolbar"), "Expected hide action");
    assert(
      (await menuItem.locator("kbd").count()) === 0,
      "Expected toolbar visibility to be conveyed by the menu text alone",
    );
    assert(
      await menuItem.evaluate((item) => item.previousElementSibling?.textContent?.trim()) ===
        "Settings",
      "Expected toolbar toggle directly below Settings",
    );
    await menuItem.click();
    assert(await toolbar.count() === 0, "Expected toolbar to hide");

    await toggle.click();
    assert((await menuItem.textContent())?.includes("Show toolbar"), "Expected show action");
    await menuItem.click();
    assert(await toolbar.count() === 1, "Expected toolbar to show");
  });
});

browserTest("browser: Desktop menu and F11 toggle fullscreen", async () => {
  await withEditorPage(async (page) => {
    await page.evaluate(() => {
      let fullscreen = false;
      Object.defineProperty(document, "fullscreenElement", {
        configurable: true,
        get: () => fullscreen ? document.documentElement : null,
      });
      Object.defineProperty(document.documentElement, "requestFullscreen", {
        configurable: true,
        value: () => {
          fullscreen = true;
          document.documentElement.dataset.testFullscreen = "true";
          return Promise.resolve();
        },
      });
      Object.defineProperty(document, "exitFullscreen", {
        configurable: true,
        value: () => {
          fullscreen = false;
          delete document.documentElement.dataset.testFullscreen;
          return Promise.resolve();
        },
      });
    });

    await page.locator("#menu-toggle").click();
    const fullscreen = page.locator("#menu-fullscreen");
    assert(
      (await fullscreen.textContent())?.includes("F11"),
      "Expected the Fullscreen menu item to show its shortcut",
    );
    await fullscreen.click();
    await page.waitForFunction(() => document.documentElement.dataset.testFullscreen === "true");

    await page.locator("#menu-toggle").click();
    await page.keyboard.press("F11");
    await page.waitForFunction(() => document.documentElement.dataset.testFullscreen !== "true");
    assert(
      await page.locator("#app-menu").getAttribute("data-open") === "false",
      "Expected F11 to work while the menu is open and close the menu",
    );
  }, true);
});

browserTest("browser: editor content never mixes text with block siblings", async () => {
  await withEditorPage(async (page) => {
    await page.locator(PANEL).waitFor({ state: "attached" });
    await page.keyboard.press("Control+n");

    // Contenteditable routinely produces this shape: a bare text node beside generated
    // blocks. WebKit lays that text out in an anonymous block box and refuses to paint
    // ::highlight() ranges inside it, so the editor must normalise it away.
    await page.locator("#editor").evaluate((element) => {
      element.innerHTML =
        "This is teh cat.<div><br></div><div>Another teh dog.<br><p></p><div>A third teh bird.</div></div>";
      element.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await page.waitForFunction(() =>
      document.querySelectorAll('[data-testid="assistance-panel"] li').length >= 3
    );

    const stray = await page.locator("#editor").evaluate((element) => {
      const blocks = new Set([
        "ADDRESS",
        "ARTICLE",
        "ASIDE",
        "BLOCKQUOTE",
        "DIV",
        "DL",
        "FIELDSET",
        "FIGURE",
        "FOOTER",
        "FORM",
        "H1",
        "H2",
        "H3",
        "H4",
        "H5",
        "H6",
        "HEADER",
        "HR",
        "LI",
        "MAIN",
        "NAV",
        "OL",
        "P",
        "PRE",
        "SECTION",
        "TABLE",
        "UL",
      ]);
      const offenders: string[] = [];
      const visit = (node: Element) => {
        const children = Array.from(node.childNodes);
        const hasBlock = children.some((child) =>
          child.nodeType === Node.ELEMENT_NODE && blocks.has((child as Element).tagName)
        );
        if (hasBlock) {
          for (const child of children) {
            const isBlock = child.nodeType === Node.ELEMENT_NODE &&
              blocks.has((child as Element).tagName);
            if (!isBlock) offenders.push(`${node.tagName}>${child.nodeName}`);
          }
        }
        for (const child of children) {
          if (child.nodeType === Node.ELEMENT_NODE) visit(child as Element);
        }
      };
      visit(element);
      return offenders;
    });

    assert(
      stray.length === 0,
      `Expected no text or inline nodes beside block siblings, found: ${stray.join(", ")}`,
    );

    const ranges = await page.evaluate(() => {
      const out: string[] = [];
      for (const [, highlight] of CSS.highlights) {
        for (const range of highlight) out.push((range as Range).toString());
      }
      return out;
    });
    assert(
      ranges.filter((text) => text === "teh").length >= 3,
      `Expected every misspelling to be highlighted, got: ${JSON.stringify(ranges)}`,
    );
  }, true);
});

browserTest("browser: Tab key inserts an actual tab character in the editor", async () => {
  await withEditorPage(async (page) => {
    await page.locator("#editor").click();
    await page.keyboard.press("End");
    await page.keyboard.press("Tab");
    await page.keyboard.type("Indented");

    const content = await page.locator("#editor").evaluate((element) => element.textContent);
    assert(
      content?.includes("\tIndented"),
      `Expected content to include raw tab, got ${JSON.stringify(content)}`,
    );
  });
});

browserTest(
  "browser: system color scheme applies across settings, welcome, and about",
  async () => {
    await withEditorPage(async (page) => {
      await page.emulateMedia({ colorScheme: "dark" });
      for (const route of ["/settings", "/welcome", "/about"]) {
        await page.goto(new URL(route, page.url()).href);
        await page.waitForFunction(
          () =>
            getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() ===
              "#242321",
        );
      }
    });
  },
);

browserTest(
  "browser: starting a new manuscript from the welcome page opens the editor",
  async () => {
    const server = Deno.serve(
      { hostname: "127.0.0.1", port: 0, onListen() {} },
      editorTestHandler(true),
    );
    const address = server.addr as Deno.NetAddr;
    const browser = await launchBrowser();
    const page = await browser.newPage();
    try {
      await page.goto(`http://${address.hostname}:${address.port}/welcome`);
      await page.locator("#welcome-new").click();
      await page.waitForURL(`http://${address.hostname}:${address.port}/`);
      await page.waitForSelector('[data-ready="true"]');
      assert(
        await page.locator("#manuscript-title").inputValue() === "Untitled Manuscript",
        "Expected the new manuscript title to render in the editor",
      );
    } finally {
      await browser.close();
      await server.shutdown();
    }
  },
);
