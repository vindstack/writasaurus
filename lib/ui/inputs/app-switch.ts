import { html, webComponent } from "../../../src/framework/web-components/index.ts";

export interface AppSwitchElement extends HTMLElement {
  checked: boolean;
  value: string;
  focus(): void;
}

export const appSwitch = webComponent("app-switch")
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

    .switch-container {
      align-items: center;
      cursor: pointer;
      display: inline-flex;
      gap: 0.65rem;
      user-select: none;
    }

    .switch-container.disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }

    .switch-track {
      background: var(--surface-sunken, #e2edf5);
      border: 1px solid var(--border, #d5e2ec);
      border-radius: 1rem;
      box-sizing: border-box;
      display: inline-flex;
      align-items: center;
      height: 1.5rem;
      padding: 0.15rem;
      position: relative;
      transition: background 0.2s ease, border-color 0.2s ease;
      width: 2.75rem;
    }

    .switch-thumb {
      background: var(--surface, #f8fbfe);
      border-radius: 50%;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
      display: block;
      height: 1.15rem;
      transform: translateX(0);
      transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), background 0.2s ease;
      width: 1.15rem;
    }

    input[type="checkbox"] {
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

    input[type="checkbox"]:checked + .switch-track {
      background: var(--accent, #2a6f97);
      border-color: var(--accent, #2a6f97);
    }

    input[type="checkbox"]:checked + .switch-track .switch-thumb {
      background: var(--accent-text, #f8fbfe);
      transform: translateX(1.25rem);
    }

    input[type="checkbox"]:focus-visible + .switch-track {
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
      <label class=${`switch-container ${disabled ? "disabled" : ""}`}>
        <input
          type="checkbox"
          role="switch"
          .checked=${checked}
          .value=${value}
          name=${name}
          ?disabled=${disabled}
          ?required=${required}
          @change=${onChange}
        />
        <span class="switch-track" aria-hidden="true">
          <span class="switch-thumb"></span>
        </span>
        ${label ? html`<span class="label-text">${label}</span>` : html`<slot></slot>`}
      </label>
    `;
  })
  .create();
