/**
 * shortcuts.ts
 *
 * Centralized keyboard shortcuts for Writasaurus.
 */

export interface ShortcutEvent {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}

/**
 * Checks whether a key event matches the Ctrl+Shift+E (or Cmd+Shift+E) shortcut.
 */
export function isReturnToEditorShortcut(event: ShortcutEvent): boolean {
  return (
    (event.ctrlKey === true || event.metaKey === true) &&
    event.shiftKey === true &&
    event.key.toLowerCase() === "e"
  );
}

/**
 * Registers a global keydown listener to return to the editor via Ctrl+Shift+E / Cmd+Shift+E.
 * If a custom action is provided, it is invoked; otherwise, navigates to "/".
 */
export function registerReturnToEditorShortcut(action?: () => void): void {
  globalThis.addEventListener("keydown", (event: Event) => {
    const keyboardEvent = event as unknown as ShortcutEvent;
    if (isReturnToEditorShortcut(keyboardEvent)) {
      if ("preventDefault" in event && typeof event.preventDefault === "function") {
        event.preventDefault();
      }
      if (action) {
        action();
      } else {
        globalThis.location.href = "/";
      }
    }
  });
}
