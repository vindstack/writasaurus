import { html, webComponent } from "../../../framework/web-components/index.ts";
import { editorEvents } from "./editor-events.ts";
import "../../../../lib/ui/app-tooltip.ts";

function preserveEditorSelection(event: Event): void {
  const target = event.target as HTMLElement | null;
  if (target?.closest("[data-command]")) event.preventDefault();
}

function handleToolbarClick(event: Event): void {
  const root = event.currentTarget;
  if (!(root instanceof ShadowRoot)) return;

  const toolbar = root.host;
  const target = event.target as HTMLElement | null;
  const button = target?.closest<HTMLButtonElement>("[data-command]");
  if (!button || !root.contains(button)) return;

  const command = button.dataset.command;
  if (!command) return;
  const value = button.dataset.value;
  editorEvents.emit("command", {
    command,
    target: toolbar.getAttribute("for") || "#editor",
    value,
  });
}

webComponent("editor-toolbar")
  .defineStyles(/* css */ `
      :host {
        align-items: center;
        display: flex;
        flex: 0 0 auto;
        gap: 0.35rem;
      }

      button {
        background: transparent;
        border: 1px solid var(--border);
        border-radius: 0.35rem;
        color: var(--text);
        font: inherit;
        min-height: 2.25rem;
        padding: 0.35rem 0.6rem;
        white-space: nowrap;
      }

      button.small {
        align-items: center;
        border-radius: 0.3rem;
        display: inline-flex;
        font-size: 0.72rem;
        gap: 0.35rem;
        min-height: 1.6rem;
        padding: 0.2rem 0.5rem;
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

      @media (max-width: 36rem) {
        :host {
          display: none;
        }
      }
    `)
  .defineRender(() =>
    html`
      <app-tooltip content="Bold (Ctrl+B)" position="bottom">
        <button type="button" class="small" data-command="bold"><strong>B</strong></button>
      </app-tooltip>
      <app-tooltip content="Italic (Ctrl+I)" position="bottom">
        <button type="button" class="small" data-command="italic"><em>I</em></button>
      </app-tooltip>
      <app-tooltip content="Bullet List" position="bottom">
        <button type="button" class="small" data-command="insertUnorderedList">List</button>
      </app-tooltip>
    `
  )
  .connectedCallback((toolbar) => {
    toolbar.root.addEventListener("mousedown", preserveEditorSelection);
    toolbar.root.addEventListener("click", handleToolbarClick);
  })
  .disconnectedCallback((toolbar) => {
    toolbar.root.removeEventListener("mousedown", preserveEditorSelection);
    toolbar.root.removeEventListener("click", handleToolbarClick);
  })
  .create();
