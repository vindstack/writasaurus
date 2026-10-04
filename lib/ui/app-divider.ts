import { html, webComponent } from "../../src/framework/web-components/index.ts";

export const appDivider = webComponent("app-divider")
  .defineObservedAttributes({
    orientation: "horizontal" as "horizontal" | "vertical",
    label: "",
  })
  .defineStyles(/* css */ `
    :host {
      display: flex;
      font-family: inherit;
      color: var(--muted, #5f758a);
    }

    :host([orientation="horizontal"]), :host(:not([orientation])) {
      align-items: center;
      width: 100%;
      margin: 1rem 0;
    }

    :host([orientation="vertical"]) {
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      height: 100%;
      min-height: 1.5rem;
      margin: 0 0.75rem;
    }

    .divider-line {
      background-color: var(--border, #d5e2ec);
      flex-grow: 1;
    }

    :host([orientation="horizontal"]) .divider-line, :host(:not([orientation])) .divider-line {
      height: 1px;
    }

    :host([orientation="vertical"]) .divider-line {
      width: 1px;
    }

    .divider-label {
      font-size: 0.8rem;
      font-weight: 500;
      padding: 0 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      white-space: nowrap;
    }
  `)
  .defineRender((element) => {
    const { orientation, label } = element.observedAttribute;

    if (orientation === "vertical") {
      return html`
        <div class="divider-line" role="separator" aria-orientation="vertical"></div>
      `;
    }

    return html`
      <div class="divider-line" role="separator" aria-orientation="horizontal"></div>
      ${label ? html`<span class="divider-label">${label}</span>` : html`<slot></slot>`}
      ${label ? html`<div class="divider-line" role="separator"></div>` : null}
    `;
  })
  .create();
