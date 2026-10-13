import type { Page } from "playwright";
import { createTestApp } from "../helpers.ts";
import { closeActiveFile, getActivePath, setActivePath } from "../../src/lib/editor-session.ts";
import { loadLastFilePath } from "../../src/lib/desktop.ts";
import { blankManuscript } from "../../src/lib/editor/data.ts";
import { generateEpub } from "../../src/lib/epub.ts";
import type { AppSettings } from "../../src/lib/app-settings-types.ts";

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

const CHAPTER_STATS = '[data-stat="chapter"]';
const TOTAL_STATS = '[data-stat="total"]';
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

interface EditorTestOptions {
  projectSettingsAvailable?: boolean;
  useDesktopStatus?: boolean;
  fakeLoadedProject?: boolean;
  fakeWordCount?: number;
  dailyHistory?: { date: string; words: number; goal: number }[];
}

function editorTestHandler(
  {
    projectSettingsAvailable = false,
    useDesktopStatus = false,
    fakeLoadedProject = false,
    fakeWordCount = 40_000,
    dailyHistory = [],
  }: EditorTestOptions = {},
): (request: Request) => Response | Promise<Response> {
  const app = createTestApp().fetch;
  const browserManuscript = blankManuscript("Browser Test Manuscript");
  browserManuscript.chapters[0].wordCount = fakeWordCount;
  const settings: AppSettings = {
    version: 1,
    font: "alegreya",
    wordsPerPage: 300,
    writingAssistanceWords: [],
    writingAssistanceIgnores: [],
  };
  let projectWordGoal = 80_000;
  let dailyWordGoal = 1_500;
  let dailyWritingProgress = { date: "", startingWords: {} as Record<string, number> };
  const dailyWritingHistory = [...dailyHistory];
  let licenseToken: string | null = null;
  const today = () => {
    const now = new Date();
    return [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-");
  };
  return (request) => {
    const path = new URL(request.url).pathname;
    if (path === "/api/editor/settings" && request.method === "GET") {
      return Response.json(settings);
    }
    if (path === "/api/editor/status") {
      if (fakeLoadedProject) {
        return Response.json({
          activeFile: "draft_1.epub",
          activePath: "/tmp/writasaurus-browser-project/draft_1.epub",
          manuscript: browserManuscript,
        });
      }
      if (!useDesktopStatus) return Response.json({ activeFile: null, activePath: null });
    }
    if (path === "/api/editor/settings" && request.method === "PATCH") {
      return request.json().then((update) => {
        Object.assign(settings, update);
        return Response.json(settings);
      });
    }
    if (path === "/api/editor/project-settings") {
      if (!projectSettingsAvailable) {
        return new Response("Open a project to access project settings.", { status: 409 });
      }
      if (request.method === "PATCH") {
        return request.json().then((payload) => {
          const manuscriptGoal = payload?.user_settings?.manuscriptWordGoal;
          if (Number.isSafeInteger(manuscriptGoal) && manuscriptGoal > 0) {
            projectWordGoal = manuscriptGoal;
          }
          const dailyGoal = payload?.user_settings?.dailyWordGoal;
          if (Number.isSafeInteger(dailyGoal) && dailyGoal > 0) dailyWordGoal = dailyGoal;
          return projectDetails();
        });
      }
      return projectDetails();
    }
    if (path === "/api/editor/daily-progress" && request.method === "POST") {
      if (!projectSettingsAvailable) {
        return new Response("Open a project to track daily writing progress.", { status: 409 });
      }
      return request.json().then((payload) => {
        const date = today();
        if (dailyWritingProgress.date !== date) {
          dailyWritingProgress = { date, startingWords: {} };
        }
        const starting = dailyWritingProgress.startingWords[payload.manuscriptId] ??
          payload.totalWords;
        dailyWritingProgress.startingWords[payload.manuscriptId] = starting;
        const writtenWords = Math.max(payload.totalWords - starting, 0);
        const entry = dailyWritingHistory.find((item) => item.date === date);
        if (entry) {
          entry.words = Math.max(entry.words, writtenWords);
          entry.goal = dailyWordGoal;
        } else dailyWritingHistory.push({ date, words: writtenWords, goal: dailyWordGoal });
        return Response.json({
          progress: dailyWritingProgress,
          writtenWords,
          dailyWordGoal,
          history: dailyWritingHistory,
        });
      });
    }
    if (path === "/api/editor/license-token") {
      if (request.method === "GET") return Response.json({ token: licenseToken });
      if (request.method === "PUT") {
        return request.json().then((payload) => {
          licenseToken = payload.token;
          return new Response(null, { status: 204 });
        });
      }
      if (request.method === "DELETE") {
        licenseToken = null;
        return new Response(null, { status: 204 });
      }
    }
    return app(request);
  };

  function projectDetails(): Response {
    return Response.json({
      settings: {
        drafts: [{ number: 1, filename: "draft_1.epub" }],
        user_settings: {
          manuscriptWordGoal: projectWordGoal,
          dailyWordGoal,
          dailyWritingProgress,
          dailyWritingHistory,
          dailyWritingTrackingStarted: dailyWritingHistory[0]?.date ?? today(),
        },
      },
      manuscript: {
        id: "browser-test-manuscript",
        title: "Browser Test Manuscript",
        totalWords: fakeWordCount,
      },
    });
  }
}

async function withEditorPage(
  test: (page: Page) => Promise<void>,
  options: EditorTestOptions = {},
): Promise<void> {
  const server = Deno.serve(
    { hostname: "127.0.0.1", port: 0, onListen() {} },
    editorTestHandler(options),
  );
  const address = server.addr as Deno.NetAddr;
  const browser = await launchBrowser();
  const page = await browser.newPage();

  try {
    await page.addInitScript(() => {
      if (sessionStorage.getItem("__writasaurus-test-initialized") !== "true") {
        sessionStorage.removeItem("writasaurus-manuscript-v1:state");
        sessionStorage.setItem("__writasaurus-test-initialized", "true");
      }
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
      const section = chapters?.querySelector("[data-drag-item]");
      const handle = section?.querySelector("[data-drag-handle]");
      const chip = section?.querySelector(".chip");
      const remove = section?.querySelector(".delete");
      if (
        !chapters || !assistance || !chaptersHeading || !assistanceHeading || !section ||
        !handle || !chip || !remove
      ) return null;
      return {
        chaptersPadding: getComputedStyle(chapters).padding,
        assistancePadding: getComputedStyle(assistance).padding,
        chaptersHeadingPadding: getComputedStyle(chaptersHeading).paddingBottom,
        assistanceGap: getComputedStyle(assistance).gap,
        chapterHeight: getComputedStyle(section).height,
        chapterPadding: getComputedStyle(section).padding,
        reorderHeight: getComputedStyle(handle).height,
        chipPadding: getComputedStyle(chip).padding,
        deleteHeight: getComputedStyle(remove).height,
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
    assert(
      spacing.chapterHeight === "36px" && spacing.chapterPadding === "4.8px 6.4px" &&
        spacing.reorderHeight === "24px" && spacing.deleteHeight === "24px",
      `Expected compact section rows and controls, got ${JSON.stringify(spacing)}`,
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
    assert(await items.count() === initialChapters, "Opening Add must not create a section");
    await page.getByRole("menuitem", { name: "Chapter", exact: true }).click();
    await page.waitForFunction(
      (count) => document.querySelectorAll("[data-drag-item]").length === count + 1,
      initialChapters,
    );

    await page.waitForFunction(
      (expected) =>
        (document.querySelector("#chapter-title") as HTMLInputElement).value === expected,
      `Chapter ${initialChapters + 1}`,
    ).catch(() => {});
    const chapterTitle = await page.locator("#chapter-title").inputValue();
    assert(
      chapterTitle === `Chapter ${initialChapters + 1}`,
      `Unexpected new chapter title: ${chapterTitle}`,
    );
  });
});

browserTest("browser: clicking anywhere in a section row selects it", async () => {
  await withEditorPage(async (page) => {
    await openSidebar(page);
    const sidebar = page.getByTestId("chapters-sidebar");
    await sidebar.getByRole("button", { name: "Add" }).click();
    await page.getByRole("menuitem", { name: "Chapter", exact: true }).click();
    const rows = page.locator("[data-drag-item]");
    assert(await rows.count() > 1, "Expected multiple sections to select");

    const currentIndex = await rows.evaluateAll((items) =>
      items.findIndex((item) => item.getAttribute("aria-current") === "true")
    );
    const targetIndex = currentIndex === 0 ? 1 : 0;
    const target = rows.nth(targetIndex);
    const rowBounds = await target.boundingBox();
    assert(rowBounds, "Expected target section row bounds");

    await page.mouse.click(rowBounds.x + rowBounds.width - 2, rowBounds.y + rowBounds.height / 2);
    await page.waitForFunction(
      (index) =>
        document.querySelectorAll("[data-drag-item]")[index]
          ?.getAttribute("aria-current") === "true",
      targetIndex,
    );
  });
});

browserTest("browser: end-of-chapter action opens the next chapter or creates one", async () => {
  await withEditorPage(async (page) => {
    await openSidebar(page);
    const sidebar = page.getByTestId("chapters-sidebar");
    const add = sidebar.getByRole("button", { name: "Add" });
    await add.click();
    await page.getByRole("menuitem", { name: "Chapter", exact: true }).click();

    await page.locator("[data-drag-item] [data-chapter-title]").first().click();
    const action = page.locator("[data-next-chapter]");
    const shortChapterLayout = await action.evaluate((button) => {
      const viewport = button.closest("[data-editor-viewport]");
      if (!viewport) return null;
      return {
        buttonBottom: button.getBoundingClientRect().bottom,
        viewportBottom: viewport.getBoundingClientRect().bottom,
        scrollHeight: viewport.scrollHeight,
        clientHeight: viewport.clientHeight,
      };
    });
    assert(shortChapterLayout, "Expected short-chapter viewport layout");
    assert(
      shortChapterLayout.scrollHeight <= shortChapterLayout.clientHeight + 1 &&
        shortChapterLayout.viewportBottom - shortChapterLayout.buttonBottom < 36,
      "Expected the action to sit at the viewport bottom without requiring a scroll for short chapters",
    );
    await action.scrollIntoViewIfNeeded();
    const layout = await action.evaluate((button) => {
      const navigation = button.parentElement;
      const viewport = button.closest("[data-editor-viewport]");
      const referenceSmallButton = document.querySelector(".statusbar button.button--small");
      if (!navigation || !viewport || !referenceSmallButton) return null;
      const buttonStyle = getComputedStyle(button);
      const referenceStyle = getComputedStyle(referenceSmallButton);
      const shortcut = button.querySelector("kbd");
      return {
        buttonHeight: button.getBoundingClientRect().height,
        buttonRight: button.getBoundingClientRect().right,
        borderBottomStyle: buttonStyle.borderBottomStyle,
        borderBottomWidth: buttonStyle.borderBottomWidth,
        navigationRight: navigation.getBoundingClientRect().right,
        viewportContentRight: viewport.getBoundingClientRect().left + viewport.clientLeft +
          viewport.clientWidth,
        small: button.classList.contains("button--small"),
        quietOutline: button.classList.contains("button--quiet-outline"),
        textDecorationLine: buttonStyle.textDecorationLine,
        fontSize: buttonStyle.fontSize,
        minHeight: buttonStyle.minHeight,
        padding: buttonStyle.padding,
        referenceHeight: referenceSmallButton.getBoundingClientRect().height,
        referenceFontSize: referenceStyle.fontSize,
        shortcutText: shortcut?.textContent?.trim(),
      };
    });
    assert(layout, "Expected chapter navigation layout");
    assert(
      layout.small && layout.quietOutline && layout.borderBottomStyle === "solid" &&
        layout.borderBottomWidth === "1px" && layout.textDecorationLine === "none" &&
        Math.abs(layout.buttonHeight - layout.referenceHeight) < 2 &&
        layout.fontSize === "12px" && layout.fontSize === layout.referenceFontSize &&
        layout.minHeight === "28px" &&
        layout.padding === "4px 8px" && layout.shortcutText === "Ctrl+Shift+N" &&
        Math.abs(layout.navigationRight - layout.viewportContentRight) < 2 &&
        Math.abs(layout.navigationRight - layout.buttonRight - 16) < 2,
      `Expected the button--small quiet-outline action at the editor viewport's lower-right edge: ${
        JSON.stringify(layout)
      }`,
    );
    const actionLabel = await action.evaluate((button) =>
      Array.from(button.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent).join("").trim()
    );
    assert(actionLabel === "Go to Chapter 2", "Expected the end action to offer the next chapter");
    await action.click();
    await page.waitForFunction(
      () => (document.querySelector("#chapter-title") as HTMLInputElement)?.value === "Chapter 2",
    );

    await action.scrollIntoViewIfNeeded();
    const createActionLabel = await action.evaluate((button) =>
      Array.from(button.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent).join("").trim()
    );
    assert(
      createActionLabel === "Create Next Chapter",
      "Expected the final chapter to offer creating the next chapter",
    );
    const initialCount = await page.locator("[data-drag-item]").count();
    await action.click();
    await page.waitForFunction(
      (count) => document.querySelectorAll("[data-drag-item]").length === count + 1,
      initialCount,
    );
    assert(
      await page.locator("#chapter-title").inputValue() === "Chapter 3",
      "Expected the created chapter title to be focused",
    );
    await page.locator("[data-drag-item] [data-chapter-title]").first().click();
    await page.keyboard.press("Control+Shift+n");
    await page.waitForFunction(
      () => (document.querySelector("#chapter-title") as HTMLInputElement)?.value === "Chapter 2",
    );
    await page.keyboard.press("Control+Shift+n");
    await page.waitForFunction(
      () => (document.querySelector("#chapter-title") as HTMLInputElement)?.value === "Chapter 3",
    );
    const countBeforeShortcutCreate = await page.locator("[data-drag-item]").count();
    await page.keyboard.press("Control+Shift+n");
    await page.waitForFunction(
      (count) => document.querySelectorAll("[data-drag-item]").length === count + 1,
      countBeforeShortcutCreate,
    );
    assert(
      await page.locator("#chapter-title").inputValue() === "Chapter 4",
      "Expected Ctrl+Shift+N to create the next chapter at the end",
    );
  });
});

browserTest("browser: Add opens a menu and selecting a type adds it in reading order", async () => {
  await withEditorPage(async (page) => {
    await openSidebar(page);
    const sidebar = page.getByTestId("chapters-sidebar");
    const add = sidebar.getByRole("button", { name: "Add" });
    const items = page.locator("[data-drag-item]");
    const initialSections = await items.count();
    assert(await add.count() === 1, "Expected a single Add button");
    assert(
      await sidebar.locator(".draft-form select").count() === 1,
      "Expected the draft source selector to be contained in the creation dialog",
    );
    const draftSelector = sidebar.locator("[data-draft-selector]");
    assert(
      (await draftSelector.innerText()).includes("Draft 1"),
      "Expected Draft 1 to be selected",
    );
    await draftSelector.click();
    await page.getByRole("menuitem", { name: "Create new draft…" }).click();
    const draftDialog = page.getByRole("dialog", { name: "Create New Draft" });
    assert(await draftDialog.isVisible(), "Expected creating a draft to open a dialog");
    assert(
      await draftDialog.getByRole("radio", { name: "Copy a previous draft" }).isChecked(),
      "Expected copying a previous draft to be the default",
    );
    assert(await draftDialog.getByRole("radio", { name: "Start from scratch" }).isVisible());
    await draftDialog.getByRole("button", { name: "Cancel" }).click();
    assert(
      await sidebar.getByRole("button", { name: "Type", exact: true }).count() === 0,
      "Expected no separate Type button",
    );
    assert(await page.locator('[data-generated-section="toc"]').isVisible());

    await add.click();
    assert(await items.count() === initialSections, "Opening Add must not create a section");
    await page.getByRole("menuitem", { name: "Prologue", exact: true }).click();
    assert(await items.count() === initialSections + 1, "Expected exactly one prologue added");
    assert(await add.getAttribute("aria-expanded") === "false", "Expected Add menu to close");
    assert(await page.locator("#chapter-title").inputValue() === "Prologue");
    await add.click();
    await page.getByRole("menuitem", { name: "Epilogue", exact: true }).click();
    assert(await items.count() === initialSections + 2, "Expected exactly one epilogue added");
    assert(await add.getAttribute("aria-expanded") === "false", "Expected Add menu to close");

    const labels = await page.locator("[data-drag-item] [data-chapter-title]")
      .allTextContents();
    assert(labels[0]?.includes("Prologue"), "Expected the prologue before chapters");
    assert(labels.at(-1)?.includes("Epilogue"), "Expected the epilogue after chapters");
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

browserTest("browser: save status shows the saved indicator", async () => {
  await withEditorPage(async (page) => {
    const status = page.locator("#save-status");
    assert((await status.textContent())?.includes("Saved"), "Expected the Saved message");
    const fontSize = await status.evaluate((element) => getComputedStyle(element).fontSize);
    assert(fontSize === "11.52px", `Expected small save-status text, got ${fontSize}`);
    const color = await status.locator("[data-indicator]").evaluate((element) =>
      getComputedStyle(element).backgroundColor
    );
    assert(color === "rgb(77, 104, 75)", `Expected saved indicator color, got ${color}`);
  });
});

browserTest("browser: unsaved changes do not block leaving the editor", async () => {
  await withEditorPage(async (page) => {
    await page.locator("#editor").click();
    await page.keyboard.press("End");
    await page.keyboard.type(" unsaved text");
    await page.waitForFunction(() =>
      document.querySelector("#save-status")?.textContent?.includes("Unsaved changes")
    );

    const prevented = await page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      dispatchEvent(event);
      return event.defaultPrevented;
    });
    assert(!prevented, "Expected unsaved changes not to block leaving the editor");
  });
});

async function chapterWords(page: Page): Promise<number> {
  const text = await page.locator(`${CHAPTER_STATS} .statValue`).first().textContent() ?? "";
  return Number(text.replace(/,/g, "") || -1);
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
        document.querySelector(selector as string)?.querySelector(".statValue")?.textContent ===
          expected.toLocaleString(),
      [CHAPTER_STATS, before + 4] as const,
    );
    assert(
      (await page.locator(`${TOTAL_STATS} .statValue`).first().textContent()) ===
        (before + 4).toLocaleString(),
      "Expected total manuscript stats to update with the chapter",
    );

    const saveStatus = await page.locator("#save-status").textContent() ?? "";
    assert(
      saveStatus.includes("Unsaved changes"),
      `Expected the topbar to show unsaved changes, got ${saveStatus}`,
    );
  });
});

browserTest("browser: status bar shows chapter and total stats together", async () => {
  await withEditorPage(async (page) => {
    const chapterStats = page.locator(CHAPTER_STATS);
    const totalStats = page.locator(TOTAL_STATS);
    assert(
      (await chapterStats.textContent())?.startsWith("Chapter 1:"),
      "Expected chapter stats to use the active chapter title",
    );
    assert(
      (await chapterStats.textContent())?.includes("words") &&
        (await chapterStats.textContent())?.includes("pages"),
      "Expected chapter word and page counts",
    );
    assert(
      (await totalStats.textContent())?.startsWith("Total:"),
      "Expected total manuscript stats to be visible",
    );
    assert(
      !(await page.locator("footer.statusbar").textContent())?.includes("Ctrl+G"),
      "Expected the obsolete statistics shortcut to be removed",
    );

    await page.getByLabel("Chapter title").fill("Prologue");
    await page.waitForFunction(() =>
      document.querySelector('[data-stat="chapter"]')?.textContent?.startsWith("Prologue:")
    );
    assert(
      (await chapterStats.textContent())?.startsWith("Prologue:"),
      "Expected the chapter stat label to follow the section title",
    );
  });
});

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

    await page.keyboard.press("Control+Shift+a");
    await page.waitForFunction(() =>
      document.querySelector('[data-testid="assistance-panel"]')?.getAttribute("data-collapsed") ===
        "true"
    );
    assert(
      !await page.evaluate(() => CSS.highlights.has("writing-assistance-spelling")),
      "Expected closing writing assistance to clear its highlights",
    );
    await page.keyboard.press("Control+Shift+a");
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
  });
});

browserTest(
  "browser: writing assistance color codes issues and navigates to the active one",
  async () => {
    await withEditorPage(async (page) => {
      await page.locator(PANEL).waitFor({ state: "attached" });
      await page.keyboard.press("Control+Shift+a");

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
    });
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
      const toolbarContent = toolbar?.querySelector(".toolbarContent");
      const editor = document.querySelector("#editor");
      if (!toolbar || !toolbarContent || !editor) return null;
      const toolbarRect = toolbar.getBoundingClientRect();
      const contentRect = toolbarContent.getBoundingClientRect();
      const editorRect = editor.getBoundingClientRect();
      return {
        toolbarBottom: toolbarRect.bottom,
        editorTop: editorRect.top,
        toolbarWidth: toolbarRect.width,
        toolbarLeft: toolbarRect.left,
        viewportWidth: document.documentElement.clientWidth,
        contentLeft: contentRect.left,
        contentRight: contentRect.right,
        editorLeft: editorRect.left,
        editorRight: editorRect.right,
        borderLeftWidth: getComputedStyle(toolbar).borderLeftWidth,
        borderRightWidth: getComputedStyle(toolbar).borderRightWidth,
        borderTopWidth: getComputedStyle(toolbar).borderTopWidth,
        borderBottomWidth: getComputedStyle(toolbar).borderBottomWidth,
        borderBottomLeftRadius: getComputedStyle(toolbar).borderBottomLeftRadius,
        borderBottomRightRadius: getComputedStyle(toolbar).borderBottomRightRadius,
      };
    });
    assert(toolbarPosition, "Expected toolbar and editor to render");
    assert(
      toolbarPosition.toolbarBottom <= toolbarPosition.editorTop,
      "Expected the toolbar to be on a separate line above the editor",
    );
    assert(
      toolbarPosition.toolbarWidth === toolbarPosition.viewportWidth &&
        toolbarPosition.toolbarLeft === 0 &&
        Math.abs(toolbarPosition.contentLeft - toolbarPosition.editorLeft) < 2 &&
        Math.abs(toolbarPosition.contentRight - toolbarPosition.editorRight) < 2 &&
        toolbarPosition.borderLeftWidth === "0px" &&
        toolbarPosition.borderRightWidth === "0px" &&
        toolbarPosition.borderTopWidth === "0px" &&
        toolbarPosition.borderBottomWidth === "1px" &&
        toolbarPosition.borderBottomLeftRadius === "0px" &&
        toolbarPosition.borderBottomRightRadius === "0px",
      `Expected the toolbar to be full-width with a bottom border and square corners: ${
        JSON.stringify(toolbarPosition)
      }`,
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

browserTest("browser: daily writing progress completes with a goal celebration", async () => {
  await withEditorPage(async (page) => {
    await page.evaluate(async () => {
      await fetch("/api/editor/project-settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user_settings: { dailyWordGoal: 2 } }),
      });
    });
    await page.reload();
    await page.waitForSelector('[data-ready="true"]');

    const progress = page.getByRole("progressbar", { name: "Daily writing goal" });
    await page.locator("#editor").fill("one two");
    await page.waitForSelector(".fireworks");

    const values = await progress.evaluate((element) => {
      const bar = element as HTMLProgressElement;
      return { value: bar.value, max: bar.max };
    });
    assert(values.value === 2 && values.max === 2, "Expected the daily goal progress to be full");
    assert(
      await page.locator(".fireworks .spark").count() === 9,
      "Expected a firework burst when the daily goal is reached",
    );
    assert(
      (await page.locator(".goalNotice").textContent())?.trim() === "Daily goal reached!",
      "Expected a visible goal-reached message",
    );
    assert(
      (await page.locator(".screenReaderOnly").textContent())?.trim() ===
        "Daily writing goal reached!",
      "Expected an announcement when the daily goal is reached",
    );

    const manuscriptId = await page.evaluate(() => {
      const saved = JSON.parse(
        sessionStorage.getItem("writasaurus-manuscript-v1:state") ?? "null",
      );
      return saved?.manuscript?.frontmatter?.writasaurusId;
    });
    assert(typeof manuscriptId === "string", "Expected the manuscript to have a stable identity");

    await page.goto(new URL("/settings", page.url()).toString());
    await page.goto(new URL("/", page.url()).toString());
    await page.waitForSelector('[data-ready="true"]');
    await page.waitForFunction((expectedId) => {
      const saved = JSON.parse(
        sessionStorage.getItem("writasaurus-manuscript-v1:state") ?? "null",
      );
      return saved?.manuscript?.frontmatter?.writasaurusId === expectedId &&
        saved.manuscript.chapters.reduce(
            (total: number, chapter: { wordCount: number }) => total + chapter.wordCount,
            0,
          ) === 2;
    }, manuscriptId);
    await page.waitForFunction(() => {
      const progress = document.querySelector(
        '[aria-label="Daily writing goal"]',
      ) as HTMLProgressElement | null;
      return progress?.value === progress?.max;
    });

    const restoredProgress = await page.evaluate(async () => {
      const bar = document.querySelector(
        '[aria-label="Daily writing goal"]',
      ) as HTMLProgressElement | null;
      return { value: bar?.value, max: bar?.max };
    });
    assert(
      restoredProgress.value === 2 && restoredProgress.max === 2,
      `Expected daily progress to remain complete after leaving and returning to the editor: ${
        JSON.stringify(restoredProgress)
      }`,
    );
  }, { projectSettingsAvailable: true });
});

browserTest("browser: app preferences persist through the settings API", async () => {
  await withEditorPage(async (page) => {
    await page.goto(new URL("/settings", page.url()).toString());
    const font = page.locator("#font-select");
    await font.selectOption("georgia");
    await page.waitForFunction(() =>
      document.querySelector("#settings-status")?.textContent?.includes("Font preference saved.")
    );

    await page.reload();

    assert(await page.locator("#font-select").inputValue() === "georgia");
    assert(await page.locator("#daily-word-goal-input").count() === 0);
  });
});

browserTest("browser: project settings configure manuscript goal progress", async () => {
  const dayDate = (daysAgo: number) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - daysAgo);
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");
  };
  const history = [
    { date: dayDate(3), words: 1_000, goal: 1_500 },
    { date: dayDate(2), words: 1_600, goal: 1_500 },
    { date: dayDate(1), words: 1_600, goal: 1_500 },
  ];
  await withEditorPage(
    async (page) => {
      await page.getByRole("button", { name: "Menu" }).click();
      assert(await page.getByRole("menuitem", { name: "Project Settings" }).isVisible());
      assert(await page.getByRole("menuitem", { name: "Manuscript Goal" }).count() === 0);
      const goalsLink = page.getByTestId("manuscript-goals-link");
      await goalsLink.waitFor();
      const initialProgress = await goalsLink.getByRole("progressbar", {
        name: "Manuscript word-goal progress",
      }).evaluate((element) => {
        const bar = element as HTMLProgressElement;
        return { value: bar.value, max: bar.max };
      });
      assert(
        initialProgress.value === 40_000 && initialProgress.max === 80_000,
        "Expected the Goals button to show progress toward the current manuscript goal",
      );
      assert(
        await goalsLink.evaluate((link) => {
          const modeSwitch = link.parentElement?.querySelector(".modeSwitch");
          return Boolean(
            modeSwitch &&
              (link.compareDocumentPosition(modeSwitch) & Node.DOCUMENT_POSITION_FOLLOWING),
          );
        }),
        "Expected the Goals button immediately before the Manuscript/Outline toggle",
      );

      await page.goto(new URL("/project-settings", page.url()).toString());
      assert(await page.locator("#daily-word-goal").inputValue() === "1500");
      const saveResponsePromise = page.waitForResponse(
        (response) =>
          response.url().includes("/api/editor/project-settings") &&
          response.request().method() === "PATCH",
        { timeout: 5000 },
      );
      await page.locator("#manuscript-word-goal").fill("90000");
      await page.locator("#daily-word-goal").fill("2000");
      assert(await page.getByRole("button", { name: "Save Goal" }).count() === 0);
      assert(await page.getByRole("link", { name: "View Goal Progress" }).count() === 0);
      assert(
        await page.locator(".card a[href='/']").evaluate((link) =>
          link.classList.contains("button--primary")
        ),
        "Expected the in-card Return to Editor button to be primary",
      );
      assert(
        await page.locator("[data-testid='layout-return-to-editor']").evaluate((link) =>
          !link.closest(".card") && getComputedStyle(link.parentElement!).position === "fixed" &&
          getComputedStyle(link.parentElement!).bottom !== "auto" &&
          getComputedStyle(link.parentElement!).right !== "auto"
        ),
        "Expected a bottom-right Return to Editor link outside the settings card",
      );
      const saveResponse = await saveResponsePromise;
      assert(
        saveResponse.ok(),
        `Expected project goal save to succeed, got ${saveResponse.status()}`,
      );
      await page.getByText("Project goals saved.").waitFor();

      await page.goto(new URL("/goal", page.url()).toString());
      await page.getByText("Browser Test Manuscript").waitFor();
      const editGoalLink = page.getByRole("link", { name: "Edit", exact: true });
      assert(await editGoalLink.isVisible(), "Expected an inline Edit link beside the goal count");
      assert(
        await editGoalLink.evaluate((link) =>
          link.closest(".counts") !== null && link.classList.contains("button--small") &&
          !link.classList.contains("button--primary")
        ),
        "Expected the goal edit link to use the small default button style inline with the goal count",
      );
      assert(
        await page.locator(".card a[href='/']").count() === 0,
        "Expected no in-card Return to Editor link on the Goal page",
      );
      assert(
        await page.getByTestId("layout-return-to-editor").isVisible(),
        "Expected the shared Return to Editor footer to remain outside the card",
      );
      const progress = page.getByRole("progressbar", { name: "Manuscript word goal" });
      const values = await progress.evaluate((element) => {
        const bar = element as HTMLProgressElement;
        return { value: bar.value, max: bar.max };
      });
      assert(
        values.value === 40_000 && values.max === 90_000,
        `Expected active manuscript progress to use the saved project goal: ${
          JSON.stringify(values)
        }`,
      );
      assert(
        await page.getByText("50,000 words to go (44.4% complete).").isVisible(),
        "Expected the remaining manuscript word count to be displayed",
      );
      assert(await page.getByText("Last 30 days").isVisible());
      assert(await page.locator(".history li").count() === 30);
      const streaks = await page.locator(".streaks dd").allTextContents();
      assert(streaks[0] === "3 days", `Expected a three-day writing streak, got ${streaks[0]}`);
      assert(streaks[1] === "2 days", `Expected a two-day goal streak, got ${streaks[1]}`);
      assert(
        await page.getByText(/At your average of 1,050 words per day over 4 tracked days/)
          .isVisible(),
        "Expected the completion estimate to use the available 30-day calendar history",
      );

      await page.goto(new URL("/", page.url()).toString());
      const updatedGoals = page.getByTestId("manuscript-goals-link");
      await updatedGoals.waitFor();
      const updatedProgress = await updatedGoals.getByRole("progressbar", {
        name: "Manuscript word-goal progress",
      }).evaluate((element) => {
        const bar = element as HTMLProgressElement;
        return { value: bar.value, max: bar.max };
      });
      assert(
        updatedProgress.value === 40_000 && updatedProgress.max === 90_000,
        "Expected the Goals button to use the updated project goal after returning to the editor",
      );
    },
    { projectSettingsAvailable: true, fakeLoadedProject: true, dailyHistory: history },
  );
});

browserTest("browser: project settings and goal explain when no project is open", async () => {
  await withEditorPage(async (page) => {
    await page.getByRole("button", { name: "Menu" }).click();
    await page.getByRole("menuitem", { name: "Project Settings" }).click();
    await page.locator("[data-project-required]").waitFor();
    assert(
      await page.getByText("Open a project to configure its word goals.").isVisible(),
    );

    await page.goto(new URL("/goal", page.url()).toString());
    await page.locator("[data-project-required]").waitFor();
    assert(
      await page.getByText("Open a project to view its manuscript word-goal progress.").isVisible(),
    );
  });
});

browserTest("browser: editor header and footer are compact and equally sized", async () => {
  await withEditorPage(async (page) => {
    const measurements = await page.evaluate(() => {
      const header = document.querySelector("header.topbar");
      const toolbar = document.querySelector('[role="toolbar"]');
      const footer = document.querySelector("footer.statusbar");
      const title = document.querySelector<HTMLInputElement>("#manuscript-title");
      const saveStatus = document.querySelector("#save-status");
      const titleGroup = document.querySelector(".titleGroup");
      const menu = document.querySelector(".right");
      if (
        !header || !toolbar || !footer || !title || !saveStatus || !titleGroup ||
        !menu
      ) {
        return null;
      }
      const titleRect = title.getBoundingClientRect();
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
        saveStatusCenterY: saveStatusRect.top + saveStatusRect.height / 2,
        titleLeft: titleRect.left,
        titleRight: titleRect.right,
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
      measurements.titleRight <= measurements.saveStatusLeft,
      "Expected the title and saved status to appear left-to-right",
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
      Math.abs(measurements.titleCenterY - measurements.saveStatusCenterY) < 2,
      "Expected the title and save status to be inline and vertically aligned",
    );
    assert(
      await page.locator("#filename").count() === 0,
      "Expected the EPUB filename to be hidden from the editor header",
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

browserTest("browser: quiet buttons underline and status stats emphasize counts", async () => {
  await withEditorPage(async (page) => {
    const styles = await page.locator(".statusbar button.button--quiet").first().evaluate(
      (button) => {
        const keyboardShortcut = button.querySelector("kbd");
        return {
          buttonDecoration: getComputedStyle(button).textDecorationLine,
          keyboardShortcutDisplay: keyboardShortcut && getComputedStyle(keyboardShortcut).display,
          keyboardShortcutDecoration: keyboardShortcut &&
            getComputedStyle(keyboardShortcut).textDecorationLine,
          statsUseTabularNumbers: (() => {
            const value = document.querySelector(".statusbar .statValue");
            return value !== null &&
              getComputedStyle(value).fontVariantNumeric.includes("tabular-nums") &&
              Number(getComputedStyle(value).fontWeight) >= 600;
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
    assert(styles.statsUseTabularNumbers, "Expected counts to use emphasized tabular numbers");
  });
});

browserTest("browser: menu opens projects without standalone manuscript actions", async () => {
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
      (await menu.locator("#menu-new-project").textContent())?.includes("New Project"),
      "Expected New Project action",
    );
    assert(
      (await menu.locator("#menu-new-project kbd").textContent())?.trim() === "Ctrl+N",
      "Expected New Project shortcut hint",
    );
    assert(
      (await menu.locator("#menu-open-project").textContent())?.includes("Open Project"),
      "Expected Open Project action",
    );
    assert(
      (await menu.locator("#menu-open-project kbd").textContent())?.trim() === "Ctrl+O",
      "Expected Open Project shortcut hint",
    );
    assert(await menu.locator("#menu-new-manuscript").count() === 0);
    assert(await menu.locator("#menu-open-manuscript").count() === 0);
    assert(
      await page.locator('input[type="file"]').count() === 0,
      "Expected no browser file picker",
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
        "Project Settings",
      "Expected toolbar toggle directly below Project Settings",
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
  });
});

browserTest("browser: editor content never mixes text with block siblings", async () => {
  await withEditorPage(async (page) => {
    await page.locator(PANEL).waitFor({ state: "attached" });
    await page.keyboard.press("Control+Shift+a");

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
  });
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

browserTest("browser: welcome page offers a clear styled project creation dialog", async () => {
  await withEditorPage(async (page) => {
    await page.goto(new URL("/welcome", page.url()).href);
    assert(await page.locator("#welcome-project-open").isVisible());
    assert(await page.locator("#welcome-project-new").isVisible());
    assert(await page.locator("#welcome-new").count() === 0);
    assert(await page.locator("#welcome-sample").count() === 0);

    await page.locator("#welcome-project-new").click();
    const dialog = page.locator("#create-project-dialog");
    assert(await dialog.isVisible(), "Expected project creation to use the styled dialog");
    assert(
      (await dialog.textContent())?.includes(
        "Writasaurus will make a new folder there and put the EPUB manuscript inside it.",
      ),
      "Expected the dialog to explain the parent folder selection",
    );
    assert(await dialog.locator("#project-name").isVisible());
    assert(await dialog.locator("#choose-project-location").isVisible());
    assert(await dialog.locator("#create-project-submit").isDisabled());
  });
});

browserTest(
  "browser: outline mode creates, autosaves, and replaces project Markdown",
  async () => {
    const directory = await Deno.makeTempDir();
    const previousActivePath = getActivePath();
    const previousSavedPath = await loadLastFilePath();
    const epubPath = `${directory}/story.epub`;

    try {
      await Deno.writeFile(epubPath, await generateEpub(blankManuscript("Story")));
      await setActivePath(epubPath);
      await withEditorPage(async (page) => {
        const modeSwitch = page.getByRole("group", { name: "Project view" });
        const manuscriptOption = page.locator('[data-project-mode="manuscript"]');
        const outlineOption = page.locator('[data-project-mode="outline"]');
        assert(await manuscriptOption.isDisabled(), "Expected Manuscript to be selected");
        assert(!(await outlineOption.isDisabled()), "Expected Outline to be available");
        assert(
          await manuscriptOption.getAttribute("aria-pressed") === "true" &&
            await outlineOption.getAttribute("aria-pressed") === "false",
          "Expected Manuscript to be visibly selected in the mode switch",
        );
        assert(await modeSwitch.isVisible(), "Expected the always-visible project mode switch");

        await outlineOption.click();
        await page.waitForFunction(() => !document.querySelector("#chapter-title"));
        assert(
          await outlineOption.getAttribute("aria-pressed") === "true",
          "Expected Outline to become selected",
        );
        await page.keyboard.press("Control+g");
        await page.waitForSelector("#chapter-title");
        assert(
          await manuscriptOption.getAttribute("aria-pressed") === "true",
          "Expected Ctrl+G to switch from Outline to Manuscript",
        );
        await page.keyboard.press("Control+g");
        await page.waitForFunction(() => !document.querySelector("#chapter-title"));
        assert(
          await outlineOption.getAttribute("aria-pressed") === "true",
          "Expected Ctrl+G to switch from Manuscript to Outline",
        );
        assert(await page.getByRole("textbox", { name: "Outline text" }).isVisible());
        assert(await page.locator('[data-testid="chapters-sidebar"]').count() === 0);
        assert(await page.locator('[data-testid="assistance-panel"]').count() === 0);
        assert(await page.locator("[data-outline-template-trigger]").isVisible());
        assert(
          await page.getByRole("button", { name: "Change Template" }).isVisible(),
          "Expected the template selector to use its updated label",
        );
        const templatePosition = await page.evaluate(() => {
          const trigger = document.querySelector("[data-outline-template-trigger]");
          const toolbar = document.querySelector('[role="toolbar"]');
          if (!trigger || !toolbar) return null;
          const triggerRect = trigger.getBoundingClientRect();
          const toolbarRect = toolbar.getBoundingClientRect();
          return {
            triggerRight: triggerRect.right,
            toolbarRight: toolbarRect.right,
            otherToolbarButtonRights: [...toolbar.querySelectorAll("button")]
              .filter((button) => button !== trigger && button.getClientRects().length > 0)
              .map((button) => button.getBoundingClientRect().right),
          };
        });
        assert(templatePosition, "Expected template selector and toolbar");
        assert(
          templatePosition.otherToolbarButtonRights.every((right) =>
            right <= templatePosition.triggerRight
          ) && templatePosition.triggerRight <= templatePosition.toolbarRight,
          "Expected the template selector to align after the other toolbar controls",
        );
        await page.evaluate(() => {
          document.documentElement.dataset.font = "georgia";
          document.documentElement.style.setProperty(
            "--editor-font",
            'Georgia, "Times New Roman", serif',
          );
        });
        const outlineFonts = await page.locator("#editor").evaluate((editor) => ({
          editor: getComputedStyle(editor).fontFamily,
          heading: getComputedStyle(editor.querySelector("h1")!).fontFamily,
        }));
        assert(
          outlineFonts.editor.toLowerCase().includes("georgia") &&
            outlineFonts.heading.toLowerCase().includes("georgia"),
          `Expected outline text and headings to match the editor font preference, got ${outlineFonts.editor} and ${outlineFonts.heading}`,
        );
        const outlineStyling = await page.locator("#editor").evaluate((editor) => {
          const heading = editor.querySelector("h1");
          const section = editor.querySelector("h2");
          const note = editor.querySelector("blockquote");
          if (!heading || !section || !note) return null;
          return {
            headingBorder: getComputedStyle(heading).borderBottomWidth,
            sectionMargin: getComputedStyle(section).marginTop,
            noteBorder: getComputedStyle(note).borderLeftWidth,
            noteBackground: getComputedStyle(note).backgroundColor,
          };
        });
        assert(outlineStyling, "Expected major headings, sections, and guidance notes");
        assert(
          outlineStyling.headingBorder === "1px" &&
            outlineStyling.sectionMargin === "32px" &&
            outlineStyling.noteBorder === "3px" &&
            outlineStyling.noteBackground !== "rgba(0, 0, 0, 0)",
          "Expected outline headings to be separated and guidance notes to have a distinct treatment",
        );
        assert(
          (await Deno.readTextFile(`${directory}/Outline.md`)).includes("# Act I - Setup"),
          "Expected selecting Outline to immediately create the default template",
        );

        const editor = page.locator("#editor");
        await editor.fill("Custom outline content");
        await page.waitForFunction(() =>
          document.querySelector("#editor")?.textContent?.includes("Custom outline content")
        );
        for (let attempt = 0; attempt < 40; attempt++) {
          try {
            if (
              (await Deno.readTextFile(`${directory}/Outline.md`)).includes(
                "Custom outline content",
              )
            ) break;
          } catch (error) {
            if (!(error instanceof Deno.errors.NotFound)) throw error;
          }
          if (attempt === 39) throw new Error("Outline edits were not autosaved.");
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        await page.locator("[data-outline-template-trigger]").click();
        await page.getByRole("menuitem", { name: "4-Act Structure" }).click();
        const confirmation = page.getByRole("dialog", { name: "Replace outline content?" });
        assert(await confirmation.isVisible(), "Expected template replacement confirmation");
        await confirmation.getByRole("button", { name: "Cancel" }).click();
        assert(
          (await Deno.readTextFile(`${directory}/Outline.md`)).includes("Custom outline content"),
          "Canceling template replacement must retain the current outline",
        );

        await page.locator("[data-outline-template-trigger]").click();
        await page.getByRole("menuitem", { name: "4-Act Structure" }).click();
        await page.getByRole("button", { name: "Replace outline" }).click();
        assert(
          (await page.locator("#editor").textContent())?.includes("Act IV - Resolution"),
          "Expected the selected template to replace the editor content",
        );

        await page.locator('[data-project-mode="manuscript"]').click();
        await page.waitForSelector("#chapter-title");
        assert(await page.locator('[data-testid="chapters-sidebar"]').count() === 1);
        assert(
          (await Deno.readTextFile(`${directory}/Outline.md`)).includes("Act IV - Resolution"),
          "Expected the replaced outline template to autosave before switching modes",
        );
      }, { useDesktopStatus: true });
    } finally {
      if (previousActivePath) await setActivePath(previousActivePath);
      else if (previousSavedPath) await setActivePath(previousSavedPath);
      else await closeActiveFile();
      await Deno.remove(directory, { recursive: true });
    }
  },
);
