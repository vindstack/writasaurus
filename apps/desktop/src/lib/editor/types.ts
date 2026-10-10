export interface Chapter {
  id: string;
  title: string;
  content: string;
  wordCount: number;
  charCount: number;
}

export interface Manuscript {
  filename: string;
  frontmatter: Record<string, string | number>;
  chapters: Chapter[];
}
