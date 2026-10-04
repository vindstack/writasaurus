import { html, webComponent } from "../../../framework/web-components/index.ts";
import {
  getDailyWordGoalPreference,
  getDailyWrittenWords,
  getWordsPerPagePreference,
} from "../../../../lib/settings.ts";
import { editorEvents, toggleWritingAssistancePanel } from "./editor-events.ts";
import { activeChapter, editorStore, totalWords } from "./state.ts";
import "./word-count.ts";

function toggleSidebar(): void {
  editorEvents.emit("toggleSidebar", undefined);
}

export const editorStatusbar = webComponent("editor-statusbar")
  .subscribe(editorStore)
  .defineStyles(/* css */ `
    :host {
      align-items: center;
      background: var(--surface);
      border-top: 1px solid var(--border);
      box-sizing: border-box;
      color: var(--muted);
      display: flex;
      font-size: 0.75rem;
      gap: 0.75rem;
      justify-content: space-between;
      max-width: 100%;
      min-width: 0;
      overflow: hidden;
      padding: 0.5rem 1rem;
      position: relative;
    }

    button {
      align-items: center;
      background: transparent;
      border: 1px solid var(--border);
      border-radius: 0.3rem;
      color: var(--text);
      display: inline-flex;
      flex-shrink: 0;
      font: inherit;
      font-size: 0.72rem;
      gap: 0.35rem;
      min-height: 1.6rem;
      padding: 0.2rem 0.5rem;
      white-space: nowrap;
    }

    button:active:not(:disabled) {
      background: var(--surface-sunken);
      box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.15);
      transform: translateY(1px) scale(0.98);
    }

    button:disabled {
      box-shadow: none;
      cursor: not-allowed;
      opacity: 0.45;
      transform: none;
    }

    kbd {
      background: var(--surface-sunken);
      border: 1px solid var(--border);
      border-radius: 0.25rem;
      color: var(--muted);
      font-size: 0.65rem;
      padding: 0.05rem 0.3rem;
    }

    @media (max-width: 55rem) {
      :host {
        gap: 0.5rem;
        padding: 0.4rem 0.75rem;
      }
    }
  `)
  .defineRender(() => {
    const chapter = activeChapter();
    const manuscript = editorStore.state.manuscript;
    const manuscriptId = `${manuscript.filename}:${manuscript.frontmatter.createdAt ?? ""}`;
    const total = totalWords();

    return html`
      <button type="button" aria-label="Toggle chapters panel" title="Toggle chapters panel (Ctrl+B)"
        @click=${toggleSidebar}>
        Chapters <kbd>Ctrl+B</kbd>
      </button>
      ${editorStore.state.isDesktop
        ? html`
          <button
            type="button"
            aria-label="Toggle writing assistance panel"
            title="Toggle writing assistance panel (Ctrl+N)"
            @click=${toggleWritingAssistancePanel}>
            Writing Assistance <kbd>Ctrl+N</kbd>
          </button>
        `
        : ""}
      <word-count
        chapter-words=${chapter?.wordCount ?? 0}
        total-words=${total}
        words-per-page=${getWordsPerPagePreference()}
        daily-words=${getDailyWrittenWords(manuscriptId, total)}
        daily-word-goal=${getDailyWordGoalPreference()}
      ></word-count>
    `;
  })
  .create();
