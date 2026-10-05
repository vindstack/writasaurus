import { markdownToHtml } from "../src/lib/utilties/markdown-utilities.ts";

function assert(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

Deno.test("markdown: preserves paragraph indentation with non-breaking spaces", () => {
  const md =
    "\u00A0\u00A0\u00A0\u00A0First paragraph.\n\n\u00A0\u00A0\u00A0\u00A0Second paragraph.";
  const html = markdownToHtml(md);
  assert(html.includes("<p>\u00A0\u00A0\u00A0\u00A0First paragraph.</p>"));
  assert(html.includes("<p>\u00A0\u00A0\u00A0\u00A0Second paragraph.</p>"));
});

Deno.test("markdown: preserves raw tabs in paragraph content", () => {
  const md = "\tIndented with raw tab.\n\n\tSecond tabbed line.";
  const html = markdownToHtml(md);
  assertEquals(
    html,
    "<p>\tIndented with raw tab.</p><p>\tSecond tabbed line.</p>",
  );
});
