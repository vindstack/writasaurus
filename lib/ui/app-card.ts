import { html, webComponent } from "../../src/framework/web-components/index.ts";

export interface AppCardElement extends HTMLElement {
  variant: "default" | "outlined" | "sunken" | "elevated";
}

export const appCard = webComponent("app-card")
  .defineObservedAttributes({
    variant: "default" as "default" | "outlined" | "sunken" | "elevated",
    padding: "medium" as "none" | "small" | "medium" | "large",
    interactive: false,
  })
  .defineStyles(/* css */ `
    :host {
      display: block;
      box-sizing: border-box;
      font-family: inherit;
      color: var(--text, #18212a);
    }

    .card {
      background: var(--surface, #f8fbfe);
      border-radius: 0.75rem;
      border: 1px solid var(--border, #d5e2ec);
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
    }

    /* Variants */
    .card.variant-default {
      background: var(--surface, #f8fbfe);
      border: 1px solid var(--border, #d5e2ec);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }

    .card.variant-outlined {
      background: transparent;
      border: 1px solid var(--border, #d5e2ec);
      box-shadow: none;
    }

    .card.variant-sunken {
      background: var(--surface-sunken, #e2edf5);
      border: 1px solid var(--border, #d5e2ec);
      box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.04);
    }

    .card.variant-elevated {
      background: var(--surface, #f8fbfe);
      border: 1px solid var(--border, #d5e2ec);
      box-shadow: 0 8px 16px -4px rgba(0, 0, 0, 0.08), 0 2px 4px -2px rgba(0, 0, 0, 0.04);
    }

    /* Padding */
    .card.padding-none {
      padding: 0;
    }

    .card.padding-small {
      padding: 0.5rem 0.75rem;
    }

    .card.padding-medium {
      padding: 1rem 1.25rem;
    }

    .card.padding-large {
      padding: 1.5rem 1.75rem;
    }

    /* Interactive */
    .card.interactive {
      cursor: pointer;
    }

    .card.interactive:hover {
      border-color: var(--accent, #2a6f97);
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    }

    ::slotted([slot="header"]) {
      margin-bottom: 0.75rem;
    }

    ::slotted([slot="footer"]) {
      margin-top: 0.75rem;
      border-top: 1px solid var(--border, #d5e2ec);
      padding-top: 0.75rem;
    }
  `)
  .defineRender((element) => {
    const { variant, padding, interactive } = element.observedAttribute;
    const classes = [
      "card",
      `variant-${variant}`,
      `padding-${padding}`,
      interactive ? "interactive" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return html`
      <div class=${classes}>
        <slot name="header"></slot>
        <slot></slot>
        <slot name="footer"></slot>
      </div>
    `;
  })
  .create();
