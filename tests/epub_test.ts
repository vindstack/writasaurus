import {
  crc32,
  epubFilename,
  generateEpub,
  htmlToXhtml,
  isEpubFilename,
  parseEpub,
  unzip,
} from "../src/lib/epub.ts";
import type { Manuscript } from "../src/lib/editor/types.ts";

function assert(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

Deno.test("epub: crc32 calculates correct checksum", () => {
  const data = new TextEncoder().encode("Hello, World!");
  const checksum = crc32(data);
  assertEquals(checksum, 0xec4ac3d0);
});

Deno.test("epub: htmlToXhtml converts void tags and entities", () => {
  const html = '<p>First line<br>Second line & more &nbsp; info</p><hr><img src="pic.jpg">';
  const xhtml = htmlToXhtml(html);
  assert(xhtml.includes("<br/>"));
  assert(xhtml.includes('<hr class="page-break"'));
  assert(xhtml.includes('<img src="pic.jpg"/>'));
  assert(xhtml.includes("&#160;"));
  assert(xhtml.includes("&amp; more"));
});

Deno.test("epub: htmlToXhtml converts pagebreak comments to styled page break elements", () => {
  const html = "<p>End of section.</p><!-- pagebreak --><p>Start of new section.</p>";
  const xhtml = htmlToXhtml(html);
  assert(xhtml.includes("page-break-before: always"));
  assert(xhtml.includes("break-before: page"));
});

Deno.test("epub: epubFilename formats extensions appropriately", () => {
  const ms1: Manuscript = {
    filename: "my-great-story.md",
    frontmatter: { title: "My Great Story" },
    chapters: [],
  };
  assertEquals(epubFilename(ms1), "my-great-story.epub");

  const ms2: Manuscript = {
    filename: "",
    frontmatter: { title: "Untitled Book" },
    chapters: [],
  };
  assertEquals(epubFilename(ms2), "untitled-book.epub");
});

Deno.test("epub: recognizes EPUB filenames case-insensitively", () => {
  assertEquals(isEpubFilename("novel.epub"), true);
  assertEquals(isEpubFilename("NOVEL.EPUB"), true);
  assertEquals(isEpubFilename("novel.md"), false);
  assertEquals(isEpubFilename("novel.epub.bak"), false);
});

Deno.test("epub: generates valid EPUB with page breaks before chapters", async () => {
  const manuscript: Manuscript = {
    filename: "novel.md",
    frontmatter: {
      title: "The Great Novel",
      author: "Jane Doe",
    },
    chapters: [
      {
        id: "ch-1",
        title: "Chapter 1: The Beginning",
        content: "<p>It was a dark and stormy night.</p>",
        wordCount: 7,
        charCount: 32,
      },
      {
        id: "ch-2",
        title: "Chapter 2: The Journey",
        content: "<p>The morning brought clear skies.</p>",
        wordCount: 5,
        charCount: 30,
      },
    ],
  };

  const epubBytes = await generateEpub(manuscript);
  assert(epubBytes.length > 0);

  // Check ZIP local file header signature PK\x03\x04
  assertEquals(epubBytes[0], 0x50);
  assertEquals(epubBytes[1], 0x4b);
  assertEquals(epubBytes[2], 0x03);
  assertEquals(epubBytes[3], 0x04);

  const files = await unzip(epubBytes);

  // mimetype MUST be uncompressed (stored) and first
  assert(files.has("mimetype"));
  const mimetype = files.get("mimetype")!;
  assertEquals(new TextDecoder().decode(mimetype), "application/epub+zip");

  // Verify mimetype is uncompressed at offset 30
  const view = new DataView(epubBytes.buffer, epubBytes.byteOffset, epubBytes.byteLength);
  const method = view.getUint16(8, true);
  assertEquals(method, 0);

  // META-INF/container.xml
  assert(files.has("META-INF/container.xml"));
  const container = new TextDecoder().decode(files.get("META-INF/container.xml")!);
  assert(container.includes("OEBPS/content.opf"));

  // OEBPS/content.opf
  assert(files.has("OEBPS/content.opf"));
  const opf = new TextDecoder().decode(files.get("OEBPS/content.opf")!);
  assert(opf.includes("<dc:title>The Great Novel</dc:title>"));
  assert(opf.includes("<dc:creator>Jane Doe</dc:creator>"));
  assert(opf.includes('id="chapter-1"'));
  assert(opf.includes('id="chapter-2"'));
  assert(opf.includes('idref="chapter-1"'));
  assert(opf.includes('idref="chapter-2"'));

  // OEBPS/style.css with page breaks
  assert(files.has("OEBPS/style.css"));
  const css = new TextDecoder().decode(files.get("OEBPS/style.css")!);
  assert(css.includes("break-before: page;"));
  assert(css.includes("page-break-before: always;"));
  assert(css.includes(".chapter"));
  assert(css.includes(".chapter-title"));

  // OEBPS/title.xhtml
  assert(files.has("OEBPS/title.xhtml"));
  const titleDoc = new TextDecoder().decode(files.get("OEBPS/title.xhtml")!);
  assert(titleDoc.includes("The Great Novel"));
  assert(titleDoc.includes("Jane Doe"));
  assert(titleDoc.includes("page-break-after: always"));
  assert(titleDoc.includes("break-after: page"));

  // OEBPS/nav.xhtml & OEBPS/toc.ncx
  assert(files.has("OEBPS/nav.xhtml"));
  const navDoc = new TextDecoder().decode(files.get("OEBPS/nav.xhtml")!);
  assert(navDoc.includes("Chapter 1: The Beginning"));
  assert(navDoc.includes("Chapter 2: The Journey"));

  assert(files.has("OEBPS/toc.ncx"));
  const ncxDoc = new TextDecoder().decode(files.get("OEBPS/toc.ncx")!);
  assert(ncxDoc.includes("Chapter 1: The Beginning"));
  assert(ncxDoc.includes("Chapter 2: The Journey"));

  // Individual chapter files with page breaks
  assert(files.has("OEBPS/chapter-1.xhtml"));
  const ch1Doc = new TextDecoder().decode(files.get("OEBPS/chapter-1.xhtml")!);
  assert(ch1Doc.includes("Chapter 1: The Beginning"));
  assert(ch1Doc.includes("It was a dark and stormy night."));
  assert(ch1Doc.includes("page-break-before: always"));
  assert(ch1Doc.includes("break-before: page"));

  assert(files.has("OEBPS/chapter-2.xhtml"));
  const ch2Doc = new TextDecoder().decode(files.get("OEBPS/chapter-2.xhtml")!);
  assert(ch2Doc.includes("Chapter 2: The Journey"));
  assert(ch2Doc.includes("The morning brought clear skies."));
  assert(ch2Doc.includes("page-break-before: always"));
  assert(ch2Doc.includes("break-before: page"));
});

Deno.test("epub: parseEpub roundtrips manuscript generated by generateEpub", async () => {
  const original: Manuscript = {
    filename: "roundtrip.epub",
    frontmatter: {
      title: "Roundtrip Epic",
      author: "Test Author",
    },
    chapters: [
      {
        id: "ch-1",
        title: "Chapter 1: The Start",
        content: "<p>First chapter paragraph.</p>",
        wordCount: 3,
        charCount: 22,
      },
      {
        id: "ch-2",
        title: "Chapter 2: The End",
        content: "<p>Second chapter paragraph.</p>",
        wordCount: 3,
        charCount: 23,
      },
    ],
  };

  const bytes = await generateEpub(original);
  const parsed = await parseEpub(bytes, "roundtrip.epub");

  assertEquals(parsed.filename, "roundtrip.epub");
  assertEquals(parsed.frontmatter.title, "Roundtrip Epic");
  assertEquals(parsed.frontmatter.author, "Test Author");
  assertEquals(parsed.chapters.length, 2);
  assertEquals(parsed.chapters[0].title, "Chapter 1: The Start");
  assert(parsed.chapters[0].content.includes("First chapter paragraph."));
  assertEquals(parsed.chapters[1].title, "Chapter 2: The End");
  assert(parsed.chapters[1].content.includes("Second chapter paragraph."));
});
