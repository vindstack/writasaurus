import { useEffect, useRef, useState } from "preact/hooks";
import { DropdownMenu } from "../DropdownMenu.tsx";
import { Divider } from "../Divider.tsx";
import { SaveStatus } from "../SaveStatus.tsx";
import { SegmentedControl } from "../SegmentedControl.tsx";
import { syncTruncationTooltip } from "../../lib/text/text.ts";
import {
  applyThemePreference,
  getThemePreference,
  saveThemePreference,
  type ThemePreference,
} from "../../lib/settings.ts";
import { quit, save, saveAsEpub, toggleFullscreen } from "../../lib/editor/commands.ts";
import {
  commitManuscriptTitle,
  hasUnsavedChanges,
  isDesktop,
  manuscript,
  menuOpen,
  renameManuscript,
  saveMessage,
} from "../../lib/editor/state.ts";
import { Toolbar } from "./Toolbar.tsx";
// @ts-types="../../vite-env.d.ts"
import controls from "./controls.module.css";
// @ts-types="../../vite-env.d.ts"
import styles from "./Topbar.module.css";

const THEMES = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "auto", label: "System" },
] as const;

interface TopbarProps {
  onNew: () => void;
  onOpen: () => void;
}

export function Topbar({ onNew, onOpen }: TopbarProps) {
  const [theme, setTheme] = useState<ThemePreference>("auto");
  const titleInput = useRef<HTMLInputElement>(null);
  const filename = useRef<HTMLSpanElement>(null);

  useEffect(() => setTheme(getThemePreference()), []);

  const { filename: name, frontmatter } = manuscript.value;
  const title = String(frontmatter.title ?? "Untitled Manuscript");
  const unsaved = hasUnsavedChanges.value;
  const message = saveMessage.value || (unsaved ? "Unsaved changes" : "Saved");

  useEffect(() => {
    const sync = () => {
      if (titleInput.current) syncTruncationTooltip(titleInput.current);
      if (filename.current) syncTruncationTooltip(filename.current);
    };
    sync();
    addEventListener("resize", sync);
    return () => removeEventListener("resize", sync);
  }, [title, name]);

  function changeTheme(next: ThemePreference): void {
    saveThemePreference(next);
    applyThemePreference(next);
    setTheme(next);
  }

  const open = menuOpen.value;

  return (
    <header class={styles.topbar}>
      <div class={styles.center}>
        <input
          ref={titleInput}
          id="manuscript-title"
          class={styles.title}
          value={title}
          aria-label="Manuscript title"
          placeholder="Untitled Manuscript"
          onInput={(event) => renameManuscript(event.currentTarget.value)}
          onBlur={commitManuscriptTitle}
        />
        <span class={styles.meta}>
          <span id="filename" class={styles.filename} ref={filename}>{name}</span>
          <span class={styles.saveGroup}>
            <SaveStatus
              id="save-status"
              status={unsaved ? "unsaved" : "saved"}
              message={message}
            />
          </span>
        </span>
      </div>
      <div class={styles.right}>
        <Toolbar />
        <DropdownMenu
          id="app-menu"
          placement="bottom-end"
          open={open}
          onOpenChange={(next) => menuOpen.value = next}
          trigger={
            <button
              type="button"
              id="menu-toggle"
              class={`${controls.button} ${controls.small} ${styles.menuToggle}`}
              aria-label="Menu"
              title="Menu (Ctrl+M)"
              aria-haspopup="true"
              aria-expanded={open}
            >
              <span class={styles.hamburger} aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </button>
          }
        >
          <nav class={styles.menu} aria-label="Application menu">
            <button type="button" role="menuitem" class={styles.item} onClick={() => void save()}>
              <span>Save</span>
              <kbd class={styles.kbd}>Ctrl+S</kbd>
            </button>
            <button
              type="button"
              role="menuitem"
              class={styles.item}
              id="menu-save-epub"
              onClick={() => void saveAsEpub()}
            >
              <span>Save As</span>
            </button>
            <Divider />
            <button
              type="button"
              role="menuitem"
              class={styles.item}
              id="menu-new-manuscript"
              onClick={onNew}
            >
              New Manuscript
            </button>
            <button
              type="button"
              role="menuitem"
              class={styles.item}
              id="menu-open-manuscript"
              onClick={onOpen}
            >
              Open Manuscript
            </button>
            <Divider />
            <a role="menuitem" href="/settings" class={styles.item}>Settings</a>
            <a role="menuitem" href="/about" class={styles.item}>About</a>
            <Divider />
            <div class={`${styles.item} ${styles.themeItem}`} role="menuitem" data-keep-open>
              <SegmentedControl
                name="theme"
                value={theme}
                options={THEMES}
                onChange={changeTheme}
              />
            </div>
            {isDesktop.value && (
              <>
                <Divider />
                <button
                  type="button"
                  role="menuitem"
                  class={styles.item}
                  id="menu-fullscreen"
                  onClick={() => void toggleFullscreen()}
                >
                  <span>Fullscreen</span>
                  <kbd class={styles.kbd}>F11</kbd>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  class={`${styles.item} ${styles.quit}`}
                  id="menu-quit"
                  onClick={() => void quit()}
                >
                  Quit
                </button>
              </>
            )}
          </nav>
        </DropdownMenu>
      </div>
    </header>
  );
}
