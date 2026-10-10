<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { syncTruncationTooltip } from "../../lib/text/text.ts";
import {
    quit,
    save,
    saveAsEpub,
    toggleFullscreen,
} from "../../lib/editor/commands.ts";
import {
    commitManuscriptTitle,
    hasUnsavedChanges,
    manuscript,
    menuOpen,
    renameManuscript,
    saveMessage,
} from "../../lib/editor/state.ts";
import { useSignalValue } from "../vue-signals.ts";
import Button from "../../../../../packages/shared/ui/components/Button.vue";
import DropdownMenu from "../../../../../packages/shared/ui/components/DropdownMenu.vue";
import Divider from "../../../../../packages/shared/ui/components/Divider.vue";
import SaveStatus from "../SaveStatus.vue";

defineProps<{
    onNew: () => void;
    onOpen: () => void;
    toolbarVisible: boolean;
    onToggleToolbar: () => void;
}>();

const titleInput = ref<HTMLInputElement | null>(null);
const filenameElement = ref<HTMLSpanElement | null>(null);
const manuscriptState = useSignalValue(manuscript);
const unsavedState = useSignalValue(hasUnsavedChanges);
const messageState = useSignalValue(saveMessage);
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
    const sync = () => {
        if (titleInput.value) syncTruncationTooltip(titleInput.value);
        if (filenameElement.value) syncTruncationTooltip(filenameElement.value);
    };
    sync();
    addEventListener("resize", sync);
    onUnmounted(() => removeEventListener("resize", sync));
});
</script>

<template>
    <header class="topbar">
        <div class="titleGroup">
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
            <DropdownMenu
                id="app-menu"
                placement="bottom-end"
                :open="menuState"
                @open-change="menuOpen.value = $event"
            >
                <template #trigger>
                    <Button
                        variant="quiet"
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
                    <button
                        type="button"
                        role="menuitem"
                        class="item"
                        id="menu-toggle-toolbar"
                        @click="onToggleToolbar"
                    >
                        {{ toolbarVisible ? "Hide toolbar" : "Show toolbar" }}
                    </button>
                    <a role="menuitem" href="/about" class="item">About</a>
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
    height: 2.4rem;
    justify-content: space-between;
    max-width: 100%;
    min-width: 0;
    padding: 0.25rem 1rem;
    position: relative;
    z-index: 50;
}

.right {
    align-items: center;
    display: flex;
    flex: 0 0 auto;
    gap: 0.35rem;
}

.titleGroup {
    align-items: center;
    display: flex;
    flex: 0 1 auto;
    flex-direction: row;
    gap: 0.75rem;
    justify-content: flex-start;
    min-width: 0;
    text-align: left;
}

.title {
    background: transparent;
    border: 0;
    color: var(--text);
    cursor: text;
    field-sizing: content;
    flex: 0 1 auto;
    font-family: "Alegreya", sans-serif;
    font-size: 1rem;
    font-weight: 600;
    line-height: 1.25rem;
    max-width: min(30rem, 40vw);
    min-width: 0;
    outline: 0;
    overflow: hidden;
    padding: 0;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
    width: fit-content;
}

.title:focus {
    border-color: transparent;
    box-shadow: none;
    outline: none;
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
    gap: 2px;
    justify-content: center;
    width: 14px;
}

.hamburger span {
    background-color: var(--text);
    border-radius: 999px;
    display: block;
    height: 2px;
    transition:
        transform 0.2s,
        opacity 0.2s;
    width: 100%;
}

.menuToggle[aria-expanded="true"] .hamburger span:nth-child(1) {
    transform: translateY(4px) rotate(45deg);
}

.menuToggle[aria-expanded="true"] .hamburger span:nth-child(2) {
    opacity: 0;
}

.menuToggle[aria-expanded="true"] .hamburger span:nth-child(3) {
    transform: translateY(-4px) rotate(-45deg);
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
        padding: 0.25rem 0.75rem;
    }
}

@media (max-width: 36rem) {
    .topbar {
        padding: 0.25rem 0.5rem;
    }

    .title {
        font-size: 0.85rem;
        max-width: min(45vw, 12rem);
    }

    .titleGroup {
        gap: 0.2rem;
    }

    .meta {
        font-size: 0.65rem;
    }
}
</style>
