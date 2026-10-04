import { html, webComponent } from "../../src/framework/web-components/index.ts";

export interface AppAlertElement extends HTMLElement {
  dismiss(): void;
}

export const appAlert = webComponent("app-alert")
  .defineObservedAttributes({
    variant: "info" as "info" | "success" | "warning" | "error",
    dismissible: false,
    title: "",
  })
  .defineStyles(/* css */ `
    :host {
      display: block;
      font-family: inherit;
      width: 100%;
    }

    .alert {
      align-items: flex-start;
      border-radius: 0.5rem;
      border: 1px solid var(--border, #d5e2ec);
      box-sizing: border-box;
      display: flex;
      font-size: 0.9rem;
      gap: 0.75rem;
      padding: 0.85rem 1rem;
      width: 100%;
    }

    /* Variants */
    .alert.variant-info {
      background-color: var(--surface-sunken, #e2edf5);
      border-color: var(--border, #d5e2ec);
      border-left: 4px solid var(--accent, #2a6f97);
      color: var(--text, #18212a);
    }

    .alert.variant-success {
      background-color: #ebfbee;
      border-color: #c3e6cb;
      border-left: 4px solid #2b9348;
      color: #1b4332;
    }

    .alert.variant-warning {
      background-color: #fff4e6;
      border-color: #ffe8cc;
      border-left: 4px solid #e85d04;
      color: #7f2704;
    }

    .alert.variant-error {
      background-color: #ffe3e3;
      border-color: #ffc9c9;
      border-left: 4px solid #d90429;
      color: #800f2f;
    }

    .content-area {
      flex: 1;
    }

    .title {
      font-weight: 600;
      margin-bottom: 0.25rem;
    }

    .dismiss-btn {
      align-items: center;
      background: transparent;
      border: none;
      border-radius: 0.25rem;
      color: inherit;
      cursor: pointer;
      display: inline-flex;
      height: 1.5rem;
      justify-content: center;
      opacity: 0.7;
      padding: 0;
      transition: opacity 0.15s ease;
      width: 1.5rem;
    }

    .dismiss-btn:hover {
      opacity: 1;
    }
  `)
  .defineMethod("dismiss", (element) => () => {
    element.remove();
    element.emit("dismiss", {});
  })
  .defineRender((element) => {
    const { variant, dismissible, title } = element.observedAttribute;

    const onDismiss = () => {
      element.dismiss();
    };

    return html`
      <div class=${`alert variant-${variant}`} role="alert">
        <slot name="icon"></slot>
        <div class="content-area">
          ${title ? html`<div class="title">${title}</div>` : null}
          <slot></slot>
        </div>
        ${dismissible
          ? html`
            <button type="button" class="dismiss-btn" aria-label="Dismiss alert" @click=${onDismiss}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          `
          : null}
      </div>
    `;
  })
  .create();
