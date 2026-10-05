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

export interface WritableFileHandle {
  kind: "file";
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{
    write(data: string | Uint8Array | Blob): Promise<void>;
    close(): Promise<void>;
  }>;
  queryPermission(options: { mode: string }): Promise<string>;
  requestPermission(options: { mode: string }): Promise<string>;
}
