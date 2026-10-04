import { html, webComponent } from "../../src/framework/web-components/index.ts";

export interface AppDropdownMenuElement extends HTMLElement {
  open: boolean;
  toggle(): void;
  close(): void;
}

export const appDropdownMenu = webComponent("app-dropdown-menu")
  .defineObservedAttributes({
    open: false,
    placement: "bottom-start" as "bottom-start" | "bottom-end",
  })
  .defineStyles(/* css */ `
    :host {
      display: inline-block;
      position: relative;
      font-family: inherit;
      color: var(--text, #18212a);
    }

    .menu-trigger {
      display: inline-flex;
      cursor: pointer;
    }

    .menu-popover {
      background: transparent;
      border: 0;
      border-radius: 0;
      box-shadow: none;
      box-sizing: border-box;
      display: none;
      position: absolute;
      top: 100%;
      margin-top: 4px;
      z-index: 1000;
    }

    .menu-popover.open {
      display: block;
      animation: menu-enter 0.15s ease-out;
    }

    @keyframes menu-enter {
      from {
        opacity: 0;
        transform: translateY(-4px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .menu-popover.bottom-start {
      left: 0;
    }

    .menu-popover.bottom-end {
      right: 0;
    }

    ::slotted([role^="menuitem"]) {
      box-sizing: border-box;
      width: 100%;
    }
  `)
  .defineProperty("open", {
    get(this: HTMLElement) {
      return this.getAttribute("open") === "true";
    },
    set(this: HTMLElement, val: boolean) {
      this.setAttribute("open", String(val));
    },
  })
  .defineMethod("toggle", (element) => () => {
    const isOpen = element.getAttribute("open") === "true";
    element.setAttribute("open", String(!isOpen));
    element.emit("toggle", { open: !isOpen });
  })
  .defineMethod("close", (element) => () => {
    element.setAttribute("open", "false");
    element.emit("close", {});
  })
  .defineRender((element) => {
    const { open, placement } = element.observedAttribute;

    const onTriggerClick = (event: Event) => {
      event.stopPropagation();
      element.toggle();
    };

    const onMenuClick = (event: Event) => {
      const target = (event.target as HTMLElement).closest('[role^="menuitem"]');
      if (
        target && !target.hasAttribute("data-keep-open") &&
        target.getAttribute("aria-haspopup") !== "true"
      ) {
        element.close();
      }
    };

    return html`
      <div class="menu-trigger" @click=${onTriggerClick}>
        <slot name="trigger"></slot>
      </div>
      <div
        class=${`menu-popover ${placement} ${open ? "open" : ""}`}
        role="menu"
        @click=${onMenuClick}
      >
        <slot></slot>
      </div>
    `;
  })
  .create();
