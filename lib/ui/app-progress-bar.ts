import { html, webComponent } from "../../src/framework/web-components/index.ts";

export const appProgressBar = webComponent("app-progress-bar")
  .defineObservedAttributes({
    value: 0,
    max: 100,
    label: "",
    showPercentage: false,
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
      justify-content: space-between;
      align-items: center;
      font-size: 0.85rem;
      font-weight: 500;
    }

    .percentage-text {
      color: var(--muted, #5f758a);
      font-variant-numeric: tabular-nums;
    }

    .progress-track {
      background: var(--surface-sunken, #e2edf5);
      border: 1px solid var(--border, #d5e2ec);
      border-radius: 9999px;
      height: 0.65rem;
      overflow: hidden;
      position: relative;
      width: 100%;
    }

    .progress-fill {
      background: var(--accent, #2a6f97);
      border-radius: 9999px;
      height: 100%;
      transition: width 0.3s ease;
    }
  `)
  .defineRender((element) => {
    const { value, max, label, showPercentage } = element.observedAttribute;
    const safeMax = Math.max(1, Number(max) || 100);
    const safeValue = Math.min(safeMax, Math.max(0, Number(value) || 0));
    const percentage = Math.round((safeValue / safeMax) * 100);

    return html`
      ${label || showPercentage
        ? html`
          <div class="label-row">
            ${label ? html`<span>${label}</span>` : null}
            ${showPercentage ? html`<span class="percentage-text">${percentage}%</span>` : null}
          </div>
        `
        : null}
      <div
        class="progress-track"
        role="progressbar"
        aria-valuenow=${safeValue}
        aria-valuemin="0"
        aria-valuemax=${safeMax}
      >
        <div class="progress-fill" style=${`width: ${percentage}%;`}></div>
      </div>
    `;
  })
  .create();
