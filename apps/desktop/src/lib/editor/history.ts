/**
 * Smart undo/redo history manager with token-level grouping.
 * Groups consecutive spaces, tabs, and words as single undo actions.
 * Limits history to 500 edits.
 */

interface HistoryEntry {
  content: string;
  title: string;
}

const MAX_HISTORY = 500;

/**
 * Tokenize text into logical units for smart grouping:
 * - Words (sequences of non-whitespace, non-punctuation)
 * - Space groups (consecutive spaces, 2+ spaces count as 1 token)
 * - Tabs (each tab is 1 token)
 * - Single spaces followed by punctuation
 * - Punctuation
 */
function tokenizeForDiff(text: string): string[] {
  const tokens: string[] = [];
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    if (char === "\t") {
      tokens.push("\t");
      i++;
    } else if (char === " ") {
      let spaceCount = 0;
      while (i < text.length && text[i] === " ") {
        spaceCount++;
        i++;
      }
      tokens.push(spaceCount >= 2 ? "  " : " ");
    } else if (/\s/.test(char)) {
      tokens.push(char);
      i++;
    } else if (/[a-zA-Z0-9_]/.test(char)) {
      let word = "";
      while (i < text.length && /[a-zA-Z0-9_]/.test(text[i])) {
        word += text[i];
        i++;
      }
      tokens.push(word);
    } else {
      tokens.push(char);
      i++;
    }
  }

  return tokens;
}

/**
 * Check if a change is substantial enough to record.
 * Filters out trivial edits within a batched keystroke group.
 */
function isSubstantialChange(
  prevTokens: string[],
  newTokens: string[],
): boolean {
  if (prevTokens.length === newTokens.length) {
    return false;
  }
  const diff = Math.abs(prevTokens.length - newTokens.length);
  return diff >= 1;
}

export class EditorHistory {
  private past: HistoryEntry[] = [];
  private future: HistoryEntry[] = [];
  private current: HistoryEntry | null = null;
  private lastSavedState: HistoryEntry | null = null;
  private lastTokens: string[] = [];

  push(content: string, title: string): void {
    const newTokens = tokenizeForDiff(content);

    if (this.current) {
      if (isSubstantialChange(this.lastTokens, newTokens)) {
        this.past.push(this.current);
        this.current = { content, title };
        this.lastTokens = newTokens;
        this.future = [];

        if (this.past.length > MAX_HISTORY) {
          this.past.shift();
        }
      } else {
        this.current = { content, title };
        this.lastTokens = newTokens;
      }
    } else {
      this.current = { content, title };
      this.lastTokens = newTokens;
    }
  }

  undo(): HistoryEntry | null {
    if (this.past.length === 0) return null;
    if (this.current) {
      this.future.unshift(this.current);
    }
    this.current = this.past.pop() || null;
    if (this.current) {
      this.lastTokens = tokenizeForDiff(this.current.content);
    }
    return this.current;
  }

  redo(): HistoryEntry | null {
    if (this.future.length === 0) return null;
    if (this.current) {
      this.past.push(this.current);
    }
    this.current = this.future.shift() || null;
    if (this.current) {
      this.lastTokens = tokenizeForDiff(this.current.content);
    }
    return this.current;
  }

  canUndo(): boolean {
    return this.past.length > 0;
  }

  canRedo(): boolean {
    return this.future.length > 0;
  }

  clear(): void {
    this.past = [];
    this.future = [];
    this.current = null;
    this.lastTokens = [];
  }

  saveCurrentState(): void {
    this.lastSavedState = this.current ? { ...this.current } : null;
  }

  isCurrentStateDirty(): boolean {
    if (!this.current || !this.lastSavedState) {
      return this.current !== this.lastSavedState;
    }
    return (
      this.current.content !== this.lastSavedState.content ||
      this.current.title !== this.lastSavedState.title
    );
  }
}

export const editorHistory = new EditorHistory();
