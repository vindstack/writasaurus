import { html, webComponent } from "../../../framework/web-components/index.ts";
import { syncTruncationTooltip } from "../../../../lib/text/text.ts";
import { commitManuscriptTitle, renameManuscript } from "./actions.ts";
import { editorStore, state } from "./state.ts";
import type { Unsubscribe } from "../../../framework/web-components/index.ts";
import "../../../shared/components/save-status.ts";
import "../../../../lib/ui/app-divider.ts";
import "../../../../lib/ui/app-dropdown-menu.ts";
import "../../../../lib/ui/inputs/app-segmented-control.ts";
import {
  applyThemePreference,
  getThemePreference,
  saveThemePreference,
} from "../../../../lib/settings.ts";

export type EditorTopbar = HTMLElement & {
  closeMenu(): void;
  focusFirstMenuItem(): void;
  toggleMenu(focusFirst?: boolean): boolean;
};

const tooltipSubscriptions = new WeakMap<HTMLElement, Unsubscribe>();

function syncTooltips(element: HTMLElement): void {
  const title = element.querySelector<HTMLInputElement>("#manuscript-title");
  const filename = element.querySelector<HTMLElement>("#filename");
  if (title) syncTruncationTooltip(title);
  if (filename) syncTruncationTooltip(filename);
}

export const editorTopbar = webComponent("editor-topbar")
  .defineShadow(false)
  .subscribe(editorStore)
  .defineMethod("focusFirstMenuItem", (element) => () => {
    element.$<HTMLElement>('[role="menuitem"]')?.focus();
  })
  .defineMethod("toggleMenu", (element) => (focusFirst = false): boolean => {
    const menu = element.$<HTMLElement>("app-dropdown-menu");
    if (!menu) return false;
    menu.toggle();
    if (menu.getAttribute("open") === "true" && focusFirst) element.focusFirstMenuItem();
    return menu.getAttribute("open") === "true";
  })
  .defineMethod("closeMenu", (element) => () => {
    element.$<HTMLElement>("app-dropdown-menu")?.setAttribute("open", "false");
  })
  .defineRender((element) => {
    const { filename } = state.manuscript;
    const title = String(state.manuscript.frontmatter.title ?? "Untitled Manuscript");
    const saveStatus = state.hasUnsavedChanges ? "unsaved" : "saved";
    const saveMessage = state.saveMessage ||
      (state.hasUnsavedChanges ? "Unsaved changes" : `Saved`);
    const emitAction = (
      action: "new" | "open" | "save" | "saveAsEpub" | "fullscreen" | "quit",
    ) =>
    () => element.emit("editoraction", { action });
    const updateTitle = (event: Event) => {
      renameManuscript((event.currentTarget as HTMLInputElement).value);
    };
    const commitTitle = () => commitManuscriptTitle();
    const setTheme = (theme: "light" | "dark" | "auto") => {
      saveThemePreference(theme);
      applyThemePreference(theme);
      const control = element.querySelector<HTMLElement>("app-segmented-control");
      if (control) control.setAttribute("value", theme);
    };
    const theme = getThemePreference();

    return html`
      <header class="editor-topbar">
        <div class="topbar-center">
          <input id="manuscript-title" .value=${title} @input=${updateTitle} @blur=${commitTitle}
            aria-label="Manuscript title" placeholder="Untitled Manuscript">
          <span class="topbar-meta">
            <span id="filename">${filename}</span>
            <span class="save-status-group">
              <save-status id="save-status" status=${saveStatus} message=${saveMessage} role="status"
                aria-live="polite"></save-status>
            </span>
          </span>
        </div>
        <div class="topbar-right">
          <editor-toolbar aria-label="Formatting toolbar" for="#editor"></editor-toolbar>
          <app-dropdown-menu id="app-menu" placement="bottom-end">
            <button slot="trigger" type="button" id="menu-toggle" class="menu-toggle small"
              aria-label="Menu" title="Menu (Ctrl+M)" aria-haspopup="true">
              <span class="hamburger-icon"
                aria-hidden="true"><span></span><span></span><span></span></span>
            </button>
            <nav class="app-menu" aria-label="Application menu">
              <button type="button" role="menuitem" class="menu-item" @click=${emitAction("save")}>
                <span>Save</span><kbd>Ctrl+S</kbd>
              </button>
              <button type="button" role="menuitem" class="menu-item" id="menu-save-epub" @click=${emitAction(
                "saveAsEpub",
              )}>
                <span>Save As</span>
              </button>
              <app-divider></app-divider>
              <button type="button" role="menuitem" class="menu-item" id="menu-new-manuscript" @click=${emitAction(
                "new",
              )}>
                New Manuscript
              </button>
              <button type="button" role="menuitem" class="menu-item" id="menu-open-manuscript" @click=${emitAction(
                "open",
              )}>
                Open Manuscript
              </button>
              <app-divider></app-divider>
              <a role="menuitem" href="/settings" class="menu-item">Settings</a>
              <a role="menuitem" href="/about" class="menu-item">About</a>
              <app-divider></app-divider>
              <div class="menu-item theme-item" role="menuitem" data-keep-open>
                <app-segmented-control
                  name="theme"
                  .value=${theme}
                  @change=${(event: CustomEvent<{ value: string }>) =>
                    setTheme(event.detail.value as "light" | "dark" | "auto")}
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="auto">System</option>
                </app-segmented-control>
              </div>
              ${state.isDesktop
                ? html`
                  <app-divider></app-divider>
                  <button type="button" role="menuitem" class="menu-item" id="menu-fullscreen"
                    @click=${emitAction("fullscreen")}>
                    <span>Fullscreen</span><kbd>F11</kbd>
                  </button>
                  <button type="button" role="menuitem" class="menu-item quit" @click=${emitAction(
                    "quit",
                  )}>
                    Quit
                  </button>
                `
                : ""}
            </nav>
          </app-dropdown-menu>
        </div>
      </header>
    `;
  })
  .connectedCallback((element) => {
    syncTooltips(element);
    // Runs after the store-driven re-render, so tooltips match the latest DOM.
    tooltipSubscriptions.set(element, editorStore.subscribe(() => syncTooltips(element)));
  })
  .disconnectedCallback((element) => {
    tooltipSubscriptions.get(element)?.();
    tooltipSubscriptions.delete(element);
  })
  .create();
