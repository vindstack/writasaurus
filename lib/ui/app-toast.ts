import { html, webComponent } from "../../src/framework/web-components/index.ts";

export interface AppToastElement extends HTMLElement {
  show(): void;
  dismiss(): void;
}

export const appToast = webComponent("app-toast")
  .defineObservedAttributes({
    variant: "info" as "info" | "success" | "warning" | "error",
    open: false,
    duration: 3000,
  })
  .defineStyles(/* css */ `
    :host {
      display: inline-block;
      font-family: inherit;
    }

    .toast {
      align-items: center;
      background: var(--surface, #f8fbfe);
      border: 1px solid var(--border, #d5e2ec);
      border-radius: 0.5rem;
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
      box-sizing: border-box;
      color: var(--text, #18212a);
      display: none;
      font-size: 0.9rem;
      gap: 0.75rem;
      max-width: 380px;
      min-width: 240px;
      padding: 0.75rem 1rem;
      transition: transform 0.2s ease, opacity 0.2s ease;
    }

    .toast.open {
      display: flex;
      animation: toast-in 0.2s ease-out;
    }

    @keyframes toast-in {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    /* Variants */
    .toast.variant-info {
      border-left: 4px solid var(--accent, #2a6f97);
    }

    .toast.variant-success {
      border-left: 4px solid #2b9348;
    }

    .toast.variant-warning {
      border-left: 4px solid #e85d04;
    }

    .toast.variant-error {
      border-left: 4px solid #d90429;
    }

    .content {
      flex: 1;
    }

    .dismiss-btn {
      align-items: center;
      background: transparent;
      border: none;
      border-radius: 0.25rem;
      color: var(--muted, #5f758a);
      cursor: pointer;
      display: inline-flex;
      height: 1.5rem;
      justify-content: center;
      padding: 0;
      transition: background-color 0.15s ease, color 0.15s ease;
      width: 1.5rem;
    }

    .dismiss-btn:hover {
      background-color: var(--surface-sunken, #e2edf5);
      color: var(--text, #18212a);
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
  .defineMethod("dismiss", (element) => () => {
    element.setAttribute("open", "false");
    element.emit("dismiss", {});
  })
  .defineMethod("show", (element) => () => {
    element.setAttribute("open", "true");
    element.emit("show", {});

    const duration = Number(element.getAttribute("duration")) || 3000;
    if (duration > 0) {
      setTimeout(() => {
        element.dismiss();
      }, duration);
    }
  })
  .defineRender((element) => {
    const { variant, open } = element.observedAttribute;

    const onDismiss = () => {
      element.dismiss();
    };

    return html`
      <div class=${`toast variant-${variant} ${open ? "open" : ""}`} role="status">
        <div class="content">
          <slot></slot>
        </div>
        <button type="button" class="dismiss-btn" aria-label="Dismiss toast" @click=${onDismiss}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    `;
  })
  .create();
