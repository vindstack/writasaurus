import { onMounted, onUnmounted } from "vue";
import { applyThemePreference, getThemePreference } from "../../../../packages/shared/settings.ts";
import { registerReturnToEditorShortcut } from "../lib/shortcuts.ts";

export function usePageEffects(onReturn?: () => void): void {
  let unregister: (() => void) | undefined;
  onMounted(() => {
    applyThemePreference(getThemePreference());
    unregister = registerReturnToEditorShortcut(onReturn);
  });
  onUnmounted(() => unregister?.());
}
