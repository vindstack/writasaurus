import { parseManuscript, serialize } from "../src/lib/editor/data.ts";
import {
  addChapter,
  manuscript,
  reorderChapter,
  replaceManuscript,
} from "../src/lib/editor/state.ts";
import type { Manuscript } from "../src/lib/editor/types.ts";

function assert(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

Deno.test("editor sections: Markdown preserves section types", () => {
  const manuscript: Manuscript = {
    filename: "sections.md",
    frontmatter: { title: "Sections" },
    chapters: [
      {
        id: "prologue",
        type: "prologue",
        title: "A Beginning",
        content: "<p>Before the story.</p>",
        wordCount: 3,
        charCount: 18,
      },
      {
        id: "chapter",
        type: "chapter",
        title: "Chapter 1: The Story",
        content: "<p>The story begins.</p>",
        wordCount: 3,
        charCount: 18,
      },
      {
        id: "appendix",
        type: "appendix",
        title: "Appendix 1: Notes",
        content: "<p>Additional notes.</p>",
        wordCount: 2,
        charCount: 17,
      },
    ],
  };

  const source = serialize(manuscript);
  assert(source.includes("<!-- section: prologue | A Beginning -->"));
  assert(source.includes("<!-- chapter: Chapter 1: The Story -->"));
  const parsed = parseManuscript(source, manuscript.filename);
  assertEquals(parsed.chapters.length, 3);
  assertEquals(parsed.chapters[0].type, "prologue");
  assertEquals(parsed.chapters[1].type, "chapter");
  assertEquals(parsed.chapters[2].type, "appendix");
  assert(parsed.chapters[0].content.includes("Before the story."));
});

Deno.test("editor sections: legacy headings recognize common section types", () => {
  const parsed = parseManuscript(
    "# Prologue\n\nBefore.\n\n# Chapter 1: Start\n\nBegin.",
    "book.md",
  );
  assertEquals(parsed.chapters[0].type, "prologue");
  assertEquals(parsed.chapters[1].type, "chapter");
});

Deno.test("editor sections: new sections use front, body, and back matter placement", () => {
  const previous = manuscript.value;
  try {
    replaceManuscript({
      filename: "sections.epub",
      frontmatter: { title: "Sections" },
      chapters: [{
        id: "chapter",
        type: "chapter",
        title: "Chapter 1",
        content: "<p></p>",
        wordCount: 0,
        charCount: 0,
      }],
    });

    addChapter("prologue");
    addChapter("part");
    addChapter("epilogue");
    addChapter("chapter");

    assertEquals(
      manuscript.value.chapters.map((item) => item.type).join(","),
      "prologue,part,chapter,chapter,epilogue",
    );
    assertEquals(manuscript.value.chapters[3].title, "Chapter 2");

    reorderChapter(2, 3);
    assertEquals(manuscript.value.chapters[2].title, "Chapter 1");
    assertEquals(manuscript.value.chapters[3].title, "Chapter 2");
  } finally {
    replaceManuscript(previous);
  }
});
