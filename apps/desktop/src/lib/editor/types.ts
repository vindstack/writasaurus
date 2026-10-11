export const SECTION_TYPES = [
  "chapter",
  "part",
  "prologue",
  "introduction",
  "foreword",
  "preface",
  "dedication",
  "epigraph",
  "acknowledgments",
  "epilogue",
  "afterword",
  "appendix",
  "glossary",
  "bibliography",
  "index",
  "colophon",
  "copyright-page",
] as const;

export type SectionType = typeof SECTION_TYPES[number];

export const SECTION_TYPE_LABELS: Record<SectionType, string> = {
  chapter: "Chapter",
  part: "Part",
  prologue: "Prologue",
  introduction: "Introduction",
  foreword: "Foreword",
  preface: "Preface",
  dedication: "Dedication",
  epigraph: "Epigraph",
  acknowledgments: "Acknowledgments",
  epilogue: "Epilogue",
  afterword: "Afterword",
  appendix: "Appendix",
  glossary: "Glossary",
  bibliography: "Bibliography",
  index: "Index",
  colophon: "Colophon",
  "copyright-page": "Copyright page",
};

export interface Chapter {
  id: string;
  title: string;
  content: string;
  wordCount: number;
  charCount: number;
  type?: SectionType;
}

export interface Manuscript {
  filename: string;
  frontmatter: Record<string, string | number>;
  chapters: Chapter[];
}
