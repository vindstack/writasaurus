import { html, webComponent } from "../../src/framework/web-components/index.ts";

export interface AppDrawerElement extends HTMLElement {
  open: boolean;
  show(): void;
  close(): void;
  toggle(): void;
}

export const appDrawer = webComponent("app-drawer")
  .defineObservedAttributes({
    open: false,
    placement: "left" as "left" | "right",
    title: "",
  })
  .defineStyles(/* css */ `
    :host {
      display: contents;
      font-family: inherit;
      color: var(--text, #18212a);
    }

    .backdrop {
      background-color: rgba(24, 33, 42, 0.4);
      backdrop-filter: blur(2px);
      height: 100vh;
      left: 0;
      opacity: 0;
      pointer-events: none;
      position: fixed;
      top: 0;
      transition: opacity 0.25s ease;
      width: 100vw;
      z-index: 999;
    }

    .backdrop.open {
      opacity: 1;
      pointer-events: auto;
    }

    .drawer {
      background: var(--surface, #f8fbfe);
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.15);
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      height: 100vh;
      max-width: 85vw;
      position: fixed;
      top: 0;
      transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      width: 320px;
      z-index: 1000;
    }

    .drawer.left {
      left: 0;
      transform: translateX(-100%);
      border-right: 1px solid var(--border, #d5e2ec);
    }

    .drawer.left.open {
      transform: translateX(0);
    }

    .drawer.right {
      right: 0;
      transform: translateX(100%);
      border-left: 1px solid var(--border, #d5e2ec);
    }

    .drawer.right.open {
      transform: translateX(0);
    }

    .drawer-header {
      align-items: center;
      border-bottom: 1px solid var(--border, #d5e2ec);
      display: flex;
      justify-content: space-between;
      padding: 1rem 1.25rem;
    }

    .drawer-title {
      font-size: 1.1rem;
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

    .drawer-body {
      flex: 1;
      overflow-y: auto;
      padding: 1.25rem;
    }

    .drawer-footer {
      border-top: 1px solid var(--border, #d5e2ec);
      padding: 1rem 1.25rem;
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
  .defineMethod("toggle", (element) => () => {
    const isOpen = element.getAttribute("open") === "true";
    if (isOpen) {
      element.close();
    } else {
      element.show();
    }
  })
  .defineRender((element) => {
    const { open, placement, title } = element.observedAttribute;

    const onClose = () => {
      element.close();
    };

    return html`
      <div class=${`backdrop ${open ? "open" : ""}`} @click=${onClose}></div>
      <aside class=${`drawer ${placement} ${open ? "open" : ""}`} role="dialog" aria-modal="true">
        <div class="drawer-header">
          <slot name="header">
            ${title ? html`<h2 class="drawer-title">${title}</h2>` : null}
          </slot>
          <button type="button" class="close-btn" aria-label="Close drawer" @click=${onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="drawer-body">
          <slot></slot>
        </div>
        <div class="drawer-footer">
          <slot name="footer"></slot>
        </div>
      </aside>
    `;
  })
  .create();
