import { html, webComponent } from "../../../src/framework/web-components/index.ts";

export interface AppTextareaElement extends HTMLElement {
  value: string;
  focus(): void;
}

export const appTextarea = webComponent("app-textarea")
  .defineObservedAttributes({
    value: "",
    name: "",
    placeholder: "",
    rows: 3,
    disabled: false,
    required: false,
    readonly: false,
    label: "",
    helperText: "",
    errorText: "",
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
      font-weight: 500;
      color: var(--text, #18212a);
    }

    .textarea-wrapper {
      position: relative;
      width: 100%;
    }

    textarea {
      box-sizing: border-box;
      width: 100%;
      background: var(--surface, #f8fbfe);
      border: 1px solid var(--border, #d5e2ec);
      border-radius: 0.5rem;
      color: var(--text, #18212a);
      font-family: inherit;
      font-size: 0.95rem;
      line-height: 1.5;
      padding: 0.5rem 0.75rem;
      outline: none;
      resize: vertical;
      transition: border-color 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease;
    }

    textarea::placeholder {
      color: var(--muted, #5f758a);
      opacity: 0.7;
    }

    textarea:hover:not(:disabled) {
      border-color: var(--accent, #2a6f97);
    }

    textarea:focus {
      border-color: var(--accent, #2a6f97);
      box-shadow: 0 0 0 2px var(--accent, #2a6f97);
    }

    textarea:disabled {
      background: var(--surface-sunken, #e2edf5);
      border-color: var(--border, #d5e2ec);
      color: var(--muted, #5f758a);
      cursor: not-allowed;
      opacity: 0.7;
    }

    .has-error textarea {
      border-color: #d90429;
    }

    .has-error textarea:focus {
      box-shadow: 0 0 0 2px #d90429;
    }

    .helper-text {
      font-size: 0.78rem;
      color: var(--muted, #5f758a);
    }

    .error-text {
      font-size: 0.78rem;
      color: #d90429;
    }
  `)
  .defineProperty("value", {
    get(this: HTMLElement) {
      const textarea = this.shadowRoot?.querySelector<HTMLTextAreaElement>("textarea");
      return textarea ? textarea.value : this.getAttribute("value") ?? "";
    },
    set(this: HTMLElement, val: string) {
      this.setAttribute("value", val);
      const textarea = this.shadowRoot?.querySelector<HTMLTextAreaElement>("textarea");
      if (textarea) textarea.value = val;
    },
  })
  .defineMethod("focus", (element) => () => {
    element.$<HTMLTextAreaElement>("textarea")?.focus();
  })
  .defineRender((element) => {
    const {
      value,
      name,
      placeholder,
      rows,
      disabled,
      required,
      readonly,
      label,
      helperText,
      errorText,
    } = element.observedAttribute;

    const onInput = (event: Event) => {
      const target = event.currentTarget as HTMLTextAreaElement;
      element.setAttribute("value", target.value);
      element.emit("input", { value: target.value });
    };

    const onChange = (event: Event) => {
      const target = event.currentTarget as HTMLTextAreaElement;
      element.setAttribute("value", target.value);
      element.emit("change", { value: target.value });
    };

    return html`
      ${label ? html`<label for="inner-textarea">${label}</label>` : null}
      <div class=${`textarea-wrapper ${errorText ? "has-error" : ""}`}>
        <textarea
          id="inner-textarea"
          .value=${value}
          name=${name}
          placeholder=${placeholder}
          rows=${rows}
          ?disabled=${disabled}
          ?required=${required}
          ?readonly=${readonly}
          @input=${onInput}
          @change=${onChange}
        ></textarea>
      </div>
      ${errorText ? html`<span class="error-text">${errorText}</span>` : null}
      ${!errorText && helperText ? html`<span class="helper-text">${helperText}</span>` : null}
    `;
  })
  .create();
