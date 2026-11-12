import { expect, test } from "vitest";
import { parseEpub } from "../../src/lib/epub.ts";
import { createProject, openSidebar, projectText, withEditorPage } from "./editor_helpers.ts";

test("creating a project writes an EPUB and renders the editor", async () => {
  await withEditorPage(async (page) => {
    await createProject(page);
    expect(await page.locator("#manuscript-title").inputValue()).toBe("Test Novel");
    const files = await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const parent = await root.getDirectoryHandle("projects");
      const project = await parent.getDirectoryHandle("Test Novel");
      const names: string[] = [];
      for await (const name of project.keys()) names.push(name);
      return names;
    });
    expect(files).toContain("draft_1.epub");
    expect(files).toContain("settings.json");
  });
});

test("the browser menu has no native Quit action", async () => {
  await withEditorPage(async (page) => {
    await createProject(page);
    await page.locator("#menu-toggle").click();
    expect(await page.getByRole("menuitem", { name: "Quit", exact: true }).count()).toBe(0);
  });
});

test("opening an existing project restores its saved manuscript after reload", async () => {
  await withEditorPage(async (page) => {
    await createProject(page);
    await page.locator("#editor").fill("A story saved in the project.");
    await page.keyboard.press("Control+s");
    await expect.poll(() => page.locator("#save-status").textContent()).toContain("Saved");
    await page.reload();
    await page.waitForSelector('[data-ready="true"]');
    expect(await page.locator("#editor").textContent()).toContain("A story saved in the project.");

    await page.goto("/editor/welcome");
    await page.evaluate(() => localStorage.setItem("test-picker", "Test Novel"));
    await page.locator("#welcome-project-open").click();
    await page.waitForSelector('[data-ready="true"]');
    expect(await page.locator("#editor").textContent()).toContain("A story saved in the project.");
  });
});

test("drafts copy edits, switch independently, and retain the selection after reload", async () => {
  await withEditorPage(async (page) => {
    await createProject(page);
    await page.locator("#editor").fill("First draft text");
    await openSidebar(page);
    await page.locator("[data-draft-selector]").click();
    await page.getByRole("menuitem", { name: "Create new draft…" }).click();
    await page.getByRole("button", { name: "Create Draft", exact: true }).click();
    await expect
      .poll(() => page.locator("[data-draft-selector]").textContent())
      .toContain("Draft 2");
    expect(await page.locator("#editor").textContent()).toContain("First draft text");
    await page.locator("#editor").fill("Second draft text");
    await page.keyboard.press("Control+s");
    await expect.poll(() => page.locator("#save-status").textContent()).toContain("Saved");
    await page.locator("[data-draft-selector]").click();
    await page.getByRole("menuitemradio", { name: "Draft 1" }).click();
    await expect.poll(() => page.locator("#editor").textContent()).toContain("First draft text");
    await page.reload();
    await page.waitForSelector('[data-ready="true"]');
    await openSidebar(page);
    expect(await page.locator("[data-draft-selector]").textContent()).toContain("Draft 1");
    await page.locator("[data-draft-selector]").click();
    await page.getByRole("menuitemradio", { name: "Draft 2" }).click();
    await expect.poll(() => page.locator("#editor").textContent()).toContain("Second draft text");
  });
});

test("outline creates a template, autosaves edits, and confirms replacement", async () => {
  await withEditorPage(async (page) => {
    await createProject(page);
    await page.locator('[data-project-mode="outline"]').click();
    await page.getByRole("textbox", { name: "Outline text" }).waitFor();
    await expect
      .poll(() => projectText(page, "Outline.md"), { timeout: 10_000 })
      .toContain("# Act I - Setup");
    await page.locator("#editor").fill("Custom outline content");
    await expect
      .poll(() => projectText(page, "Outline.md"), { timeout: 10_000 })
      .toContain("Custom outline content");
    await page.locator("[data-outline-template-trigger]").click();
    await page.getByRole("menuitem", { name: "4-Act Structure" }).click();
    await page
      .getByRole("dialog", { name: "Replace outline content?" })
      .getByRole("button", { name: "Cancel" })
      .click();
    expect(await projectText(page, "Outline.md")).toContain("Custom outline content");
    await page.locator("[data-outline-template-trigger]").click();
    await page.getByRole("menuitem", { name: "4-Act Structure" }).click();
    await page.getByRole("button", { name: "Replace outline" }).click();
    await page.locator('[data-project-mode="manuscript"]').click();
    await page.locator("#chapter-title").waitFor();
    await expect
      .poll(() => projectText(page, "Outline.md"), { timeout: 10_000 })
      .toContain("Act IV - Resolution");
    await page.keyboard.press("Control+g");
    await expect.poll(() => page.locator("#editor").textContent()).toContain("Act IV - Resolution");
  });
});

test("export downloads an EPUB containing the current editor content", async () => {
  await withEditorPage(async (page) => {
    await createProject(page);
    await page.evaluate(() => {
      Object.defineProperty(globalThis, "showSaveFilePicker", {
        configurable: true,
        value: undefined,
      });
      const original = URL.createObjectURL;
      URL.createObjectURL = (blob) => {
        if (blob instanceof Blob) {
          (globalThis as typeof globalThis & { testExportBlob?: Blob }).testExportBlob = blob;
        }
        return original.call(URL, blob);
      };
    });
    await page.locator("#editor").fill("Exported story text");
    await page.locator("#menu-toggle").click();
    const pending = page.waitForEvent("download");
    await page.locator("#menu-save-epub").click();
    const download = await pending;
    expect(download.suggestedFilename()).toMatch(/\.epub$/i);
    expect(await download.failure()).toBeNull();
    // The test environment's Playwright download artifact stream is empty even for a
    // trivial Blob download. Inspect the exact Blob passed to createObjectURL instead.
    const bytes = await page.evaluate(async () => {
      const blob = (globalThis as typeof globalThis & { testExportBlob?: Blob }).testExportBlob;
      if (!blob) throw new Error("Export did not create a Blob");
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    });
    expect(bytes.slice(0, 4)).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const manuscript = await parseEpub(new Uint8Array(bytes), "export.epub");
    expect(manuscript.chapters[0].content).toContain("Exported story text");
  });
});

test("export writes the selected EPUB and cancellation leaves it unchanged", async () => {
  await withEditorPage(async (page) => {
    await createProject(page);
    await page.locator("#editor").fill("Exported through picker");
    await page.locator("#menu-toggle").click();
    await page.locator("#menu-save-epub").click();
    await expect
      .poll(async () =>
        page.evaluate(async () => {
          try {
            const root = await navigator.storage.getDirectory();
            return (await (await root.getFileHandle("export.epub")).getFile()).size;
          } catch {
            return 0;
          }
        }),
      )
      .toBeGreaterThan(0);
    const bytes = await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const file = await (await root.getFileHandle("export.epub")).getFile();
      return Array.from(new Uint8Array(await file.arrayBuffer()));
    });
    expect(await page.evaluate(() => localStorage.getItem("test-export-name"))).toMatch(/\.epub$/i);
    const epub = await parseEpub(new Uint8Array(bytes), "export.epub");
    expect(epub.chapters[0].content).toContain("Exported through picker");
    await page.evaluate(() => localStorage.setItem("test-save-picker", "cancel"));
    await page.locator("#editor").fill("Cancelled export");
    await page.locator("#menu-toggle").click();
    await page.locator("#menu-save-epub").click();
    const after = await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const file = await (await root.getFileHandle("export.epub")).getFile();
      return Array.from(new Uint8Array(await file.arrayBuffer()));
    });
    expect(after).toEqual(bytes);
  });
});

test("sections can be added and the editor keeps formatting and undo behavior", async () => {
  await withEditorPage(async (page) => {
    await createProject(page);
    const editor = page.locator("#editor");
    await editor.fill("Some bold text");
    await editor.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const selection = getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
    await page.locator('button[data-command="bold"]').click();
    expect(await editor.locator("strong, b").textContent()).toContain("Some bold text");
    await page.keyboard.press("Control+z");
    expect(await editor.textContent()).toContain("Some bold text");
    await openSidebar(page);
    const sections = page.locator("[data-drag-item]");
    const initial = await sections.count();
    await page
      .getByRole("complementary", { name: "Book sections" })
      .getByRole("button", { name: "Add" })
      .click();
    await page.getByRole("menuitem", { name: "Chapter", exact: true }).click();
    await expect.poll(() => sections.count()).toBe(initial + 1);
    expect(await page.locator("#chapter-title").inputValue()).toBe(`Chapter ${initial + 1}`);
  });
});

test("chapter and total statistics update while writing and follow section titles", async () => {
  await withEditorPage(async (page) => {
    await createProject(page);
    await page.locator("#editor").fill("Four simple story words");
    const chapter = page.locator('[data-stat="chapter"]');
    const total = page.locator('[data-stat="total"]');
    await expect.poll(() => chapter.textContent()).toContain("4");
    expect(await total.textContent()).toContain("4");
    await page.getByLabel("Chapter title").fill("Prologue");
    await expect.poll(() => chapter.textContent()).toContain("Prologue");
  });
});

test("Tab inserts a tab character rather than moving focus", async () => {
  await withEditorPage(async (page) => {
    await createProject(page);
    await page.locator("#editor").click();
    await page.keyboard.press("End");
    await page.keyboard.press("Tab");
    await page.keyboard.type("Indented");
    expect(await page.locator("#editor").textContent()).toContain("\tIndented");
  });
});

test("picker cancellation is harmless and picker errors are reported", async () => {
  await withEditorPage(async (page) => {
    await page.evaluate(() => localStorage.setItem("test-picker", "cancel"));
    await page.locator("#welcome-project-open").click();
    expect(await page.locator("#welcome-project-open").isVisible()).toBe(true);
    await page.locator("#welcome-project-new").click();
    await page.locator("#choose-project-location").click();
    expect(await page.locator("#create-project-submit").isDisabled()).toBe(true);
    await page
      .getByRole("dialog", { name: "Create New Project" })
      .getByRole("button", { name: "Cancel" })
      .click();
    await page.evaluate(() => localStorage.setItem("test-picker", "error"));
    const dialog = page.waitForEvent("dialog");
    const click = page.locator("#welcome-project-open").click();
    const error = await dialog;
    expect(error.message()).toContain("Picker denied");
    await error.accept();
    await click;
    expect(await page.locator("#welcome-project-open").isVisible()).toBe(true);
  });
});

test("unsupported browsers explain folder access and do not start project operations", async () => {
  await withEditorPage(
    async (page) => {
      await page
        .getByRole("alert")
        .filter({ hasText: "This browser does not support project folders" })
        .waitFor();
      const dialog = page.waitForEvent("dialog");
      const click = page.locator("#welcome-project-open").click();
      const error = await dialog;
      expect(error.message()).toContain("does not support project folders");
      await error.accept();
      await click;
      expect(new URL(page.url()).pathname).toBe("/editor/welcome");
      await page.locator("#welcome-project-new").click();
      await page.locator("#choose-project-location").click();
      const creation = page.getByRole("dialog", { name: "Create New Project" });
      await creation
        .getByRole("alert")
        .filter({ hasText: "does not support project folders" })
        .waitFor();
      expect(await page.locator("#create-project-submit").isDisabled()).toBe(true);
    },
    { directoryPicker: false },
  );
});

test("opening an empty folder asks before creating its first draft", async () => {
  await withEditorPage(async (page) => {
    await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const parent = await root.getDirectoryHandle("projects", { create: true });
      await parent.getDirectoryHandle("Empty", { create: true });
      localStorage.setItem("test-picker", "Empty");
    });
    const denied = page.waitForEvent("dialog");
    const cancelClick = page.locator("#welcome-project-open").click();
    expect((await denied).message()).toContain("does not contain an EPUB");
    await (await denied).dismiss();
    await cancelClick;
    expect(await page.locator("#welcome-project-open").isVisible()).toBe(true);
    const accepted = page.waitForEvent("dialog");
    const acceptClick = page.locator("#welcome-project-open").click();
    await (await accepted).accept();
    await acceptClick;
    await page.waitForSelector('[data-ready="true"]');
    expect(await page.locator("#manuscript-title").inputValue()).toBe("Empty");
  });
});

test("creating a project does not overwrite an existing folder", async () => {
  await withEditorPage(async (page) => {
    await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const parent = await root.getDirectoryHandle("projects", { create: true });
      const project = await parent.getDirectoryHandle("Test Novel", { create: true });
      const file = await project.getFileHandle("keep.txt", { create: true });
      const writable = await file.createWritable();
      await writable.write("do not overwrite");
      await writable.close();
    });
    await page.locator("#welcome-project-new").click();
    await page.locator("#project-name").fill("Test Novel");
    await page.locator("#choose-project-location").click();
    await page.getByTestId("project-parent-path").waitFor();
    await page.locator("#create-project-submit").click();
    await page.getByRole("alert").waitFor();
    expect(await projectText(page, "keep.txt")).toBe("do not overwrite");
  });
});

test("failed saves retain unsaved edits and recover when writes are allowed", async () => {
  await withEditorPage(async (page) => {
    await createProject(page);
    await page.evaluate(() => localStorage.setItem("test-fail-write", "draft_1.epub"));
    await page.locator("#editor").fill("Do not lose this text");
    await page.keyboard.press("Control+s");
    await expect.poll(() => page.locator("#save-status").textContent()).toContain("Save failed");
    expect(await page.locator("#editor").textContent()).toContain("Do not lose this text");
    await page.evaluate(() => localStorage.removeItem("test-fail-write"));
    await page.keyboard.press("Control+s");
    await expect.poll(() => page.locator("#save-status").textContent()).toContain("Saved");
    await page.reload();
    await page.waitForSelector('[data-ready="true"]');
    expect(await page.locator("#editor").textContent()).toContain("Do not lose this text");
  });
});

test("cache write failures warn independently of disk saves and recover on retry", async () => {
  await withEditorPage(async (page) => {
    await createProject(page);
    const cacheBefore = await page.evaluate(() =>
      sessionStorage.getItem("writasaurus-manuscript-v1:state"),
    );
    expect(cacheBefore).not.toBeNull();
    await page.evaluate(() => localStorage.setItem("test-fail-cache", "true"));
    await page.locator("#editor").fill("Saved despite cache failure");
    const warning = page.getByRole("alert").filter({ hasText: /cache|reload/i });
    await warning.waitFor();
    await page.keyboard.press("Control+s");
    await expect.poll(() => page.locator("#save-status").textContent()).toContain("Saved");
    expect(await warning.isVisible()).toBe(true);
    expect(
      await page.evaluate(() => sessionStorage.getItem("writasaurus-manuscript-v1:state")),
    ).toBe(cacheBefore);

    const bytes = await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const parent = await root.getDirectoryHandle("projects");
      const project = await parent.getDirectoryHandle("Test Novel");
      const file = await (await project.getFileHandle("draft_1.epub")).getFile();
      return Array.from(new Uint8Array(await file.arrayBuffer()));
    });
    const disk = await parseEpub(new Uint8Array(bytes), "draft_1.epub");
    expect(disk.chapters[0].content).toContain("Saved despite cache failure");

    await page.evaluate(() => localStorage.removeItem("test-fail-cache"));
    await page.locator("#editor").fill("Cache is working again");
    await warning.waitFor({ state: "hidden" });
    await page.keyboard.press("Control+s");
    await expect.poll(() => page.locator("#save-status").textContent()).toContain("Saved");
    await page.reload();
    await page.waitForSelector('[data-ready="true"]');
    expect(await page.locator("#editor").textContent()).toContain("Cache is working again");
  });
});

test("stale cached edits recover detached without overwriting a newer disk save", async () => {
  await withEditorPage(async (page) => {
    await createProject(page);
    await page.locator("#editor").fill("Cached version A");
    await expect
      .poll(() => page.evaluate(() => sessionStorage.getItem("writasaurus-manuscript-v1:state")))
      .toContain("Cached version A");
    await page.evaluate(() => localStorage.setItem("test-fail-cache", "true"));
    await page.locator("#editor").fill("Newer disk version B");
    await page
      .getByRole("alert")
      .filter({ hasText: /reload/i })
      .waitFor();
    await page.keyboard.press("Control+s");
    await expect.poll(() => page.locator("#save-status").textContent()).toContain("Saved");
    await page.reload();
    await page.waitForSelector('[data-ready="true"]');
    expect(await page.locator("#editor").textContent()).toContain("Cached version A");
    await page
      .getByRole("alert")
      .filter({ hasText: "Recovered changes are disconnected" })
      .waitFor();
    const bytes = await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const parent = await root.getDirectoryHandle("projects");
      const project = await parent.getDirectoryHandle("Test Novel");
      const file = await (await project.getFileHandle("draft_1.epub")).getFile();
      return Array.from(new Uint8Array(await file.arrayBuffer()));
    });
    const disk = await parseEpub(new Uint8Array(bytes), "draft_1.epub");
    expect(disk.chapters[0].content).toContain("Newer disk version B");
    await page.locator("#menu-toggle").click();
    expect(await page.locator("#menu-save-epub").isVisible()).toBe(true);
  });
});

test("a whitespace-only cache difference still disconnects recovery", async () => {
  await withEditorPage(async (page) => {
    await createProject(page);
    await page.locator("#editor").fill("Saved chapter");
    await page.keyboard.press("Control+s");
    await expect.poll(() => page.locator("#save-status").textContent()).toContain("Saved");
    await page.evaluate(() => {
      const key = "writasaurus-manuscript-v1:state";
      const saved = JSON.parse(sessionStorage.getItem(key)!);
      saved.manuscript.chapters[0].content += " ";
      saved.hasUnsavedChanges = true;
      sessionStorage.setItem(key, JSON.stringify(saved));
    });
    await page.reload();
    await page.waitForSelector('[data-ready="true"]');
    await page
      .getByRole("alert")
      .filter({ hasText: "Recovered changes are disconnected" })
      .waitFor();
    expect(await page.locator('[data-project-mode="outline"]').isDisabled()).toBe(true);
  });
});

test("outline read failures explain why cached recovery is disconnected", async () => {
  await withEditorPage(async (page) => {
    await createProject(page);
    await page.locator('[data-project-mode="outline"]').click();
    await page.getByRole("textbox", { name: "Outline text" }).waitFor();
    await page.locator('[data-project-mode="manuscript"]').click();
    await page.locator("#chapter-title").waitFor();
    await page.evaluate(() => {
      const key = "writasaurus-manuscript-v1:state";
      const saved = JSON.parse(sessionStorage.getItem(key)!);
      saved.outlineContent = "Recovered outline";
      saved.outlineHasUnsavedChanges = true;
      saved.editorMode = "outline";
      sessionStorage.setItem(key, JSON.stringify(saved));
      localStorage.setItem("test-fail-read", "Outline.md");
    });
    await page.reload();
    await page.waitForSelector('[data-ready="true"]');
    const warning = page.getByRole("alert").filter({ hasText: "Test outline read denied" });
    await warning.waitFor();
    expect(await warning.textContent()).toContain("disconnected");
    expect(await page.locator("#editor").textContent()).toContain("Recovered outline");
    await page.locator("#menu-toggle").click();
    expect(await page.getByRole("menuitem", { name: "Export Outline" }).isVisible()).toBe(true);
  });
});

for (const matchingProject of [true, false]) {
  test(`cached edits ${matchingProject ? "reconnect" : "stay detached"} when project identity ${
    matchingProject ? "matches" : "differs"
  }`, async () => {
    await withEditorPage(async (page) => {
      await createProject(page);
      await page.locator("#editor").fill("Saved project text");
      await page.keyboard.press("Control+s");
      await expect.poll(() => page.locator("#save-status").textContent()).toContain("Saved");
      await page.evaluate((matching) => {
        const key = "writasaurus-manuscript-v1:state";
        const saved = JSON.parse(sessionStorage.getItem(key)!);
        if (!matching) {
          saved.projectId = "different-project";
          saved.manuscript.chapters[0].content = "<p>Recovered cached text</p>";
        }
        saved.hasUnsavedChanges = true;
        sessionStorage.setItem(key, JSON.stringify(saved));
      }, matchingProject);
      await page.reload();
      await page.waitForSelector('[data-ready="true"]');
      expect(await page.locator("#editor").textContent()).toContain(
        matchingProject ? "Saved project text" : "Recovered cached text",
      );
      if (matchingProject) {
        expect(await page.locator('[data-project-mode="outline"]').isEnabled()).toBe(true);
      }
      if (!matchingProject) {
        expect(await page.locator("#save-status").textContent()).toContain(
          "Recovered unsaved changes",
        );
        const bytes = await page.evaluate(async () => {
          const root = await navigator.storage.getDirectory();
          const parent = await root.getDirectoryHandle("projects");
          const project = await parent.getDirectoryHandle("Test Novel");
          const file = await (await project.getFileHandle("draft_1.epub")).getFile();
          return Array.from(new Uint8Array(await file.arrayBuffer()));
        });
        const disk = await parseEpub(new Uint8Array(bytes), "draft_1.epub");
        expect(disk.chapters[0].content).toContain("Saved project text");
      }
    });
  });
}

test("restoring a project requests permission only from the reconnect button", async () => {
  await withEditorPage(async (page) => {
    await createProject(page);
    await page.evaluate(() => {
      localStorage.setItem("test-permission", "prompt");
      localStorage.setItem("test-permission-response", "denied");
    });
    await page.reload();
    const reconnect = page.getByRole("button", { name: "Reconnect project" });
    await reconnect.waitFor();
    expect(await page.evaluate(() => localStorage.getItem("test-permission-requested"))).toBeNull();
    await reconnect.click();
    await page.getByRole("alert").waitFor();
    expect(await reconnect.isVisible()).toBe(true);
    await page.evaluate(() => localStorage.setItem("test-permission-response", "granted"));
    await reconnect.click();
    await page.waitForSelector('[data-ready="true"]');
    expect(await page.locator("#manuscript-title").inputValue()).toBe("Test Novel");
  });
});
