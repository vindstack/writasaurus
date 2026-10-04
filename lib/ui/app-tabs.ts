import { html, webComponent } from "../../src/framework/web-components/index.ts";

export interface AppTabsElement extends HTMLElement {
  activeTab: string;
}

export const appTabs = webComponent("app-tabs")
  .defineObservedAttributes({
    activeTab: "",
  })
  .defineStyles(/* css */ `
    :host {
      display: flex;
      flex-direction: column;
      width: 100%;
      font-family: inherit;
      color: var(--text, #18212a);
    }

    .tab-list {
      display: flex;
      gap: 0.5rem;
      border-bottom: 2px solid var(--border, #d5e2ec);
      margin-bottom: 1rem;
      overflow-x: auto;
    }

    .tab-panels {
      display: block;
      width: 100%;
    }

    ::slotted([slot="tab"]) {
      appearance: none;
      background: none;
      border: none;
      border-bottom: 2px solid transparent;
      color: var(--muted, #5f758a);
      cursor: pointer;
      font-family: inherit;
      font-size: 0.95rem;
      font-weight: 500;
      margin-bottom: -2px;
      padding: 0.6rem 1rem;
      transition: color 0.15s ease, border-color 0.15s ease;
      white-space: nowrap;
    }

    ::slotted([slot="tab"]:hover) {
      color: var(--text, #18212a);
    }

    ::slotted([slot="tab"][aria-selected="true"]) {
      border-bottom-color: var(--accent, #2a6f97);
      color: var(--accent, #2a6f97);
      font-weight: 600;
    }

    ::slotted([slot="tab"]:focus-visible) {
      outline: 2px solid var(--accent, #2a6f97);
      outline-offset: -2px;
      border-radius: 4px 4px 0 0;
    }
  `)
  .defineProperty("activeTab", {
    get(this: HTMLElement) {
      return this.getAttribute("active-tab") || "";
    },
    set(this: HTMLElement, val: string) {
      this.setAttribute("active-tab", val);
    },
  })
  .defineMethod("selectTab", (element) => (tabId: string) => {
    element.setAttribute("active-tab", tabId);
    element.emit("tab-change", { tabId });

    // Update slotted tab buttons and panels
    const tabs = element.querySelectorAll<HTMLElement>('[slot="tab"]');
    const panels = element.querySelectorAll<HTMLElement>('[slot="panel"]');

    tabs.forEach((tab) => {
      const isSelected = tab.getAttribute("data-tab") === tabId;
      tab.setAttribute("aria-selected", String(isSelected));
      tab.setAttribute("tabindex", isSelected ? "0" : "-1");
    });

    panels.forEach((panel) => {
      const isMatch = panel.getAttribute("data-tab") === tabId;
      panel.hidden = !isMatch;
    });
  })
  .defineRender((element) => {
    const { activeTab: _activeTab } = element.observedAttribute;

    const onTabClick = (event: Event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('[slot="tab"]');
      if (target) {
        const tabId = target.getAttribute("data-tab");
        if (tabId) {
          element.selectTab(tabId);
        }
      }
    };

    const onSlotChange = () => {
      let currentActive = element.getAttribute("active-tab");
      const tabs = element.querySelectorAll<HTMLElement>('[slot="tab"]');
      if (!currentActive && tabs.length > 0) {
        currentActive = tabs[0].getAttribute("data-tab") || "";
        if (currentActive) {
          element.setAttribute("active-tab", currentActive);
        }
      }
      if (currentActive) {
        element.selectTab(currentActive);
      }
    };

    return html`
      <div class="tab-list" role="tablist" @click=${onTabClick}>
        <slot name="tab" @slotchange=${onSlotChange}></slot>
      </div>
      <div class="tab-panels">
        <slot name="panel" @slotchange=${onSlotChange}></slot>
      </div>
    `;
  })
  .create();
