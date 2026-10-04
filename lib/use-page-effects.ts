import { useEffect } from "preact/hooks";
import { applyThemePreference, getThemePreference } from "./settings.ts";
import { registerReturnToEditorShortcut } from "./shortcuts.ts";

/** Applies the saved theme and wires Ctrl/Cmd+Shift+E to leave the page. */
export function usePageEffects(onReturn?: () => void): void {
  useEffect(() => {
    applyThemePreference(getThemePreference());
    return registerReturnToEditorShortcut(onReturn);
  }, []);
}
