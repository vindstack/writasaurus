<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
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
import { useSignalValue } from "../vue-signals.ts";
import controls from "./controls.module.css";
import styles from "./Topbar.module.css";
import DropdownMenu from "../DropdownMenu.vue";
import Divider from "../Divider.vue";
import SaveStatus from "../SaveStatus.vue";
import SegmentedControl from "../SegmentedControl.vue";
import Toolbar from "./Toolbar.vue";

defineProps<{ onNew: () => void; onOpen: () => void }>();

const themes = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "auto", label: "System" },
] as const;
const theme = ref<ThemePreference>("auto");
const titleInput = ref<HTMLInputElement | null>(null);
const filenameElement = ref<HTMLSpanElement | null>(null);
const manuscriptState = useSignalValue(manuscript);
const unsavedState = useSignalValue(hasUnsavedChanges);
const messageState = useSignalValue(saveMessage);
const desktopState = useSignalValue(isDesktop);
const menuState = useSignalValue(menuOpen);
const title = computed(() => String(manuscriptState.value.frontmatter.title ?? "Untitled Manuscript"));
const filename = computed(() => manuscriptState.value.filename);
const message = computed(() => messageState.value || (unsavedState.value ? "Unsaved changes" : "Saved"));

onMounted(() => {
  theme.value = getThemePreference();
  const sync = () => {
    if (titleInput.value) syncTruncationTooltip(titleInput.value);
    if (filenameElement.value) syncTruncationTooltip(filenameElement.value);
  };
  sync();
  addEventListener("resize", sync);
  onUnmounted(() => removeEventListener("resize", sync));
});

function changeTheme(next: string): void {
  const preference = next as ThemePreference;
  saveThemePreference(preference);
  applyThemePreference(preference);
  theme.value = preference;
}
</script>

<template>
  <header :class="styles.topbar">
    <div :class="styles.center">
      <input
        ref="titleInput"
        id="manuscript-title"
        :class="styles.title"
        :value="title"
        aria-label="Manuscript title"
        placeholder="Untitled Manuscript"
        @input="renameManuscript(($event.currentTarget as HTMLInputElement).value)"
        @blur="commitManuscriptTitle"
      />
      <span :class="styles.meta">
        <span id="filename" :class="styles.filename" ref="filenameElement">{{ filename }}</span>
        <span :class="styles.saveGroup">
          <SaveStatus
            id="save-status"
            :status="unsavedState ? 'unsaved' : 'saved'"
            :message="message"
          />
        </span>
      </span>
    </div>
    <div :class="styles.right">
      <Toolbar />
      <DropdownMenu
        id="app-menu"
        placement="bottom-end"
        :open="menuState"
        @open-change="menuOpen.value = $event"
      >
        <template #trigger>
          <button
            type="button"
            id="menu-toggle"
            :class="[controls.button, controls.small, styles.menuToggle]"
            aria-label="Menu"
            title="Menu (Ctrl+M)"
            aria-haspopup="true"
            :aria-expanded="menuState"
          >
            <span :class="styles.hamburger" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </button>
        </template>
        <nav :class="styles.menu" aria-label="Application menu">
          <button type="button" role="menuitem" :class="styles.item" @click="save()">
            <span>Save</span>
            <kbd :class="styles.kbd">Ctrl+S</kbd>
          </button>
          <button
            type="button"
            role="menuitem"
            :class="styles.item"
            id="menu-save-epub"
            @click="saveAsEpub()"
          >
            <span>Save As</span>
          </button>
          <Divider />
          <button
            type="button"
            role="menuitem"
            :class="styles.item"
            id="menu-new-manuscript"
            @click="onNew"
          >
            New Manuscript
          </button>
          <button
            type="button"
            role="menuitem"
            :class="styles.item"
            id="menu-open-manuscript"
            @click="onOpen"
          >
            Open Manuscript
          </button>
          <Divider />
          <a role="menuitem" href="/settings" :class="styles.item">Settings</a>
          <a role="menuitem" href="/about" :class="styles.item">About</a>
          <Divider />
          <div :class="[styles.item, styles.themeItem]" role="menuitem" data-keep-open>
            <SegmentedControl
              name="theme"
              :value="theme"
              :options="themes"
              @change="changeTheme"
            />
          </div>
          <template v-if="desktopState">
            <Divider />
            <button
              type="button"
              role="menuitem"
              :class="styles.item"
              id="menu-fullscreen"
              @click="toggleFullscreen()"
            >
              <span>Fullscreen</span>
              <kbd :class="styles.kbd">F11</kbd>
            </button>
            <button
              type="button"
              role="menuitem"
              :class="[styles.item, styles.quit]"
              id="menu-quit"
              @click="quit()"
            >
              Quit
            </button>
          </template>
        </nav>
      </DropdownMenu>
    </div>
  </header>
</template>
