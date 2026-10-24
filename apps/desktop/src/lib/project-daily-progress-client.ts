export interface ProjectDailyProgress {
  progress: {
    date: string;
    startingWords: Record<string, number>;
  };
  writtenWords: number;
  dailyWordGoal: number;
  history: { date: string; words: number; goal: number }[];
}

let requests: Promise<unknown> = Promise.resolve();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function recordDailyWritingProgress(
  manuscriptId: string,
  totalWords: number,
): Promise<ProjectDailyProgress | null> {
  const request = requests.then(async () => {
    const response = await fetch("/api/editor/daily-progress", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ manuscriptId, totalWords }),
    });
    if (response.status === 409) return null;
    if (!response.ok) {
      const detail = (await response.text()).trim();
      throw new Error(detail || `Could not update daily writing progress (${response.status}).`);
    }
    const result: unknown = await response.json();
    if (!isRecord(result) || !isRecord(result.progress)) {
      throw new Error("The daily writing progress response is invalid.");
    }
    const { progress, history, writtenWords, dailyWordGoal } = result;
    const startingWords = progress.startingWords;
    if (!isRecord(startingWords)) {
      throw new Error("The daily writing progress response is invalid.");
    }
    if (
      typeof progress.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(progress.date) ||
      !Object.entries(startingWords).every(
        ([key, words]) =>
          key.length > 0 && typeof words === "number" && Number.isSafeInteger(words) && words >= 0,
      ) ||
      typeof writtenWords !== "number" ||
      !Number.isSafeInteger(writtenWords) ||
      writtenWords < 0 ||
      typeof dailyWordGoal !== "number" ||
      !Number.isSafeInteger(dailyWordGoal) ||
      dailyWordGoal < 1 ||
      !Array.isArray(history)
    ) {
      throw new Error("The daily writing progress response is invalid.");
    }
    const parsedHistory: ProjectDailyProgress["history"] = [];
    for (const entry of history) {
      if (
        !isRecord(entry) ||
        typeof entry.date !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(entry.date) ||
        typeof entry.words !== "number" ||
        !Number.isSafeInteger(entry.words) ||
        entry.words < 0 ||
        typeof entry.goal !== "number" ||
        !Number.isSafeInteger(entry.goal) ||
        entry.goal < 1
      ) {
        throw new Error("The daily writing progress response is invalid.");
      }
      parsedHistory.push({ date: entry.date, words: entry.words, goal: entry.goal });
    }
    return {
      progress: {
        date: progress.date,
        startingWords: Object.fromEntries(Object.entries(startingWords)) as Record<string, number>,
      },
      writtenWords,
      dailyWordGoal,
      history: parsedHistory,
    };
  });
  requests = request.then(
    () => undefined,
    () => undefined,
  );
  return request;
}
