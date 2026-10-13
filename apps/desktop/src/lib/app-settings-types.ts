import type { FontOption } from "../../../../packages/shared/settings.ts";

export interface DailyWritingProgress {
  date: string;
  startingWords: Record<string, number>;
}

export interface AppSettings {
  version: 1;
  font: FontOption;
  wordsPerPage: number;
  dailyWordGoal: number;
  dailyWritingProgress: DailyWritingProgress;
  writingAssistanceWords: string[];
  writingAssistanceIgnores: string[];
}

export type AppSettingsUpdate = Partial<
  Pick<
    AppSettings,
    | "font"
    | "wordsPerPage"
    | "dailyWordGoal"
    | "writingAssistanceWords"
    | "writingAssistanceIgnores"
  >
>;
