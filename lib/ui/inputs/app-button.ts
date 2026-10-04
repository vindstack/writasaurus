import { html, webComponent } from "../../../src/framework/web-components/index.ts";

export type ButtonVariant = "primary" | "secondary" | "subtle" | "danger";
export type ButtonSize = "small" | "medium" | "large";

export interface AppButtonElement extends HTMLElement {
  focus(): void;
}

export const appButton = webComponent("app-button")
  .defineObservedAttributes({
    variant: "secondary" as ButtonVariant,
    size: "medium" as ButtonSize,
    type: "button",
    disabled: false,
  })
  .defineStyles(/* css */ `
    :host {
      display: inline-block;
      font-family: inherit;
    }

    button {
      align-items: center;
      border: 1px solid transparent;
      border-radius: 0.4rem;
      box-sizing: border-box;
      cursor: pointer;
      display: inline-flex;
      font: inherit;
      font-weight: 500;
      gap: 0.5rem;
      justify-content: center;
      line-height: 1.4;
      outline: none;
      text-decoration: none;
      transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease, transform 0.05s ease;
      white-space: nowrap;
      width: 100%;
    }

    /* Sizes */
    button.size-small {
      font-size: 0.75rem;
      min-height: 1.6rem;
      padding: 0.2rem 0.5rem;
    }

    button.size-medium {
      font-size: 0.9rem;
      min-height: 2.2rem;
      padding: 0.45rem 0.9rem;
    }

    button.size-large {
      font-size: 1rem;
      min-height: 2.75rem;
      padding: 0.65rem 1.25rem;
    }

    /* Variants */
    button.variant-primary {
      background: var(--accent, #2a6f97);
      border-color: var(--accent, #2a6f97);
      color: var(--accent-text, #f8fbfe);
    }

    button.variant-primary:hover:not(:disabled) {
      filter: brightness(1.1);
    }

    button.variant-secondary {
      background: var(--surface-sunken, #e2edf5);
      border-color: var(--border, #d5e2ec);
      color: var(--text, #18212a);
    }

    button.variant-secondary:hover:not(:disabled) {
      background: var(--border, #d5e2ec);
    }

    button.variant-subtle {
      background: transparent;
      border-color: var(--border, #d5e2ec);
      color: var(--text, #18212a);
    }

    button.variant-subtle:hover:not(:disabled) {
      background: var(--surface-sunken, #e2edf5);
    }

    button.variant-danger {
      background: transparent;
      border-color: var(--danger, #b91c1c);
      color: var(--danger, #b91c1c);
    }

    button.variant-danger:hover:not(:disabled) {
      background: var(--danger, #b91c1c);
      color: #ffffff;
    }

    /* Active / Focus / Disabled */
    button:active:not(:disabled) {
      transform: translateY(1px) scale(0.98);
    }

    button:focus-visible {
      border-color: var(--accent, #2a6f97);
      box-shadow: 0 0 0 2px var(--accent, #2a6f97);
    }

    button:disabled {
      cursor: not-allowed;
      opacity: 0.5;
      transform: none;
    }
  `)
  .defineMethod("focus", (element) => () => {
    element.$<HTMLButtonElement>("button")?.focus();
  })
  .defineRender((element) => {
    const { variant, size, type, disabled } = element.observedAttribute;
    const buttonClass = `variant-${variant} size-${size}`;

    return html`
      <button
        class=${buttonClass}
        type=${type}
        ?disabled=${disabled}
      >
        <slot></slot>
      </button>
    `;
  })
  .create();
