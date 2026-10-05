import { isReturnToEditorShortcut } from "../src/lib/shortcuts.ts";

function assert(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

Deno.test("shortcuts: isReturnToEditorShortcut recognizes Ctrl+Shift+E", () => {
  const event = {
    key: "e",
    ctrlKey: true,
    shiftKey: true,
  };
  assertEquals(isReturnToEditorShortcut(event), true);
});

Deno.test("shortcuts: isReturnToEditorShortcut recognizes uppercase E", () => {
  const event = {
    key: "E",
    ctrlKey: true,
    shiftKey: true,
  };
  assertEquals(isReturnToEditorShortcut(event), true);
});

Deno.test("shortcuts: isReturnToEditorShortcut recognizes Cmd+Shift+E (metaKey)", () => {
  const event = {
    key: "e",
    metaKey: true,
    shiftKey: true,
  };
  assertEquals(isReturnToEditorShortcut(event), true);
});

Deno.test("shortcuts: isReturnToEditorShortcut rejects missing modifiers", () => {
  // Just 'e'
  assert(!isReturnToEditorShortcut({ key: "e" }));

  // Ctrl+E without Shift
  assert(!isReturnToEditorShortcut({ key: "e", ctrlKey: true }));

  // Shift+E without Ctrl/Meta
  assert(!isReturnToEditorShortcut({ key: "e", shiftKey: true }));

  // Ctrl+Shift+S (different key)
  assert(
    !isReturnToEditorShortcut(
      { key: "s", ctrlKey: true, shiftKey: true },
    ),
  );
});
