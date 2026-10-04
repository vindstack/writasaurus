import { html, webComponent } from "../../../src/framework/web-components/index.ts";

export interface AppInputElement extends HTMLElement {
  value: string;
  focus(): void;
  select(): void;
}

export const appInput = webComponent("app-input")
  .defineObservedAttributes({
    value: "",
    type: "text",
    placeholder: "",
    label: "",
    name: "",
    disabled: false,
    readonly: false,
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

    .input-wrapper {
      display: flex;
      position: relative;
      width: 100%;
    }

    input {
      background: var(--surface-sunken, #e2edf5);
      border: 1px solid var(--border, #d5e2ec);
      border-radius: 0.4rem;
      box-sizing: border-box;
      color: var(--text, #18212a);
      font: inherit;
      font-size: 1rem;
      line-height: 1.5;
      padding: 0.65rem 0.85rem;
      outline: none;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
      width: 100%;
    }

    input::placeholder {
      color: var(--muted, #667684);
      opacity: 0.7;
    }

    input:focus-visible {
      border-color: var(--accent, #2a6f97);
      box-shadow: 0 0 0 2px var(--accent, #2a6f97);
    }

    input:disabled {
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
  .defineMethod("select", (element) => () => {
    element.$<HTMLInputElement>("input")?.select();
  })
  .defineRender((element) => {
    const {
      value,
      type,
      placeholder,
      label,
      name,
      disabled,
      readonly,
      required,
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
      ${label ? html`<label>${label}</label>` : ""}
      <div class="input-wrapper">
        <input
          .value=${value}
          type=${type}
          placeholder=${placeholder}
          name=${name}
          ?disabled=${disabled}
          ?readonly=${readonly}
          ?required=${required}
          @input=${onInput}
          @change=${onChange}
        />
      </div>
    `;
  })
  .create();
