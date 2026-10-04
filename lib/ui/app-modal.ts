import { html, webComponent } from "../../src/framework/web-components/index.ts";

export interface AppModalElement extends HTMLElement {
  open: boolean;
  show(): void;
  close(): void;
}

export const appModal = webComponent("app-modal")
  .defineObservedAttributes({
    open: false,
    title: "",
    size: "medium" as "small" | "medium" | "large",
  })
  .defineStyles(/* css */ `
    :host {
      display: contents;
      font-family: inherit;
      color: var(--text, #18212a);
    }

    dialog {
      background: transparent;
      border: none;
      padding: 0;
      margin: 0;
      width: 100vw;
      height: 100vh;
      max-width: 100vw;
      max-height: 100vh;
      display: none;
      align-items: center;
      justify-content: center;
      position: fixed;
      top: 0;
      left: 0;
      z-index: 1000;
    }

    dialog[open] {
      display: flex;
    }

    .backdrop {
      background-color: rgba(24, 33, 42, 0.45);
      backdrop-filter: blur(2px);
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
    }

    .modal-box {
      background: var(--surface, #f8fbfe);
      border: 1px solid var(--border, #d5e2ec);
      border-radius: 0.75rem;
      box-shadow: 0 12px 36px rgba(0, 0, 0, 0.2);
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      max-height: 90vh;
      overflow: hidden;
      position: relative;
      width: 90%;
      z-index: 1;
      animation: modal-enter 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes modal-enter {
      from {
        opacity: 0;
        transform: scale(0.96) translateY(4px);
      }
      to {
        opacity: 1;
        transform: scale(1) translateY(0);
      }
    }

    .modal-box.size-small {
      max-width: 400px;
    }

    .modal-box.size-medium {
      max-width: 560px;
    }

    .modal-box.size-large {
      max-width: 800px;
    }

    .modal-header {
      align-items: center;
      border-bottom: 1px solid var(--border, #d5e2ec);
      display: flex;
      justify-content: space-between;
      padding: 1rem 1.25rem;
    }

    .modal-title {
      font-size: 1.15rem;
      font-weight: 600;
      margin: 0;
    }

    .close-btn {
      align-items: center;
      background: transparent;
      border: none;
      border-radius: 0.35rem;
      color: var(--muted, #5f758a);
      cursor: pointer;
      display: inline-flex;
      height: 2rem;
      justify-content: center;
      padding: 0;
      transition: background-color 0.15s ease, color 0.15s ease;
      width: 2rem;
    }

    .close-btn:hover {
      background-color: var(--surface-sunken, #e2edf5);
      color: var(--text, #18212a);
    }

    .modal-body {
      flex: 1;
      overflow-y: auto;
      padding: 1.25rem;
    }

    .modal-footer {
      border-top: 1px solid var(--border, #d5e2ec);
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
      padding: 0.85rem 1.25rem;
    }
  `)
  .defineProperty("open", {
    get(this: HTMLElement) {
      return this.getAttribute("open") === "true";
    },
    set(this: HTMLElement, val: boolean) {
      this.setAttribute("open", String(val));
    },
  })
  .defineMethod("show", (element) => () => {
    element.setAttribute("open", "true");
    element.emit("open", {});
  })
  .defineMethod("close", (element) => () => {
    element.setAttribute("open", "false");
    element.emit("close", {});
  })
  .defineRender((element) => {
    const { open, title, size } = element.observedAttribute;

    const onClose = () => {
      element.close();
    };

    return html`
      <dialog ?open=${open}>
        <div class="backdrop" @click=${onClose}></div>
        <div class=${`modal-box size-${size}`} role="document">
          <div class="modal-header">
            <slot name="header">
              ${title ? html`<h2 class="modal-title">${title}</h2>` : null}
            </slot>
            <button type="button" class="close-btn" aria-label="Close dialog" @click=${onClose}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="2" stroke-linecap="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <slot></slot>
          </div>
          <div class="modal-footer">
            <slot name="footer"></slot>
          </div>
        </div>
      </dialog>
    `;
  })
  .create();
