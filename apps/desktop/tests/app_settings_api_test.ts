import { test } from "vitest";
import { POST as updateDailyProgress } from "../src/pages/api/editor/daily-progress.ts";
import { PATCH as updateSettings } from "../src/pages/api/editor/settings.ts";

function assert(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

test("app settings API: rejects invalid settings and progress input", async () => {
  const settingsResponse = await updateSettings({
    request: new Request("http://localhost/api/editor/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wordsPerPage: 0 }),
    }),
  });
  assert(settingsResponse.status === 400);

  const legacyGoalResponse = await updateSettings({
    request: new Request("http://localhost/api/editor/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dailyWordGoal: 1 }),
    }),
  });
  assert(legacyGoalResponse.status === 400);

  const progressResponse = await updateDailyProgress({
    request: new Request("http://localhost/api/editor/daily-progress", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ manuscriptId: "", totalWords: -1 }),
    }),
  });
  assert(progressResponse.status === 400);
});
