export interface ProjectDailyProgress {
  progress: {
    date: string;
    startingWords: Record<string, number>;
  };
  writtenWords: number;
  dailyWordGoal: number;
  history: { date: string; words: number; goal: number }[];
}

export function recordDailyWritingProgress(
  manuscriptId: string,
  totalWords: number,
): Promise<ProjectDailyProgress | null> {
  return recordActiveProjectDailyProgress(manuscriptId, totalWords);
}
import { recordActiveProjectDailyProgress } from "./editor-session.ts";
