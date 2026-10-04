import { html, webComponent } from "../../src/framework/web-components/index.ts";
import "./app-card.ts";

export const appStatCard = webComponent("app-stat-card")
  .defineObservedAttributes({
    title: "",
    value: "",
    description: "",
    trend: "",
    trendDirection: "neutral" as "up" | "down" | "neutral",
  })
  .defineStyles(/* css */ `
    :host {
      display: block;
      font-family: inherit;
    }

    app-card {
      width: 100%;
    }

    .stat-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
    }

    .title {
      color: var(--muted, #5f758a);
      font-size: 0.85rem;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .value-row {
      display: flex;
      align-items: baseline;
      gap: 0.5rem;
      margin-bottom: 0.35rem;
    }

    .value {
      color: var(--text, #18212a);
      font-size: 1.75rem;
      font-weight: 700;
      line-height: 1.1;
    }

    .trend {
      font-size: 0.85rem;
      font-weight: 600;
    }

    .trend.up {
      color: #2b9348;
    }

    .trend.down {
      color: #d90429;
    }

    .trend.neutral {
      color: var(--muted, #5f758a);
    }

    .description {
      color: var(--muted, #5f758a);
      font-size: 0.8rem;
    }
  `)
  .defineRender((element) => {
    const { title, value, description, trend, trendDirection } = element.observedAttribute;

    return html`
      <app-card padding="medium">
        <div class="stat-header">
          <span class="title">${title}</span>
          <slot name="icon"></slot>
        </div>
        <div class="value-row">
          <span class="value">${value}</span>
          ${trend ? html`<span class=${`trend ${trendDirection}`}>${trend}</span>` : null}
        </div>
        ${description ? html`<div class="description">${description}</div>` : null}
        <slot></slot>
      </app-card>
    `;
  })
  .create();
