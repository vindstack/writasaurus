import { textFromHtml } from "../utilties/dom-utilities.ts";
import { htmlToMarkdown, markdownToHtml } from "../utilties/markdown-utilities.ts";
import {
  createSlugFromString,
  getWordAndCharCountFromString,
} from "../utilties/string-utilities.ts";
import {
  type Chapter,
  type Manuscript,
  SECTION_TYPE_LABELS,
  SECTION_TYPES,
  type SectionType,
} from "./types.ts";

export function blankManuscript(title = "Untitled Manuscript"): Manuscript {
  return {
    filename: `${slug(title) || "manuscript"}.epub`,
    frontmatter: {
      title,
      author: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    chapters: [chapter("Chapter 1", "<p></p>")],
  };
}

export function chapter(title: string, content: string, type: SectionType = "chapter"): Chapter {
  const stats = count(textFromHtml(content));
  return {
    id: crypto.randomUUID(),
    title,
    content,
    wordCount: stats.words,
    charCount: stats.chars,
    type,
  };
}

export function defaultSectionTitle(type: SectionType, number = 1): string {
  const label = SECTION_TYPE_LABELS[type];
  if (type === "chapter" || type === "part" || type === "appendix") {
    return `${label} ${number}`;
  }
  return label;
}

export function slug(value: string): string {
  return createSlugFromString(value);
}

export function count(text: string): { words: number; chars: number } {
  return getWordAndCharCountFromString(text);
}

export function parseManuscript(source: string, filename: string): Manuscript {
  let frontmatter: Record<string, string | number> = {
    title: filename.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "),
    author: "",
    createdAt: new Date().toISOString(),
  };
  let body = source;
  const match = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/);
  if (match?.[1] !== undefined && match[2] !== undefined) {
    body = match[2];
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        frontmatter = { ...frontmatter, ...parsed };
      }
    } catch {
      for (const line of match[1].split(/\r?\n/)) {
        const pair = line.match(/^([\w-]+):\s*(.+)$/);
        if (pair?.[1] && pair[2]) frontmatter[pair[1]] = pair[2].replace(/^["']|["']$/g, "");
      }
    }
  }

  const chapters: Chapter[] = [];
  let title = "Chapter 1";
  let sectionType: SectionType = "chapter";
  let lines: string[] = [];
  const flush = () => {
    if (!lines.some((line) => line.trim()) && chapters.length) return;
    let markdown = lines.join("\n").replace(/^[\r\n]+/, "").replace(/[\r\n]+$/, "");
    const heading = markdown.match(/^#\s+(.+)\r?\n?/);
    if (heading?.[1]?.trim() === title.trim()) {
      markdown = markdown.slice(heading[0].length).replace(/^[\r\n]+/, "");
    }
    chapters.push(chapter(title, markdownToHtml(markdown), sectionType));
  };
  for (const line of body.split(/\r?\n/)) {
    const marker = line.trim().match(
      /^(?:<!--\s*chapter:?\s*(.*?)\s*-->|---chapter:?\s*(.*?)\s*---)$/i,
    );
    const sectionMarker = line.trim().match(
      /^<!--\s*section:\s*([\w-]+)\s*\|\s*(.*?)\s*-->$/i,
    );
    const heading = line.trim().match(
      /^#{1,2}\s+(chapter\b.*|part\b.*|prologue|epilogue|introduction|foreword|preface|dedication|epigraph|acknowledgments|afterword|appendix\b.*|glossary|bibliography|index|colophon|copyright page)$/i,
    );
    const markedType = sectionMarker?.[1].toLowerCase();
    if (sectionMarker && SECTION_TYPES.includes(markedType as SectionType)) {
      if (lines.some((part) => part.trim())) flush();
      sectionType = markedType as SectionType;
      title = sectionMarker[2].trim() || defaultSectionTitle(sectionType, chapters.length + 1);
      lines = [];
      continue;
    }
    const markerTitle = marker?.[1] ?? marker?.[2] ?? heading?.[1];
    if (markerTitle !== undefined) {
      if (lines.some((part) => part.trim())) flush();
      title = markerTitle.trim() || `Chapter ${chapters.length + 1}`;
      const normalizedTitle = markerTitle.trim().toLowerCase();
      sectionType = marker
        ? "chapter"
        : SECTION_TYPES.find((type) =>
          normalizedTitle === SECTION_TYPE_LABELS[type].toLowerCase() ||
          (type === "chapter" && normalizedTitle.startsWith("chapter ")) ||
          (type === "part" && normalizedTitle.startsWith("part ")) ||
          (type === "appendix" && normalizedTitle.startsWith("appendix "))
        ) ?? "chapter";
      lines = [];
    } else if (line.trim() || lines.length) {
      lines.push(line);
    }
  }
  flush();
  return {
    filename,
    frontmatter,
    chapters: chapters.length ? chapters : [chapter("Chapter 1", "")],
  };
}

export function serialize(manuscript: Manuscript): string {
  const metadata = {
    ...manuscript.frontmatter,
    updatedAt: new Date().toISOString(),
    totalChapters: manuscript.chapters.length,
    totalWords: manuscript.chapters.reduce((sum, item) => sum + item.wordCount, 0),
  };
  const chapters = manuscript.chapters.map((item) => {
    const title = item.title.replace(/-->/g, "");
    const marker = item.type === undefined || item.type === "chapter"
      ? `<!-- chapter: ${title} -->`
      : `<!-- section: ${item.type} | ${title} -->`;
    return `${marker}\n\n${htmlToMarkdown(item.content)}`;
  });
  return `---\n${JSON.stringify(metadata, null, 2)}\n---\n\n${chapters.join("\n\n")}\n`;
}

export const SAMPLE_NOVEL = `---
{"title":"The Lord of the Rings","author":"J.R.R. Tolkien"}
---

<!-- chapter: Chapter 1: A Long Expected Party -->

When Mr. Bilbo Baggins of Bag End announced that he would shortly be celebrating his eleventy-first birthday with a party of special magnificence, there was much talk and excitement in Hobbiton.
<!-- chapter: Chapter 2: The Shadow of the Past -->

The talk did not die down in nine or even ninety-nine days. The second disappearance of Mr. Bilbo Baggins was discussed in Hobbiton, and indeed all over the Shire, for a year and a day, and was remembered much longer than that. It became a fireside-story for young hobbits; and eventually Mad Baggins, who used to vanish with a bang and a flash and reappear with bags of jewels and gold, became a favourite character of legend and lived on long after all the true events were forgotten.


<!-- chapter: Chapter 3: Three Is Company -->

‘You ought to go quietly, and you ought to go soon,’ said Gandalf. Two or three weeks had passed, and still Frodo made no sign of getting ready to go.
`;
