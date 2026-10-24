import type { FontOption } from "../../../../packages/shared/settings.ts";

export interface AppSettings {
  version: 1;
  font: FontOption;
  wordsPerPage: number;
  writingAssistanceWords: string[];
  writingAssistanceIgnores: string[];
}

export type AppSettingsUpdate = Partial<
  Pick<AppSettings, "font" | "wordsPerPage" | "writingAssistanceWords" | "writingAssistanceIgnores">
>;
