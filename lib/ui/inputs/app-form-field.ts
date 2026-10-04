import { html, webComponent } from "../../../src/framework/web-components/index.ts";

export const appFormField = webComponent("app-form-field")
  .defineObservedAttributes({
    label: "",
    required: false,
    helperText: "",
    errorText: "",
  })
  .defineStyles(/* css */ `
    :host {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      font-family: inherit;
      color: var(--text, #18212a);
      width: 100%;
    }

    .label-row {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      font-size: 0.85rem;
      font-weight: 500;
      color: var(--text, #18212a);
    }

    .required-marker {
      color: #d90429;
      font-weight: bold;
    }

    .control-container {
      display: block;
      width: 100%;
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
  .defineRender((element) => {
    const { label, required, helperText, errorText } = element.observedAttribute;

    return html`
      ${label
        ? html`
          <div class="label-row">
            <span>${label}</span>
            ${required ? html`<span class="required-marker" aria-hidden="true">*</span>` : null}
          </div>
        `
        : null}
      <div class="control-container">
        <slot></slot>
      </div>
      ${errorText ? html`<span class="error-text">${errorText}</span>` : null}
      ${!errorText && helperText ? html`<span class="helper-text">${helperText}</span>` : null}
    `;
  })
  .create();
