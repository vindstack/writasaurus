import { signal } from "@preact/signals";

export type AssistanceStatus = "idle" | "loading" | "ready" | "unavailable";
export type WarningCategory = "spelling" | "grammar";

export interface WritingWarning {
  kind: string;
  message: string;
  problem: string;
  start: number;
  end: number;
  suggestions: string[];
}

export const assistanceOpen = signal(false);
export const assistanceStatus = signal<AssistanceStatus>("idle");
export const assistanceWarnings = signal<WritingWarning[]>([]);
export const assistanceActiveIndex = signal(-1);
/** Incremented whenever the active issue changes by user selection, to move focus to it. */
export const assistanceFocusRequest = signal(0);

export function warningCategory(warning: WritingWarning): WarningCategory {
  return warning.kind === "Spelling" || warning.kind === "Typo" ? "spelling" : "grammar";
}

/** The linter (and its WebAssembly binary) is only loaded once the panel is first opened. */
function loadEngine() {
  return import("./writing-assistance.ts");
}

export async function toggleAssistance(): Promise<void> {
  if (assistanceOpen.peek()) {
    (await loadEngine()).closeAssistance();
    return;
  }
  // Open the panel right away; the engine import and WebAssembly setup can be slow.
  assistanceOpen.value = true;
  if (assistanceStatus.peek() !== "ready") assistanceStatus.value = "loading";
  await (await loadEngine()).openAssistance();
}

export async function closeAssistance(): Promise<void> {
  if (assistanceOpen.peek()) (await loadEngine()).closeAssistance();
}

export async function selectWarning(index: number): Promise<void> {
  (await loadEngine()).selectWarning(index);
}

export async function replaceWarning(warning: WritingWarning): Promise<void> {
  (await loadEngine()).replaceWarning(warning);
}

export async function addToDictionary(warning: WritingWarning): Promise<void> {
  await (await loadEngine()).addToDictionary(warning);
}

export async function ignoreWarning(warning: WritingWarning): Promise<void> {
  (await loadEngine()).ignoreWarning(warning);
}
