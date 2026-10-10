<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { syncTruncationTooltip } from "../../lib/text/text.ts";
import {
    applyThemePreference,
    getThemePreference,
    saveThemePreference,
    type ThemePreference,
} from "../../../../../packages/shared/settings.ts";
import {
    quit,
    save,
    saveAsEpub,
    toggleFullscreen,
} from "../../lib/editor/commands.ts";
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
import Button from "../Button.vue";
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
const title = computed(() =>
    String(manuscriptState.value.frontmatter.title ?? "Untitled Manuscript"),
);
const filename = computed(() => manuscriptState.value.filename);
const message = computed(
    () =>
        messageState.value ||
        (unsavedState.value ? "Unsaved changes" : "Saved"),
);

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
    <header class="topbar">
        <div class="center">
            <input
                ref="titleInput"
                id="manuscript-title"
                class="title"
                :value="title"
                aria-label="Manuscript title"
                placeholder="Untitled Manuscript"
                @input="
                    renameManuscript(
                        ($event.currentTarget as HTMLInputElement).value,
                    )
                "
                @blur="commitManuscriptTitle"
            />
            <span class="meta">
                <span id="filename" class="filename" ref="filenameElement">{{
                    filename
                }}</span>
                <span class="saveGroup">
                    <SaveStatus
                        id="save-status"
                        :status="unsavedState ? 'unsaved' : 'saved'"
                        :message="message"
                    />
                </span>
            </span>
        </div>
        <div class="right">
            <Toolbar />
            <DropdownMenu
                id="app-menu"
                placement="bottom-end"
                :open="menuState"
                @open-change="menuOpen.value = $event"
            >
                <template #trigger>
                    <Button
                        variant="editor"
                        size="small"
                        id="menu-toggle"
                        class="menuToggle"
                        aria-label="Menu"
                        title="Menu (Ctrl+M)"
                        aria-haspopup="true"
                        :aria-expanded="menuState"
                    >
                        <span class="hamburger" aria-hidden="true">
                            <span />
                            <span />
                            <span />
                        </span>
                    </Button>
                </template>
                <nav class="menu" aria-label="Application menu">
                    <button
                        type="button"
                        role="menuitem"
                        class="item"
                        @click="save()"
                    >
                        <span>Save</span>
                        <kbd class="kbd">Ctrl+S</kbd>
                    </button>
                    <button
                        type="button"
                        role="menuitem"
                        class="item"
                        id="menu-save-epub"
                        @click="saveAsEpub()"
                    >
                        <span>Save As</span>
                    </button>
                    <Divider />
                    <button
                        type="button"
                        role="menuitem"
                        class="item"
                        id="menu-new-manuscript"
                        @click="onNew"
                    >
                        New Manuscript
                    </button>
                    <button
                        type="button"
                        role="menuitem"
                        class="item"
                        id="menu-open-manuscript"
                        @click="onOpen"
                    >
                        Open Manuscript
                    </button>
                    <Divider />
                    <a role="menuitem" href="/settings" class="item"
                        >Settings</a
                    >
                    <a role="menuitem" href="/about" class="item">About</a>
                    <Divider />
                    <div
                        :class="['item', 'themeItem']"
                        role="menuitem"
                        data-keep-open
                    >
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
                            class="item"
                            id="menu-fullscreen"
                            @click="toggleFullscreen()"
                        >
                            <span>Fullscreen</span>
                            <kbd class="kbd">F11</kbd>
                        </button>
                        <button
                            type="button"
                            role="menuitem"
                            :class="['item', 'quit']"
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

<style scoped>
.topbar {
    align-items: center;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    box-sizing: border-box;
    display: flex;
    gap: 0.75rem;
    justify-content: space-between;
    max-width: 100%;
    min-width: 0;
    padding: 0.5rem 1rem;
    position: relative;
    z-index: 50;
}

.right {
    align-items: center;
    display: flex;
    flex: 0 0 auto;
    gap: 0.35rem;
}

.center {
    align-items: flex-start;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 0.15rem;
    justify-content: center;
    min-width: 0;
    text-align: left;
}

.title {
    background: transparent;
    border: 0;
    color: var(--text);
    flex: 0 1 auto;
    font-family: "Alegreya", sans-serif;
    font-size: 1rem;
    font-weight: 600;
    line-height: 1.25rem;
    max-width: 30rem;
    min-width: 0;
    outline: 0;
    overflow: hidden;
    padding: 0;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
    width: 100%;
}

.filename {
    color: inherit;
    display: inline-block;
    flex: 0 1 auto;
    font-size: inherit;
    line-height: inherit;
    max-width: 20rem;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.meta {
    align-items: center;
    color: var(--muted);
    display: inline-flex;
    font-size: 0.72rem;
    gap: 0.4rem;
    line-height: 1.2;
    max-width: 100%;
    min-width: 0;
    overflow: hidden;
}

.saveGroup {
    align-items: center;
    color: inherit;
    display: inline-flex;
    flex: 0 0 auto;
    font-size: inherit;
    gap: 0.35rem;
    line-height: inherit;
}

.menuToggle {
    justify-content: center;
    min-height: 1.6rem;
    padding: 0.2rem 0.45rem;
}

.hamburger {
    display: flex;
    flex-direction: column;
    gap: 2.5px;
    justify-content: center;
    width: 0.85rem;
}

.hamburger span {
    background-color: var(--text);
    border-radius: 1px;
    display: block;
    height: 2px;
    transition:
        transform 0.2s,
        opacity 0.2s;
    width: 100%;
}

.menuToggle[aria-expanded="true"] .hamburger span:nth-child(1) {
    transform: translateY(4.5px) rotate(45deg);
}

.menuToggle[aria-expanded="true"] .hamburger span:nth-child(2) {
    opacity: 0;
}

.menuToggle[aria-expanded="true"] .hamburger span:nth-child(3) {
    transform: translateY(-4.5px) rotate(-45deg);
}

.menu {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    box-shadow:
        0 10px 25px -5px rgba(0, 0, 0, 0.2),
        0 8px 10px -6px rgba(0, 0, 0, 0.1);
    display: flex;
    flex-direction: column;
    min-width: 13rem;
    padding: 0.35rem;
}

.item {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: 0.35rem;
    box-sizing: border-box;
    color: var(--text);
    cursor: pointer;
    display: flex;
    font: inherit;
    font-size: 0.9rem;
    justify-content: flex-start;
    min-height: 2.2rem;
    padding: 0.45rem 0.85rem;
    text-align: left;
    text-decoration: none;
    width: 100%;
}

.item:hover,
.item:focus-visible {
    background: var(--surface-sunken);
    color: var(--text);
    outline: none;
}

.item:active {
    background: var(--surface-sunken);
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.12);
    transform: translateY(1px) scale(0.99);
}

.themeItem {
    cursor: default;
    padding: 0.35rem 0.5rem;
}

.themeItem:hover {
    background: transparent;
}

.kbd {
    background: var(--surface-sunken);
    border: 1px solid var(--border);
    border-radius: 0.25rem;
    color: var(--text);
    font-family: inherit;
    font-size: 0.68rem;
    font-weight: normal;
    margin-left: auto;
    padding: 0.05rem 0.35rem;
}

.quit {
    color: var(--danger);
}

@media (max-width: 55rem) {
    .topbar {
        gap: 0.5rem;
        padding: 0.5rem 0.75rem;
    }
}

@media (max-width: 36rem) {
    .topbar {
        padding-inline: 0.5rem;
    }

    .title {
        font-size: 0.85rem;
        max-width: none;
    }
}
</style>
