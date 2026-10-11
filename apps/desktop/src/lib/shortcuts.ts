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

export type ProjectShortcutAction =
  | "new-project"
  | "open-project"
  | "toggle-project-view"
  | "writing-assistance";

export function getProjectShortcutAction(event: ShortcutEvent): ProjectShortcutAction | null {
  if (event.ctrlKey !== true && event.metaKey !== true) return null;

  const key = event.key.toLowerCase();
  if (!event.shiftKey && key === "n") return "new-project";
  if (!event.shiftKey && key === "o") return "open-project";
  if (!event.shiftKey && key === "g") return "toggle-project-view";
  if (event.shiftKey && key === "a") return "writing-assistance";
  return null;
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
 * Returns a function that removes the listener.
 */
export function registerReturnToEditorShortcut(action?: () => void): () => void {
  const listener = (event: Event) => {
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
  };
  globalThis.addEventListener("keydown", listener);
  return () => globalThis.removeEventListener("keydown", listener);
}
