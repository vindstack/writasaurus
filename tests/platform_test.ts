import { hasDesktopMarker } from "../src/lib/desktop.ts";

Deno.test("platform: server address alone does not identify Desktop", () => {
  assertEquals(hasDesktopMarker(undefined, undefined), false);
});

Deno.test("platform: Deno Desktop marker identifies Desktop", () => {
  assertEquals(hasDesktopMarker("1", undefined), true);
});

Deno.test("platform: Writasaurus Desktop marker identifies Desktop", () => {
  assertEquals(hasDesktopMarker(undefined, "1"), true);
});

function assertEquals<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
