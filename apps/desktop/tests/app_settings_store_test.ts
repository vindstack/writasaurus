import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "vitest";
import {
  getAppSettings,
  getLegacyDailySettings,
  updateAppSettings,
} from "../src/lib/app-settings-store.ts";

function assert(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

async function withTempSettings<T>(test: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(resolve(".writasaurus-settings-"));
  try {
    return await test(directory);
  } finally {
    await rm(directory, { recursive: true });
  }
}

test("app settings: defaults, updates, writing progress, and license token persist", async () => {
  await withTempSettings(async (directory) => {
    const defaults = await getAppSettings(directory);
    assert(defaults.version === 1);
    assert(defaults.font === "alegreya");
    assert(defaults.wordsPerPage === 300);
    assert(!("dailyWordGoal" in defaults));
    assert(defaults.writingAssistanceWords.length === 0);
    assert(defaults.writingAssistanceIgnores.length === 0);
    assert(!("licenseToken" in defaults), "Expected the public settings API to omit the token");

    const updated = await updateAppSettings(
      {
        font: "georgia",
        wordsPerPage: 420,
        writingAssistanceWords: ["Writasaurus", "Writasaurus"],
        writingAssistanceIgnores: ["grammar:example"],
      },
      directory,
    );
    assert(updated.font === "georgia");
    assert(updated.wordsPerPage === 420);
    assert(!("dailyWordGoal" in updated));
    assert(updated.writingAssistanceWords.length === 1);
    assert(updated.writingAssistanceIgnores[0] === "grammar:example");

    assert((await getAppSettings(directory)).font === "georgia");
    const persisted = JSON.parse(await readFile(`${directory}/settings.json`, "utf8"));
    assert(!("dailyWordGoal" in persisted));
    assert(!("dailyWritingProgress" in persisted));

    if (process.platform !== "win32") {
      const directoryMode = (await stat(directory)).mode & 0o777;
      const fileMode = (await stat(`${directory}/settings.json`)).mode & 0o777;
      assert(
        directoryMode === 0o700,
        `Expected private directory permissions, got ${directoryMode}`,
      );
      assert(fileMode === 0o600, `Expected private settings permissions, got ${fileMode}`);
    }
  });
});

test("app settings: exposes legacy daily settings for project migration", async () => {
  await withTempSettings(async (directory) => {
    await writeFile(
      `${directory}/settings.json`,
      JSON.stringify({
        version: 1,
        font: "alegreya",
        wordsPerPage: 300,
        dailyWordGoal: 2400,
        dailyWritingProgress: {
          date: new Date().toISOString().slice(0, 10),
          startingWords: { "manuscript-1": 125 },
        },
        writingAssistanceWords: [],
        writingAssistanceIgnores: [],
        licenseToken: "legacy-signed-token",
      }),
    );
    const legacy = await getLegacyDailySettings(directory);
    assert(legacy.dailyWordGoal === 2400);
    assert(legacy.dailyWritingProgress.startingWords["manuscript-1"] === 125);
    const settings = await getAppSettings(directory);
    assert(!("dailyWordGoal" in settings));
    const persisted = JSON.parse(await readFile(`${directory}/settings.json`, "utf8"));
    assert(!("licenseToken" in persisted), "Expected legacy license tokens to be removed");
  });
});

test("app settings: rejects invalid updates and malformed persisted data", async () => {
  await withTempSettings(async (directory) => {
    let invalidUpdateRejected = false;
    try {
      await updateAppSettings({ dailyWordGoal: 0 }, directory);
    } catch (error) {
      invalidUpdateRejected = error instanceof TypeError;
    }
    assert(invalidUpdateRejected, "Expected an invalid setting update to be rejected");

    let unknownUpdateRejected = false;
    try {
      await updateAppSettings({ unknownSetting: "not-a-preference" }, directory);
    } catch (error) {
      unknownUpdateRejected = error instanceof TypeError;
    }
    assert(unknownUpdateRejected, "Expected private fields to be rejected by preference updates");

    await writeFile(`${directory}/settings.json`, "{invalid");
    let malformedFileRejected = false;
    try {
      await getAppSettings(directory);
    } catch (error) {
      malformedFileRejected = error instanceof Error && error.message.includes("invalid JSON");
    }
    assert(malformedFileRejected, "Expected malformed settings JSON to surface as an error");
  });
});
