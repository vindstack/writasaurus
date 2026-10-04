import { html, webComponent } from "../../src/framework/web-components/index.ts";

export interface AppChipElement extends HTMLElement {
  removable: boolean;
  selected: boolean;
}

export const appChip = webComponent("app-chip")
  .defineObservedAttributes({
    variant: "default" as "default" | "accent" | "outline",
    removable: false,
    selected: false,
    disabled: false,
  })
  .defineStyles(/* css */ `
    :host {
      display: inline-flex;
      font-family: inherit;
      color: var(--text, #18212a);
    }

    .chip {
      align-items: center;
      border-radius: 9999px;
      box-sizing: border-box;
      display: inline-flex;
      font-size: 0.85rem;
      font-weight: 500;
      gap: 0.35rem;
      line-height: 1.2;
      padding: 0.3rem 0.75rem;
      transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
      user-select: none;
    }

    /* Variants */
    .chip.variant-default {
      background: var(--surface-sunken, #e2edf5);
      border: 1px solid var(--border, #d5e2ec);
      color: var(--text, #18212a);
    }

    .chip.variant-outline {
      background: transparent;
      border: 1px solid var(--border, #d5e2ec);
      color: var(--text, #18212a);
    }

    .chip.variant-accent {
      background: var(--accent, #2a6f97);
      border: 1px solid var(--accent, #2a6f97);
      color: var(--accent-text, #f8fbfe);
    }

    /* Selected state */
    .chip.selected:not(.variant-accent) {
      background: var(--accent, #2a6f97);
      border-color: var(--accent, #2a6f97);
      color: var(--accent-text, #f8fbfe);
    }

    /* Disabled */
    .chip.disabled {
      opacity: 0.6;
      cursor: not-allowed;
      pointer-events: none;
    }

    .remove-btn {
      align-items: center;
      background: transparent;
      border: none;
      border-radius: 50%;
      color: inherit;
      cursor: pointer;
      display: inline-flex;
      height: 1rem;
      justify-content: center;
      margin-left: 0.1rem;
      margin-right: -0.25rem;
      opacity: 0.7;
      padding: 0;
      transition: opacity 0.15s ease, background-color 0.15s ease;
      width: 1rem;
    }

    .remove-btn:hover {
      opacity: 1;
      background-color: rgba(0, 0, 0, 0.1);
    }

    .remove-btn:focus-visible {
      outline: 2px solid currentColor;
    }
  `)
  .defineRender((element) => {
    const { variant, removable, selected, disabled } = element.observedAttribute;

    const classes = [
      "chip",
      `variant-${variant}`,
      selected ? "selected" : "",
      disabled ? "disabled" : "",
    ]
      .filter(Boolean)
      .join(" ");

    const onRemove = (event: Event) => {
      event.stopPropagation();
      element.emit("remove", {});
    };

    return html`
      <div class=${classes}>
        <slot name="icon"></slot>
        <slot></slot>
        ${removable
          ? html`
            <button
              type="button"
              class="remove-btn"
              aria-label="Remove"
              @click=${onRemove}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round">
                <line x1="2" y1="2" x2="10" y2="10"></line>
                <line x1="10" y1="2" x2="2" y2="10"></line>
              </svg>
            </button>
          `
          : null}
      </div>
    `;
  })
  .create();
