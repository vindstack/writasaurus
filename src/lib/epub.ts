import type { Chapter, Manuscript } from "./editor/types.ts";
import { chapter } from "./editor/data.ts";
import { createSlugFromString } from "./utilties/string-utilities.ts";

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[i] = c >>> 0;
}

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ data[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function toDosDateTime(date: Date): { time: number; date: number } {
  const dosTime = ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    (Math.floor(date.getSeconds() / 2) & 0x1f);
  const year = Math.max(1980, date.getFullYear());
  const dosDate = (((year - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0xf) << 5) |
    (date.getDate() & 0x1f);
  return { time: dosTime, date: dosDate };
}

async function compressDeflate(data: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === "undefined") return null;
  try {
    const stream = new Response(
      new Response(new Blob([data as unknown as BlobPart])).body!.pipeThrough(
        new CompressionStream("deflate-raw"),
      ),
    );
    const buf = await stream.arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

export interface ZipFileEntry {
  name: string;
  data: Uint8Array;
  store?: boolean;
}

export async function createZip(entries: ZipFileEntry[]): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const dosDateTime = toDosDateTime(new Date());

  interface ProcessedEntry {
    nameBytes: Uint8Array;
    compressedData: Uint8Array;
    crc: number;
    method: number;
    localHeaderOffset: number;
    uncompressedSize: number;
  }

  const processed: ProcessedEntry[] = [];
  let totalLocalSize = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const uncompressedSize = entry.data.length;
    const crc = crc32(entry.data);
    let method = 0;
    let compressedData = entry.data;

    if (!entry.store) {
      const deflated = await compressDeflate(entry.data);
      if (deflated && deflated.length < uncompressedSize) {
        method = 8;
        compressedData = deflated;
      }
    }

    const localHeaderOffset = totalLocalSize;
    const localEntrySize = 30 + nameBytes.length + compressedData.length;
    totalLocalSize += localEntrySize;

    processed.push({
      nameBytes,
      compressedData,
      crc,
      method,
      localHeaderOffset,
      uncompressedSize,
    });
  }

  let centralDirSize = 0;
  for (const p of processed) {
    centralDirSize += 46 + p.nameBytes.length;
  }

  const eocdSize = 22;
  const totalZipSize = totalLocalSize + centralDirSize + eocdSize;
  const buffer = new Uint8Array(totalZipSize);
  const view = new DataView(buffer.buffer);

  let offset = 0;
  for (const p of processed) {
    view.setUint32(offset, 0x04034b50, true);
    view.setUint16(offset + 4, 20, true);
    view.setUint16(offset + 6, 0x0800, true);
    view.setUint16(offset + 8, p.method, true);
    view.setUint16(offset + 10, dosDateTime.time, true);
    view.setUint16(offset + 12, dosDateTime.date, true);
    view.setUint32(offset + 14, p.crc, true);
    view.setUint32(offset + 18, p.compressedData.length, true);
    view.setUint32(offset + 22, p.uncompressedSize, true);
    view.setUint16(offset + 26, p.nameBytes.length, true);
    view.setUint16(offset + 28, 0, true);

    offset += 30;
    buffer.set(p.nameBytes, offset);
    offset += p.nameBytes.length;

    buffer.set(p.compressedData, offset);
    offset += p.compressedData.length;
  }

  const centralDirOffset = offset;
  for (const p of processed) {
    view.setUint32(offset, 0x02014b50, true);
    view.setUint16(offset + 4, 20, true);
    view.setUint16(offset + 6, 20, true);
    view.setUint16(offset + 8, 0x0800, true);
    view.setUint16(offset + 10, p.method, true);
    view.setUint16(offset + 12, dosDateTime.time, true);
    view.setUint16(offset + 14, dosDateTime.date, true);
    view.setUint32(offset + 16, p.crc, true);
    view.setUint32(offset + 20, p.compressedData.length, true);
    view.setUint32(offset + 24, p.uncompressedSize, true);
    view.setUint16(offset + 28, p.nameBytes.length, true);
    view.setUint16(offset + 30, 0, true);
    view.setUint16(offset + 32, 0, true);
    view.setUint16(offset + 34, 0, true);
    view.setUint16(offset + 36, 0, true);
    view.setUint32(offset + 38, 0, true);
    view.setUint32(offset + 42, p.localHeaderOffset, true);

    offset += 46;
    buffer.set(p.nameBytes, offset);
    offset += p.nameBytes.length;
  }

  view.setUint32(offset, 0x06054b50, true);
  view.setUint16(offset + 4, 0, true);
  view.setUint16(offset + 6, 0, true);
  view.setUint16(offset + 8, processed.length, true);
  view.setUint16(offset + 10, processed.length, true);
  view.setUint32(offset + 12, centralDirSize, true);
  view.setUint32(offset + 16, centralDirOffset, true);
  view.setUint16(offset + 20, 0, true);

  return buffer;
}

export async function unzip(
  zipData: Uint8Array,
): Promise<Map<string, Uint8Array>> {
  const view = new DataView(zipData.buffer, zipData.byteOffset, zipData.byteLength);
  const entries = new Map<string, Uint8Array>();
  let offset = 0;
  while (offset + 30 <= zipData.length) {
    const sig = view.getUint32(offset, true);
    if (sig !== 0x04034b50) break;
    const method = view.getUint16(offset + 8, true);
    const compSize = view.getUint32(offset + 18, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const name = new TextDecoder().decode(zipData.subarray(offset + 30, offset + 30 + nameLen));
    const dataStart = offset + 30 + nameLen + extraLen;
    const rawData = zipData.subarray(dataStart, dataStart + compSize);
    let decompressed: Uint8Array;
    if (method === 0) {
      decompressed = rawData;
    } else if (method === 8) {
      const stream = new Response(
        new Response(new Blob([rawData as unknown as BlobPart])).body!.pipeThrough(
          new DecompressionStream("deflate-raw"),
        ),
      );
      decompressed = new Uint8Array(await stream.arrayBuffer());
    } else {
      decompressed = rawData;
    }
    entries.set(name, decompressed);
    offset = dataStart + compSize;
  }
  return entries;
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function unescapeXml(value: string): string {
  return value
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&#160;/g, "\u00A0")
    .replace(/&amp;/g, "&");
}

const HTML_ENTITY_MAP: Record<string, string> = {
  "&nbsp;": "&#160;",
  "&mdash;": "&#8212;",
  "&ndash;": "&#8211;",
  "&hellip;": "&#8230;",
  "&ldquo;": "&#8220;",
  "&rdquo;": "&#8221;",
  "&lsquo;": "&#8216;",
  "&rsquo;": "&#8217;",
  "&bull;": "&#8226;",
  "&copy;": "&#169;",
  "&reg;": "&#174;",
  "&trade;": "&#8482;",
  "&times;": "&#215;",
  "&divide;": "&#247;",
};

export function htmlToXhtml(htmlContent: string): string {
  if (!htmlContent.trim()) return "<p></p>";

  let converted = htmlContent
    .replace(
      /<!--\s*page-?break\s*-->/gi,
      '<div class="page-break" style="page-break-before: always; break-before: page;"></div>',
    )
    .replace(
      /<hr(?:\s+class="[^"]*page-?break[^"]*")?\s*\/?>/gi,
      '<hr class="page-break" style="page-break-before: always; break-before: page;"/>',
    );

  converted = converted.replace(/&[a-zA-Z]+;/g, (match) => HTML_ENTITY_MAP[match] || match);
  converted = converted.replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#[xX][0-9a-fA-F]+);)/g, "&amp;");
  converted = converted.replace(
    /<(br|hr|img|input|col|embed|source|track|wbr)(\s[^>]*)?(?<!\/)>/gi,
    "<$1$2/>",
  );

  return converted;
}

export function epubFilename(manuscript: Manuscript): string {
  if (manuscript.filename) {
    const base = manuscript.filename.replace(/\.[^.]+$/, "");
    if (base.trim()) return `${base}.epub`;
  }
  const title = String(manuscript.frontmatter.title ?? "").trim();
  const titleSlug = createSlugFromString(title);
  return `${titleSlug || "manuscript"}.epub`;
}

export function isEpubFilename(filename: string): boolean {
  return filename.toLowerCase().endsWith(".epub");
}

export const EPUB_CSS = /* css */ `
@namespace epub "http://www.idpf.org/2007/ops";

@page {
  margin: 1in;
}

html, body {
  margin: 0;
  padding: 0;
}

body {
  font-family: serif;
  font-size: 1em;
  line-height: 1.6;
  padding: 4%;
}

.titlepage {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  min-height: 70vh;
  text-align: center;
  page-break-after: always;
  break-after: page;
}

.book-title {
  font-size: 2.2em;
  font-weight: bold;
  margin-top: 20%;
  margin-bottom: 0.8em;
  text-align: center;
}

.book-author {
  font-size: 1.25em;
  font-style: italic;
  margin-top: 0;
  margin-bottom: 2em;
  color: #444;
  text-align: center;
}

.toc-title {
  font-size: 1.8em;
  font-weight: bold;
  margin-top: 1.5em;
  margin-bottom: 1em;
  text-align: center;
}

nav#toc ol {
  list-style-type: none;
  padding-left: 0;
}

nav#toc li {
  margin: 0.6em 0;
}

nav#toc a {
  text-decoration: none;
  color: inherit;
}

/* Page breaks before every chapter */
.chapter,
.chapter-content,
section[role="doc-chapter"],
section[epub\\:type~="chapter"] {
  page-break-before: always;
  break-before: page;
}

.chapter-title {
  page-break-before: always;
  break-before: page;
  page-break-after: avoid;
  break-after: avoid;
  font-size: 1.8em;
  font-weight: bold;
  margin-top: 2em;
  margin-bottom: 1.5em;
  text-align: center;
}

/* Page breaks within content */
.page-break,
.pagebreak,
hr.page-break,
div.page-break {
  page-break-before: always;
  break-before: page;
  page-break-after: avoid;
  break-after: avoid;
  height: 0;
  margin: 0;
  padding: 0;
  border: 0;
  visibility: hidden;
}

h1, h2, h3, h4, h5, h6 {
  page-break-after: avoid;
  break-after: avoid;
}

p {
  margin-top: 0;
  margin-bottom: 0.75em;
  text-indent: 1.5em;
  orphans: 2;
  widows: 2;
}

h1 + p,
h2 + p,
h3 + p,
.chapter-title + p,
hr + p,
.page-break + p {
  text-indent: 0;
}

blockquote {
  margin: 1.5em 2em;
  font-style: italic;
}

ul, ol {
  margin: 1em 2em;
}

hr {
  border: 0;
  border-top: 1px solid #aaa;
  margin: 2em auto;
  width: 30%;
}
`.trim();

export async function generateEpub(manuscript: Manuscript): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const uuid = crypto.randomUUID();
  const modifiedIso = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const title = String(manuscript.frontmatter.title || "Untitled Manuscript");
  const author = String(manuscript.frontmatter.author || "");

  const entries: ZipFileEntry[] = [];

  // 1. mimetype: MUST be first entry and stored uncompressed
  entries.push({
    name: "mimetype",
    data: encoder.encode("application/epub+zip"),
    store: true,
  });

  // 2. META-INF/container.xml
  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
  entries.push({
    name: "META-INF/container.xml",
    data: encoder.encode(containerXml),
  });

  // 3. OEBPS/style.css
  entries.push({
    name: "OEBPS/style.css",
    data: encoder.encode(EPUB_CSS),
  });

  // 4. OEBPS/title.xhtml
  const titleXhtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${escapeXml(title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body class="titlepage" style="page-break-after: always; break-after: page;">
  <section epub:type="titlepage" class="title-content">
    <h1 class="book-title">${escapeXml(title)}</h1>
    ${author ? `<p class="book-author">${escapeXml(author)}</p>` : ""}
  </section>
</body>
</html>`;
  entries.push({
    name: "OEBPS/title.xhtml",
    data: encoder.encode(titleXhtml),
  });

  // 5. OEBPS/nav.xhtml (EPUB 3 Navigation Document)
  const navItems = manuscript.chapters.map((chapter, i) =>
    `      <li><a href="chapter-${i + 1}.xhtml">${escapeXml(chapter.title)}</a></li>`
  ).join("\n");
  const navXhtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Table of Contents</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body class="chapter" style="page-break-before: always; break-before: page;">
  <nav epub:type="toc" id="toc" role="doc-toc">
    <h1 class="toc-title">Table of Contents</h1>
    <ol>
${navItems}
    </ol>
  </nav>
</body>
</html>`;
  entries.push({
    name: "OEBPS/nav.xhtml",
    data: encoder.encode(navXhtml),
  });

  // 6. OEBPS/toc.ncx (EPUB 2 backward compatibility)
  const ncxNavPoints = manuscript.chapters.map((chapter, i) =>
    `    <navPoint id="navPoint-${i + 1}" playOrder="${i + 1}">
      <navLabel>
        <text>${escapeXml(chapter.title)}</text>
      </navLabel>
      <content src="chapter-${i + 1}.xhtml"/>
    </navPoint>`
  ).join("\n");
  const tocNcx = `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${uuid}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle>
    <text>${escapeXml(title)}</text>
  </docTitle>
  <navMap>
${ncxNavPoints}
  </navMap>
</ncx>`;
  entries.push({
    name: "OEBPS/toc.ncx",
    data: encoder.encode(tocNcx),
  });

  // 7. OEBPS/chapter-${i+1}.xhtml for each chapter
  manuscript.chapters.forEach((chapter, i) => {
    const chapterBody = htmlToXhtml(chapter.content);
    const chapterXhtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${escapeXml(chapter.title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body class="chapter" style="page-break-before: always; break-before: page;">
  <section epub:type="chapter" role="doc-chapter" class="chapter-content" style="page-break-before: always; break-before: page;">
    <h1 class="chapter-title" style="page-break-before: always; break-before: page;">${
      escapeXml(chapter.title)
    }</h1>
    ${chapterBody}
  </section>
</body>
</html>`;
    entries.push({
      name: `OEBPS/chapter-${i + 1}.xhtml`,
      data: encoder.encode(chapterXhtml),
    });
  });

  // 8. OEBPS/content.opf
  const manifestItems = [
    '    <item id="style" href="style.css" media-type="text/css"/>',
    '    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
    '    <item id="titlepage" href="title.xhtml" media-type="application/xhtml+xml"/>',
    ...manuscript.chapters.map((_, i) =>
      `    <item id="chapter-${i + 1}" href="chapter-${
        i + 1
      }.xhtml" media-type="application/xhtml+xml"/>`
    ),
  ].join("\n");

  const spineItems = [
    '    <itemref idref="titlepage"/>',
    ...manuscript.chapters.map((_, i) => `    <itemref idref="chapter-${i + 1}"/>`),
  ].join("\n");

  const contentOpf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">urn:uuid:${uuid}</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:language>en</dc:language>
    ${author ? `<dc:creator>${escapeXml(author)}</dc:creator>` : ""}
    <meta property="dcterms:modified">${modifiedIso}</meta>
  </metadata>
  <manifest>
${manifestItems}
  </manifest>
  <spine toc="ncx">
${spineItems}
  </spine>
</package>`;
  entries.push({
    name: "OEBPS/content.opf",
    data: encoder.encode(contentOpf),
  });

  return await createZip(entries);
}

export async function parseEpub(bytes: Uint8Array, filename: string): Promise<Manuscript> {
  const files = await unzip(bytes);

  let opfPath = "OEBPS/content.opf";
  const containerBytes = files.get("META-INF/container.xml");
  if (containerBytes) {
    const containerXml = new TextDecoder().decode(containerBytes);
    const match = containerXml.match(/full-path=["']([^"']+)["']/i);
    if (match?.[1]) opfPath = match[1];
  }

  let opfBytes = files.get(opfPath);
  if (!opfBytes) {
    for (const [path, content] of files.entries()) {
      if (path.endsWith(".opf")) {
        opfPath = path;
        opfBytes = content;
        break;
      }
    }
  }

  const opfDir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";
  const opfText = opfBytes ? new TextDecoder().decode(opfBytes) : "";

  const titleMatch = opfText.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i);
  const authorMatch = opfText.match(/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/i);
  const title = titleMatch ? unescapeXml(titleMatch[1].trim()) : filename.replace(/\.[^.]+$/, "");
  const author = authorMatch ? unescapeXml(authorMatch[1].trim()) : "";

  const manifest = new Map<string, string>();
  const itemRegex = /<item\b([^>]+)\/?>/gi;
  let itemMatch: RegExpExecArray | null;
  while ((itemMatch = itemRegex.exec(opfText)) !== null) {
    const attrs = itemMatch[1];
    const id = attrs.match(/\bid=["']([^"']+)["']/i)?.[1];
    const href = attrs.match(/\bhref=["']([^"']+)["']/i)?.[1];
    if (id && href) manifest.set(id, href);
  }

  const spineIdrefs: string[] = [];
  const spineRegex = /<itemref\b([^>]+)\/?>/gi;
  let spineMatch: RegExpExecArray | null;
  while ((spineMatch = spineRegex.exec(opfText)) !== null) {
    const idref = spineMatch[1].match(/\bidref=["']([^"']+)["']/i)?.[1];
    if (idref) spineIdrefs.push(idref);
  }

  const chapters: Chapter[] = [];
  for (let i = 0; i < spineIdrefs.length; i++) {
    const idref = spineIdrefs[i];
    if (idref === "titlepage") continue;
    const href = manifest.get(idref);
    if (!href) continue;
    const fullPath = opfDir + href;
    const docBytes = files.get(fullPath) || files.get(href);
    if (!docBytes) continue;
    const docText = new TextDecoder().decode(docBytes);

    if (
      docText.includes('epub:type="titlepage"') ||
      docText.includes('class="titlepage"') ||
      docText.includes('epub:type="toc"') ||
      docText.includes('role="doc-toc"')
    ) {
      continue;
    }

    let chapterTitle = `Chapter ${chapters.length + 1}`;
    const h1Match = docText.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const titleTagMatch = docText.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (h1Match) {
      chapterTitle = unescapeXml(h1Match[1].replace(/<[^>]+>/g, "").trim());
    } else if (titleTagMatch && titleTagMatch[1].trim() && titleTagMatch[1].trim() !== title) {
      chapterTitle = unescapeXml(titleTagMatch[1].trim());
    }

    const sectionMatch = docText.match(/<section[^>]*>([\s\S]*?)<\/section>/i);
    const bodyMatch = docText.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const rawContent = sectionMatch ? sectionMatch[1] : (bodyMatch ? bodyMatch[1] : docText);

    let contentHtml = rawContent.replace(/^\s*<h1[^>]*>[\s\S]*?<\/h1>\s*/i, "").trim();
    if (!contentHtml) contentHtml = "<p></p>";

    chapters.push(chapter(chapterTitle, contentHtml));
  }

  const cleanFilename = filename.endsWith(".epub")
    ? filename
    : `${filename.replace(/\.[^.]+$/, "")}.epub`;

  return {
    filename: cleanFilename,
    frontmatter: {
      title,
      author,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    chapters: chapters.length ? chapters : [chapter("Chapter 1", "<p></p>")],
  };
}
