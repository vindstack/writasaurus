import { html, webComponent } from "../../../src/framework/web-components/index.ts";

export interface AppSegmentedControlElement extends HTMLElement {
  value: string;
  focus(): void;
}

export const appSegmentedControl = webComponent("app-segmented-control")
  .defineObservedAttributes({
    value: "",
    name: "",
    disabled: false,
    required: false,
  })
  .defineStyles(/* css */ `
    :host {
      display: flex;
      font-family: inherit;
      color: var(--text, #18212a);
      width: 100%;
    }

    .segmented-control {
      align-items: stretch;
      background: var(--surface-sunken, #e2edf5);
      border: 1px solid var(--border, #d5e2ec);
      border-radius: 0.4rem;
      box-sizing: border-box;
      display: flex;
      flex: 1;
      gap: 1px;
      overflow: hidden;
      padding: 0.15rem;
    }

    .segmented-control button {
      align-items: center;
      background: transparent;
      border: 0;
      border-radius: 0.3rem;
      color: var(--text, #18212a);
      cursor: pointer;
      display: flex;
      flex: 1;
      font: inherit;
      font-size: 0.85rem;
      gap: 0.35rem;
      justify-content: center;
      min-height: 1.6rem;
      padding: 0.25rem 0.5rem;
      transition: background-color 0.15s ease, color 0.15s ease;
      white-space: nowrap;
    }

    .segmented-control button:hover:not(:disabled):not([aria-pressed="true"]) {
      background: var(--surface, #f8fbfe);
    }

    .segmented-control button[aria-pressed="true"] {
      background: var(--surface, #f8fbfe);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
      color: var(--accent, #2a6f97);
      font-weight: 600;
    }

    .segmented-control button:focus-visible {
      outline: 2px solid var(--accent, #2a6f97);
      outline-offset: -2px;
    }

    .segmented-control button:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }
  `)
  .defineProperty("value", {
    get(this: HTMLElement) {
      return this.getAttribute("value") ?? "";
    },
    set(this: HTMLElement, val: string) {
      this.setAttribute("value", val);
    },
  })
  .defineMethod("focus", (element) => () => {
    element.$<HTMLButtonElement>(`button[value="${element.getAttribute("value")}"]`)?.focus();
  })
  .defineRender((element) => {
    const { value, name, disabled } = element.observedAttribute;

    const onClick = (event: Event) => {
      const target = event.currentTarget as HTMLButtonElement;
      const selectedValue = target.value;
      element.setAttribute("value", selectedValue);
      element.emit("change", { value: selectedValue });
    };

    const options = Array.from(element.querySelectorAll<HTMLOptionElement>("option")).map(
      (option) => ({
        value: option.value,
        label: option.textContent?.trim() ?? option.value,
      }),
    );

    return html`
      <div class="segmented-control" role="group" aria-label=${name || undefined}>
        ${options.map((option) =>
          html`
            <button
              type="button"
              value=${option.value}
              aria-pressed=${String(value === option.value)}
              ?disabled=${disabled}
              @click=${onClick}
            >
              ${option.label}
            </button>
          `
        )}
      </div>
    `;
  })
  .create();
