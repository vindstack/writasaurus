import { html, webComponent } from "../../src/framework/web-components/index.ts";

export const appSpinner = webComponent("app-spinner")
  .defineObservedAttributes({
    size: "medium" as "small" | "medium" | "large",
  })
  .defineStyles(/* css */ `
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .spinner {
      animation: spin 0.8s linear infinite;
      border: 2px solid var(--border, #d5e2ec);
      border-radius: 50%;
      border-top-color: var(--accent, #2a6f97);
      box-sizing: border-box;
      display: inline-block;
    }

    .spinner.size-small {
      height: 1rem;
      width: 1rem;
      border-width: 2px;
    }

    .spinner.size-medium {
      height: 1.5rem;
      width: 1.5rem;
      border-width: 2.5px;
    }

    .spinner.size-large {
      height: 2.5rem;
      width: 2.5rem;
      border-width: 3px;
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
  `)
  .defineRender((element) => {
    const { size } = element.observedAttribute;

    return html`
      <div class=${`spinner size-${size}`} role="status" aria-label="Loading"></div>
    `;
  })
  .create();
