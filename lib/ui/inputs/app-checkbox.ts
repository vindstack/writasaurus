import { html, webComponent } from "../../../src/framework/web-components/index.ts";

export interface AppCheckboxElement extends HTMLElement {
  checked: boolean;
  value: string;
  focus(): void;
}

export const appCheckbox = webComponent("app-checkbox")
  .defineObservedAttributes({
    checked: false,
    value: "on",
    label: "",
    name: "",
    disabled: false,
    required: false,
  })
  .defineStyles(/* css */ `
    :host {
      display: inline-flex;
      font-family: inherit;
      color: var(--text, #18212a);
    }

    .checkbox-container {
      align-items: center;
      cursor: pointer;
      display: inline-flex;
      gap: 0.5rem;
      user-select: none;
    }

    .checkbox-container.disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }

    input[type="checkbox"] {
      appearance: none;
      -webkit-appearance: none;
      background: var(--surface-sunken, #e2edf5);
      border: 1px solid var(--border, #d5e2ec);
      border-radius: 0.25rem;
      box-sizing: border-box;
      cursor: pointer;
      display: grid;
      height: 1.15rem;
      margin: 0;
      outline: none;
      place-content: center;
      transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
      width: 1.15rem;
    }

    input[type="checkbox"]::before {
      box-shadow: inset 1em 1em var(--accent-text, #f8fbfe);
      clip-path: polygon(14% 44%, 0 65%, 50% 100%, 100% 16%, 80% 0%, 43% 62%);
      content: "";
      height: 0.65rem;
      transform: scale(0);
      transition: transform 0.12s ease-in-out;
      width: 0.65rem;
    }

    input[type="checkbox"]:checked {
      background: var(--accent, #2a6f97);
      border-color: var(--accent, #2a6f97);
    }

    input[type="checkbox"]:checked::before {
      transform: scale(1);
    }

    input[type="checkbox"]:focus-visible {
      border-color: var(--accent, #2a6f97);
      box-shadow: 0 0 0 2px var(--accent, #2a6f97);
    }

    input[type="checkbox"]:disabled {
      cursor: not-allowed;
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
      return input ? input.value : this.getAttribute("value") ?? "on";
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
      label,
      name,
      disabled,
      required,
    } = element.observedAttribute;

    const onChange = (event: Event) => {
      const target = event.currentTarget as HTMLInputElement;
      element.setAttribute("checked", String(target.checked));
      element.emit("change", { checked: target.checked, value: target.value });
    };

    return html`
      <label class=${`checkbox-container ${disabled ? "disabled" : ""}`}>
        <input
          type="checkbox"
          .checked=${checked}
          .value=${value}
          name=${name}
          ?disabled=${disabled}
          ?required=${required}
          @change=${onChange}
        />
        ${label ? html`<span class="label-text">${label}</span>` : html`<slot></slot>`}
      </label>
    `;
  })
  .create();
