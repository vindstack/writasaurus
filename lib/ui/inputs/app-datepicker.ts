import { html, webComponent } from "../../../src/framework/web-components/index.ts";

export interface AppDatePickerElement extends HTMLElement {
  value: string;
  focus(): void;
  showPicker(): void;
}

export const appDatePicker = webComponent("app-datepicker")
  .defineObservedAttributes({
    value: "",
    name: "",
    min: "",
    max: "",
    step: "",
    disabled: false,
    required: false,
    readonly: false,
    label: "",
    helperText: "",
  })
  .defineStyles(/* css */ `
    :host {
      display: inline-flex;
      flex-direction: column;
      gap: 0.35rem;
      font-family: inherit;
      color: var(--text, #18212a);
    }

    label {
      font-size: 0.85rem;
      font-weight: 500;
      color: var(--text, #18212a);
    }

    .input-wrapper {
      position: relative;
      display: inline-flex;
      align-items: center;
      width: 100%;
    }

    input[type="date"] {
      appearance: none;
      -webkit-appearance: none;
      box-sizing: border-box;
      width: 100%;
      background: var(--surface, #f8fbfe);
      border: 1px solid var(--border, #d5e2ec);
      border-radius: 0.5rem;
      color: var(--text, #18212a);
      font-family: inherit;
      font-size: 0.95rem;
      line-height: 1.5;
      padding: 0.45rem 0.65rem;
      outline: none;
      transition: border-color 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease;
    }

    input[type="date"]::-webkit-calendar-picker-indicator {
      cursor: pointer;
      opacity: 0.7;
      filter: invert(0.2);
      transition: opacity 0.15s ease;
    }

    input[type="date"]::-webkit-calendar-picker-indicator:hover {
      opacity: 1;
    }

    input[type="date"]:hover:not(:disabled) {
      border-color: var(--accent, #2a6f97);
    }

    input[type="date"]:focus {
      border-color: var(--accent, #2a6f97);
      box-shadow: 0 0 0 2px var(--accent, #2a6f97);
    }

    input[type="date"]:disabled {
      background: var(--surface-sunken, #e2edf5);
      border-color: var(--border, #d5e2ec);
      color: var(--muted, #5f758a);
      cursor: not-allowed;
      opacity: 0.7;
    }

    .helper-text {
      font-size: 0.78rem;
      color: var(--muted, #5f758a);
    }
  `)
  .defineProperty("value", {
    get(this: HTMLElement) {
      const input = this.shadowRoot?.querySelector<HTMLInputElement>("input");
      return input ? input.value : this.getAttribute("value") ?? "";
    },
    set(this: HTMLElement, val: string) {
      this.setAttribute("value", val);
      const input = this.shadowRoot?.querySelector<HTMLInputElement>("input");
      if (input) input.value = val;
    },
  })
  .defineMethod("focus", (element) => () => {
    element.$<HTMLInputElement>("input")?.focus();
  })
  .defineMethod("showPicker", (element) => () => {
    const input = element.$<HTMLInputElement>("input");
    if (
      input &&
      typeof (input as HTMLInputElement & { showPicker?: () => void }).showPicker === "function"
    ) {
      (input as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
    } else {
      input?.focus();
    }
  })
  .defineRender((element) => {
    const {
      value,
      name,
      min,
      max,
      step,
      disabled,
      required,
      readonly,
      label,
      helperText,
    } = element.observedAttribute;

    const onInput = (event: Event) => {
      const target = event.currentTarget as HTMLInputElement;
      element.setAttribute("value", target.value);
      element.emit("input", { value: target.value });
    };

    const onChange = (event: Event) => {
      const target = event.currentTarget as HTMLInputElement;
      element.setAttribute("value", target.value);
      element.emit("change", { value: target.value });
    };

    return html`
      ${label ? html`<label for="picker-input">${label}</label>` : null}
      <div class="input-wrapper">
        <input
          id="picker-input"
          type="date"
          .value=${value}
          name=${name}
          min=${min || undefined}
          max=${max || undefined}
          step=${step || undefined}
          ?disabled=${disabled}
          ?required=${required}
          ?readonly=${readonly}
          @input=${onInput}
          @change=${onChange}
        />
      </div>
      ${helperText ? html`<span class="helper-text">${helperText}</span>` : null}
    `;
  })
  .create();
