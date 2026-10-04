import { html, webComponent } from "../../../src/framework/web-components/index.ts";

export interface AppRadioElement extends HTMLElement {
  checked: boolean;
  value: string;
  focus(): void;
}

export const appRadio = webComponent("app-radio")
  .defineObservedAttributes({
    checked: false,
    value: "",
    name: "",
    label: "",
    disabled: false,
    required: false,
  })
  .defineStyles(/* css */ `
    :host {
      display: inline-flex;
      font-family: inherit;
      color: var(--text, #18212a);
    }

    .radio-container {
      align-items: center;
      cursor: pointer;
      display: inline-flex;
      gap: 0.5rem;
      position: relative;
      user-select: none;
    }

    .radio-container.disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }

    input[type="radio"] {
      border: 0;
      clip: rect(0 0 0 0);
      clip-path: inset(50%);
      height: 1px;
      margin: -1px;
      overflow: hidden;
      padding: 0;
      position: absolute;
      white-space: nowrap;
      width: 1px;
    }

    .radio-circle {
      align-items: center;
      background: var(--surface, #f8fbfe);
      border: 1px solid var(--border, #d5e2ec);
      border-radius: 50%;
      box-sizing: border-box;
      display: inline-flex;
      height: 1.15rem;
      justify-content: center;
      transition: border-color 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease;
      width: 1.15rem;
    }

    .radio-dot {
      background: var(--accent, #2a6f97);
      border-radius: 50%;
      display: block;
      height: 0.55rem;
      opacity: 0;
      transform: scale(0);
      transition: opacity 0.15s ease, transform 0.15s cubic-bezier(0.4, 0, 0.2, 1);
      width: 0.55rem;
    }

    input[type="radio"]:checked + .radio-circle {
      border-color: var(--accent, #2a6f97);
    }

    input[type="radio"]:checked + .radio-circle .radio-dot {
      opacity: 1;
      transform: scale(1);
    }

    input[type="radio"]:focus-visible + .radio-circle {
      border-color: var(--accent, #2a6f97);
      box-shadow: 0 0 0 2px var(--accent, #2a6f97);
    }

    .label-text {
      color: var(--text, #18212a);
      font-size: 0.95rem;
      line-height: 1.4;
    }
  `)
  .defineProperty("checked", {
    get(this: HTMLElement) {
      const input = this.shadowRoot?.querySelector<HTMLInputElement>("input");
      return input ? input.checked : this.getAttribute("checked") === "true";
    },
    set(this: HTMLElement, val: boolean) {
      this.setAttribute("checked", String(val));
      const input = this.shadowRoot?.querySelector<HTMLInputElement>("input");
      if (input) input.checked = val;
    },
  })
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
  .defineRender((element) => {
    const {
      checked,
      value,
      name,
      label,
      disabled,
      required,
    } = element.observedAttribute;

    const onChange = (event: Event) => {
      const target = event.currentTarget as HTMLInputElement;
      element.setAttribute("checked", String(target.checked));
      element.emit("change", { checked: target.checked, value: target.value });
    };

    return html`
      <label class=${`radio-container ${disabled ? "disabled" : ""}`}>
        <input
          type="radio"
          .checked=${checked}
          .value=${value}
          name=${name}
          ?disabled=${disabled}
          ?required=${required}
          @change=${onChange}
        />
        <span class="radio-circle" aria-hidden="true">
          <span class="radio-dot"></span>
        </span>
        ${label ? html`<span class="label-text">${label}</span>` : html`<slot></slot>`}
      </label>
    `;
  })
  .create();
