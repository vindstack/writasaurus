import { html, webComponent } from "../../../src/framework/web-components/index.ts";

export interface AppSelectOption {
  value: string;
  label: string;
  selected?: boolean;
}

export interface AppSelectElement extends HTMLElement {
  value: string;
  focus(): void;
}

export const appSelect = webComponent("app-select")
  .defineObservedAttributes({
    value: "",
    label: "",
    name: "",
    disabled: false,
    required: false,
  })
  .defineStyles(/* css */ `
    :host {
      display: inline-flex;
      flex-direction: column;
      gap: 0.35rem;
      font-family: inherit;
      color: var(--text, #18212a);
      width: 100%;
    }

    label {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--text, #18212a);
    }

    .select-wrapper {
      display: flex;
      position: relative;
      width: 100%;
    }

    select {
      appearance: none;
      -webkit-appearance: none;
      background-color: var(--surface-sunken, #e2edf5);
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%23667684' viewBox='0 0 16 16'%3E%3Cpath d='M7.247 11.14 2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: calc(100% - 0.85rem) center;
      border: 1px solid var(--border, #d5e2ec);
      border-radius: 0.4rem;
      box-sizing: border-box;
      color: var(--text, #18212a);
      cursor: pointer;
      font: inherit;
      font-size: 1rem;
      line-height: 1.5;
      padding: 0.65rem 2.2rem 0.65rem 0.85rem;
      outline: none;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
      width: 100%;
    }

    select:focus-visible {
      border-color: var(--accent, #2a6f97);
      box-shadow: 0 0 0 2px var(--accent, #2a6f97);
    }

    select:disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }

    :host([disabled="true"]) label,
    :host([disabled]) label {
      opacity: 0.6;
      cursor: not-allowed;
    }
  `)
  .defineProperty("value", {
    get(this: HTMLElement) {
      const select = this.shadowRoot?.querySelector<HTMLSelectElement>("select");
      return select ? select.value : this.getAttribute("value") ?? "";
    },
    set(this: HTMLElement, val: string) {
      this.setAttribute("value", val);
      const select = this.shadowRoot?.querySelector<HTMLSelectElement>("select");
      if (select) select.value = val;
    },
  })
  .defineMethod("focus", (element) => () => {
    element.$<HTMLSelectElement>("select")?.focus();
  })
  .defineRender((element) => {
    const {
      value,
      label,
      name,
      disabled,
      required,
    } = element.observedAttribute;

    const onChange = (event: Event) => {
      const target = event.currentTarget as HTMLSelectElement;
      element.setAttribute("value", target.value);
      element.emit("change", { value: target.value });
    };

    return html`
      ${label ? html`<label>${label}</label>` : ""}
      <div class="select-wrapper">
        <select
          .value=${value}
          name=${name}
          ?disabled=${disabled}
          ?required=${required}
          @change=${onChange}
        >
          <slot></slot>
        </select>
      </div>
    `;
  })
  .connectedCallback((element) => {
    const select = element.$<HTMLSelectElement>("select");
    if (!select) return;
    const initialValue = element.getAttribute("value");
    if (initialValue !== null) select.value = initialValue;

    const syncSlot = () => {
      if (element.getAttribute("value") !== null) {
        select.value = element.getAttribute("value")!;
      }
    };
    element.$<HTMLSlotElement>("slot")?.addEventListener("slotchange", syncSlot);
  })
  .create();
