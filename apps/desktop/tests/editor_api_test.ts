import { createTestApp } from "./helpers.ts";
import {
  closeActiveFile,
  DEFAULT_MANUSCRIPT_WORD_GOAL,
  getActivePath,
  getActiveProjectDetails,
  getProjectSettings,
  projectEpubPath,
  recordActiveProjectDailyProgress,
  setActivePath,
  updateActiveProjectSettings,
  updateProjectSettings,
} from "../src/lib/editor-session.ts";
import { loadLastFilePath } from "../src/lib/desktop.ts";
import { blankManuscript } from "../src/lib/editor/data.ts";
import { generateEpub } from "../src/lib/epub.ts";
import { GET as getProjectSettingsApi } from "../src/pages/api/editor/project-settings.ts";

function assert(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function createDesktopApp() {
  return createTestApp();
}

Deno.test("project: ignores legacy EPUBs without migrating them", async () => {
  const directory = await Deno.makeTempDir({ dir: "/tmp", prefix: "writasaurus-drafts-" });
  try {
    const epub = await generateEpub(blankManuscript("Legacy Book"));
    await Deno.writeFile(`${directory}/legacy-book.epub`, epub);
    assertEquals(await projectEpubPath(directory), null);
    const settings = JSON.parse(await Deno.readTextFile(`${directory}/settings.json`));
    assertEquals(settings.drafts.length, 0);
    assertEquals(settings.user_settings.manuscriptWordGoal, DEFAULT_MANUSCRIPT_WORD_GOAL);
    assertEquals(await Deno.stat(`${directory}/legacy-book.epub`).then(() => true), true);
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("project: user settings default, persist, and preserve draft metadata", async () => {
  const directory = await Deno.makeTempDir({ dir: "/tmp", prefix: "writasaurus-settings-" });
  try {
    await Deno.writeTextFile(
      `${directory}/settings.json`,
      JSON.stringify({ drafts: [{ number: 1, filename: "draft_1.epub" }] }),
    );
    const defaults = await getProjectSettings(directory);
    assertEquals(defaults.user_settings.manuscriptWordGoal, 80_000);
    assert(defaults.user_settings.dailyWordGoal > 0);
    assertEquals(defaults.drafts[0].filename, "draft_1.epub");

    const updated = await updateProjectSettings({
      manuscriptWordGoal: 95_000,
      dailyWordGoal: 2_000,
    }, directory);
    assertEquals(updated.user_settings.manuscriptWordGoal, 95_000);
    assertEquals(updated.user_settings.dailyWordGoal, 2_000);
    assertEquals(updated.drafts[0].filename, "draft_1.epub");
    const reloaded = await getProjectSettings(directory);
    assertEquals(reloaded.user_settings.manuscriptWordGoal, 95_000);
    assertEquals(reloaded.user_settings.dailyWordGoal, 2_000);

    for (const manuscriptWordGoal of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      let rejected = false;
      try {
        await updateProjectSettings({ manuscriptWordGoal }, directory);
      } catch (error) {
        rejected = error instanceof TypeError;
      }
      assert(rejected, `Expected ${manuscriptWordGoal} to be rejected`);
    }
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("project settings API: reports when there is no active project", async () => {
  const response = await getProjectSettingsApi();
  assertEquals(response.status, 409);
});

Deno.test("project: active project details include saved goal and manuscript word count", async () => {
  const directory = await Deno.makeTempDir({ dir: "/tmp", prefix: "writasaurus-project-" });
  const previousActivePath = getActivePath();
  const previousSavedPath = await loadLastFilePath();
  try {
    const manuscript = blankManuscript("Progress Test");
    manuscript.filename = "draft_1.epub";
    manuscript.chapters[0].content = "<p>one two three four</p>";
    manuscript.chapters[0].wordCount = 4;
    await Deno.writeFile(`${directory}/draft_1.epub`, await generateEpub(manuscript));
    await setActivePath(`${directory}/draft_1.epub`);

    const initial = await getActiveProjectDetails();
    assert(initial !== null);
    assertEquals(initial.manuscript.title, "Progress Test");
    assertEquals(initial.manuscript.totalWords, 4);
    assertEquals(initial.settings.user_settings.manuscriptWordGoal, 80_000);

    const firstProgress = await recordActiveProjectDailyProgress(initial.manuscript.id, 4);
    assert(firstProgress !== null);
    assertEquals(firstProgress.writtenWords, 0);
    const updatedProgress = await recordActiveProjectDailyProgress(initial.manuscript.id, 7);
    assert(updatedProgress !== null);
    assertEquals(updatedProgress.writtenWords, 3);
    assertEquals(updatedProgress.history.at(-1)?.words, 3);

    assert(
      await updateActiveProjectSettings({
        manuscriptWordGoal: 90_000,
        dailyWordGoal: 2_000,
      }),
    );
    const updated = await getActiveProjectDetails();
    assert(updated !== null);
    assertEquals(updated.settings.user_settings.manuscriptWordGoal, 90_000);
    assertEquals(updated.settings.user_settings.dailyWordGoal, 2_000);
    assertEquals(updated.manuscript.totalWords, 4);
  } finally {
    if (previousActivePath) await setActivePath(previousActivePath);
    else if (previousSavedPath) await setActivePath(previousSavedPath);
    else await closeActiveFile();
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("project: settings track numbered drafts and select the latest tracked draft", async () => {
  const directory = await Deno.makeTempDir({ dir: "/tmp", prefix: "writasaurus-drafts-" });
  try {
    const epub = await generateEpub(blankManuscript("Drafted Book"));
    await Deno.writeFile(`${directory}/draft_1.epub`, epub);
    await Deno.writeFile(`${directory}/draft_3.epub`, epub);
    assertEquals(await projectEpubPath(directory), `${directory}/draft_3.epub`);

    await Deno.writeFile(`${directory}/draft_5.epub`, epub);
    assertEquals(await projectEpubPath(directory), `${directory}/draft_3.epub`);
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("project: opening a project returns 204 if no folder is chosen", async () => {
  const app = createDesktopApp();
  const response = await app.request("/api/editor/project/open", {
    method: "POST",
    headers: { origin: "http://localhost" },
  });
  assertEquals(response.status, 204);
});

Deno.test("editor-api: status reports active file properties", async () => {
  const app = createDesktopApp();
  const res = await app.request("/api/editor/status");
  assertEquals(res.status, 200);
  const data = await res.json();
  assert(!("isDesktop" in data));
  assert(data.activeFile === null || typeof data.activeFile === "string");
  assert(data.activePath === null || typeof data.activePath === "string");
});

Deno.test("editor-api: close resets active file state", async () => {
  const app = createDesktopApp();
  const closeRes = await app.request("/api/editor/close", {
    method: "POST",
    headers: { origin: "http://localhost" },
  });
  assertEquals(closeRes.status, 200);
  const closeData = await closeRes.json();
  assertEquals(closeData.ok, true);

  const statusRes = await app.request("/api/editor/status");
  assertEquals(statusRes.status, 200);
  const statusData = await statusRes.json();
  assertEquals(statusData.activeFile, null);
  assertEquals(statusData.activePath, null);
});

Deno.test("editor-api: save validates request payload", async () => {
  const app = createDesktopApp();
  const invalidPayloads = [
    null,
    {},
    { content: 123 },
    { other: "field" },
  ];

  for (const payload of invalidPayloads) {
    const res = await app.request("/api/editor/save", {
      method: "POST",
      headers: {
        origin: "http://localhost",
        "content-type": "application/json",
      },
      body: payload ? JSON.stringify(payload) : "not-json",
    });
    assertEquals(res.status, 400);
    assertEquals(await res.text(), "Invalid manuscript content");
  }
});

Deno.test("editor-api: save returns 204 if no file chosen", async () => {
  const app = createDesktopApp();
  await app.request("/api/editor/close", {
    method: "POST",
    headers: { origin: "http://localhost" },
  });

  const res = await app.request("/api/editor/save", {
    method: "POST",
    headers: {
      origin: "http://localhost",
      "content-type": "application/json",
    },
    body: JSON.stringify({ content: "Some content" }),
  });
  assertEquals(res.status, 204);
});

Deno.test("editor-api: exit invokes the configured desktop shutdown callback", async () => {
  let exitCalled = false;
  const app = createTestApp({
    exit: () => {
      exitCalled = true;
    },
  });
  const res = await app.request("/api/editor/exit", {
    method: "POST",
    headers: { origin: "http://localhost" },
  });
  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.ok, true);
  await new Promise((resolve) => setTimeout(resolve, 60));
  assertEquals(exitCalled, true);
});

Deno.test("editor-api: save-epub validates request payload", async () => {
  const app = createDesktopApp();
  const invalidPayloads = [
    null,
    {},
    { manuscript: "not-an-object" },
    { manuscript: { chapters: "not-an-array" } },
  ];

  for (const payload of invalidPayloads) {
    const res = await app.request("/api/editor/save-epub", {
      method: "POST",
      headers: {
        origin: "http://localhost",
        "content-type": "application/json",
      },
      body: payload ? JSON.stringify(payload) : "not-json",
    });
    assertEquals(res.status, 400);
    assertEquals(await res.text(), "Invalid manuscript data");
  }
});

Deno.test("editor-api: outline save validates request payload", async () => {
  const app = createDesktopApp();
  const response = await app.request("/api/editor/outline/save", {
    method: "POST",
    headers: {
      origin: "http://localhost",
      "content-type": "application/json",
    },
    body: JSON.stringify({ content: 123 }),
  });
  assertEquals(response.status, 400);
  assertEquals(await response.text(), "Invalid outline content");
});

Deno.test("editor-api: save-epub returns 204 if no file chosen", async () => {
  const app = createDesktopApp();
  const res = await app.request("/api/editor/save-epub", {
    method: "POST",
    headers: {
      origin: "http://localhost",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      manuscript: {
        filename: "test.md",
        frontmatter: { title: "Test Book" },
        chapters: [{ id: "1", title: "Ch 1", content: "<p>Text</p>", wordCount: 1, charCount: 4 }],
      },
    }),
  });
  assertEquals(res.status, 204);
});

Deno.test("project: create requires a project folder name", async () => {
  const app = createDesktopApp();
  const response = await app.request("/api/editor/project/new", {
    method: "POST",
    headers: {
      origin: "http://localhost",
      "content-type": "application/json",
    },
    body: JSON.stringify({}),
  });
  assertEquals(response.status, 400);
});

Deno.test("project: create requires a selected parent folder", async () => {
  const app = createDesktopApp();
  const response = await app.request("/api/editor/project/new", {
    method: "POST",
    headers: {
      origin: "http://localhost",
      "content-type": "application/json",
    },
    body: JSON.stringify({ projectName: "Test Project" }),
  });
  assertEquals(response.status, 400);
});
