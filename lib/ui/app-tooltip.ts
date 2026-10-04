import { html, webComponent } from "../../src/framework/web-components/index.ts";

export const appTooltip = webComponent("app-tooltip")
  .defineObservedAttributes({
    content: "",
    position: "top" as "top" | "bottom" | "left" | "right",
  })
  .defineStyles(/* css */ `
    :host {
      display: inline-flex;
      position: relative;
    }

    .tooltip-bubble {
      background: var(--text, #18212a);
      border-radius: 0.35rem;
      box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
      color: var(--surface, #f8fbfe);
      font-size: 0.78rem;
      font-weight: 500;
      line-height: 1.3;
      max-width: 220px;
      opacity: 0;
      padding: 0.35rem 0.6rem;
      pointer-events: none;
      position: absolute;
      transition: opacity 0.15s ease, transform 0.15s ease;
      white-space: nowrap;
      z-index: 1000;
    }

    :host(:hover) .tooltip-bubble,
    :host(:focus-within) .tooltip-bubble {
      opacity: 1;
    }

    /* Positions */
    .tooltip-bubble.top {
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%) translateY(-4px);
      margin-bottom: 6px;
    }

    :host(:hover) .tooltip-bubble.top,
    :host(:focus-within) .tooltip-bubble.top {
      transform: translateX(-50%) translateY(0);
    }

    .tooltip-bubble.bottom {
      top: 100%;
      left: 50%;
      transform: translateX(-50%) translateY(4px);
      margin-top: 6px;
    }

    :host(:hover) .tooltip-bubble.bottom,
    :host(:focus-within) .tooltip-bubble.bottom {
      transform: translateX(-50%) translateY(0);
    }

    .tooltip-bubble.left {
      right: 100%;
      top: 50%;
      transform: translateY(-50%) translateX(-4px);
      margin-right: 6px;
    }

    :host(:hover) .tooltip-bubble.left,
    :host(:focus-within) .tooltip-bubble.left {
      transform: translateY(-50%) translateX(0);
    }

    .tooltip-bubble.right {
      left: 100%;
      top: 50%;
      transform: translateY(-50%) translateX(4px);
      margin-left: 6px;
    }

    :host(:hover) .tooltip-bubble.right,
    :host(:focus-within) .tooltip-bubble.right {
      transform: translateY(-50%) translateX(0);
    }
  `)
  .defineRender((element) => {
    const { content, position } = element.observedAttribute;

    return html`
      <slot></slot>
      <div class=${`tooltip-bubble ${position}`} role="tooltip" aria-hidden="true">
        ${content ? content : html`<slot name="content"></slot>`}
      </div>
    `;
  })
  .create();
