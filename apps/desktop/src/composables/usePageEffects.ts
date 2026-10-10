import { onMounted, onUnmounted } from "vue";
import { registerReturnToEditorShortcut } from "../lib/shortcuts.ts";

export function usePageEffects(onReturn?: () => void): void {
  let unregister: (() => void) | undefined;
  onMounted(() => {
    unregister = registerReturnToEditorShortcut(onReturn);
  });
  onUnmounted(() => unregister?.());
}
