import { html, webComponent } from "../../../src/framework/web-components/index.ts";

export interface AppSliderElement extends HTMLElement {
  value: number;
  focus(): void;
}

export const appSlider = webComponent("app-slider")
  .defineObservedAttributes({
    value: 50,
    min: 0,
    max: 100,
    step: 1,
    name: "",
    disabled: false,
    label: "",
    showValue: false,
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

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.85rem;
      font-weight: 500;
    }

    .value-display {
      color: var(--muted, #5f758a);
      font-variant-numeric: tabular-nums;
    }

    .slider-wrapper {
      display: flex;
      align-items: center;
      width: 100%;
    }

    input[type="range"] {
      -webkit-appearance: none;
      appearance: none;
      background: transparent;
      cursor: pointer;
      margin: 0;
      width: 100%;
    }

    input[type="range"]:focus {
      outline: none;
    }

    /* Track styles */
    input[type="range"]::-webkit-slider-runnable-track {
      background: var(--surface-sunken, #e2edf5);
      border: 1px solid var(--border, #d5e2ec);
      border-radius: 9999px;
      height: 0.5rem;
    }

    input[type="range"]::-moz-range-track {
      background: var(--surface-sunken, #e2edf5);
      border: 1px solid var(--border, #d5e2ec);
      border-radius: 9999px;
      height: 0.5rem;
    }

    /* Thumb styles */
    input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      background: var(--accent, #2a6f97);
      border: 2px solid var(--surface, #f8fbfe);
      border-radius: 50%;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
      height: 1.15rem;
      margin-top: -0.375rem;
      transition: transform 0.1s ease, background-color 0.15s ease;
      width: 1.15rem;
    }

    input[type="range"]::-moz-range-thumb {
      background: var(--accent, #2a6f97);
      border: 2px solid var(--surface, #f8fbfe);
      border-radius: 50%;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
      height: 1.15rem;
      transition: transform 0.1s ease, background-color 0.15s ease;
      width: 1.15rem;
    }

    input[type="range"]:hover:not(:disabled)::-webkit-slider-thumb {
      transform: scale(1.1);
    }

    input[type="range"]:focus-visible::-webkit-slider-thumb {
      box-shadow: 0 0 0 2px var(--surface, #f8fbfe), 0 0 0 4px var(--accent, #2a6f97);
    }

    input[type="range"]:disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }
  `)
  .defineProperty("value", {
    get(this: HTMLElement) {
      const input = this.shadowRoot?.querySelector<HTMLInputElement>("input");
      return input ? Number(input.value) : Number(this.getAttribute("value") ?? 0);
    },
    set(this: HTMLElement, val: number) {
      this.setAttribute("value", String(val));
      const input = this.shadowRoot?.querySelector<HTMLInputElement>("input");
      if (input) input.value = String(val);
    },
  })
  .defineMethod("focus", (element) => () => {
    element.$<HTMLInputElement>("input")?.focus();
  })
  .defineRender((element) => {
    const {
      value,
      min,
      max,
      step,
      name,
      disabled,
      label,
      showValue,
    } = element.observedAttribute;

    const onInput = (event: Event) => {
      const target = event.currentTarget as HTMLInputElement;
      element.setAttribute("value", target.value);
      element.emit("input", { value: Number(target.value) });
    };

    const onChange = (event: Event) => {
      const target = event.currentTarget as HTMLInputElement;
      element.setAttribute("value", target.value);
      element.emit("change", { value: Number(target.value) });
    };

    return html`
      ${label || showValue
        ? html`
          <div class="header">
            ${label ? html`<label for="range-input">${label}</label>` : null}
            ${showValue ? html`<span class="value-display">${value}</span>` : null}
          </div>
        `
        : null}
      <div class="slider-wrapper">
        <input
          id="range-input"
          type="range"
          .value=${String(value)}
          min=${min}
          max=${max}
          step=${step}
          name=${name}
          ?disabled=${disabled}
          @input=${onInput}
          @change=${onChange}
        />
      </div>
    `;
  })
  .create();
