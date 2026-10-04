import { html, webComponent } from "../../src/framework/web-components/index.ts";

export interface AppAccordionElement extends HTMLElement {
  open: boolean;
  toggle(): void;
}

export const appAccordion = webComponent("app-accordion")
  .defineObservedAttributes({
    open: false,
    summary: "",
    disabled: false,
  })
  .defineStyles(/* css */ `
    :host {
      display: block;
      box-sizing: border-box;
      font-family: inherit;
      color: var(--text, #18212a);
    }

    details {
      background: var(--surface, #f8fbfe);
      border: 1px solid var(--border, #d5e2ec);
      border-radius: 0.5rem;
      overflow: hidden;
      transition: border-color 0.15s ease;
    }

    details[open] {
      border-color: var(--accent, #2a6f97);
    }

    summary {
      align-items: center;
      cursor: pointer;
      display: flex;
      font-weight: 500;
      font-size: 0.95rem;
      justify-content: space-between;
      list-style: none;
      padding: 0.75rem 1rem;
      user-select: none;
      transition: background-color 0.15s ease;
    }

    summary::-webkit-details-marker {
      display: none;
    }

    summary:hover {
      background-color: var(--surface-sunken, #e2edf5);
    }

    summary:focus-visible {
      outline: 2px solid var(--accent, #2a6f97);
      outline-offset: -2px;
    }

    .icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      color: var(--muted, #5f758a);
    }

    details[open] .icon {
      transform: rotate(180deg);
      color: var(--accent, #2a6f97);
    }

    .content {
      border-top: 1px solid var(--border, #d5e2ec);
      box-sizing: border-box;
      padding: 0.85rem 1rem;
      background: var(--surface, #f8fbfe);
    }

    .disabled details {
      opacity: 0.6;
      cursor: not-allowed;
      pointer-events: none;
    }
  `)
  .defineProperty("open", {
    get(this: HTMLElement) {
      const details = this.shadowRoot?.querySelector<HTMLDetailsElement>("details");
      return details ? details.open : this.getAttribute("open") === "true";
    },
    set(this: HTMLElement, val: boolean) {
      this.setAttribute("open", String(val));
      const details = this.shadowRoot?.querySelector<HTMLDetailsElement>("details");
      if (details) details.open = val;
    },
  })
  .defineMethod("toggle", (element) => () => {
    const details = element.$<HTMLDetailsElement>("details");
    if (details) {
      details.open = !details.open;
      element.setAttribute("open", String(details.open));
      element.emit("toggle", { open: details.open });
    }
  })
  .defineRender((element) => {
    const { open, summary, disabled } = element.observedAttribute;

    const onToggle = (event: Event) => {
      const details = event.currentTarget as HTMLDetailsElement;
      element.setAttribute("open", String(details.open));
      element.emit("toggle", { open: details.open });
    };

    return html`
      <div class=${disabled ? "disabled" : ""}>
        <details ?open=${open} @toggle=${onToggle}>
          <summary>
            ${summary ? html`<span>${summary}</span>` : html`<slot name="summary"></slot>`}
            <span class="icon" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="4 6 8 10 12 6"></polyline>
              </svg>
            </span>
          </summary>
          <div class="content">
            <slot></slot>
          </div>
        </details>
      </div>
    `;
  })
  .create();
