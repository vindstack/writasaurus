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
    desktopFileLoaded,
    editorMode,
    hasUnsavedChanges,
    manuscript,
    menuOpen,
    outlineHasUnsavedChanges,
    outlineSaveMessage,
    renameManuscript,
    saveMessage,
} from "../../lib/editor/state.ts";
import { useSignalValue } from "../vue-signals.ts";
import Button from "../../../../../packages/shared/ui/components/Button.vue";
import DropdownMenu from "../../../../../packages/shared/ui/components/DropdownMenu.vue";
import Divider from "../../../../../packages/shared/ui/components/Divider.vue";
import SaveStatus from "../SaveStatus.vue";

const props = defineProps<{
    onNewProject: () => void;
    onOpenProject: () => void;
    onOpenOutline: () => Promise<boolean>;
    onShowManuscript: () => Promise<boolean>;
    toolbarVisible: boolean;
    onToggleToolbar: () => void;
}>();

const titleInput = ref<HTMLInputElement | null>(null);
const manuscriptState = useSignalValue(manuscript);
const unsavedState = useSignalValue(hasUnsavedChanges);
const messageState = useSignalValue(saveMessage);
const modeState = useSignalValue(editorMode);
const outlineUnsavedState = useSignalValue(outlineHasUnsavedChanges);
const outlineMessageState = useSignalValue(outlineSaveMessage);
const projectLoadedState = useSignalValue(desktopFileLoaded);
const menuState = useSignalValue(menuOpen);
const title = computed(() =>
    String(manuscriptState.value.frontmatter.title ?? "Untitled Manuscript"),
);
const message = computed(
    () => modeState.value === "outline"
        ? outlineMessageState.value ||
        (outlineUnsavedState.value || unsavedState.value ? "Unsaved changes" : "Saved")
        : messageState.value || (unsavedState.value ? "Unsaved changes" : "Saved"),
);

onMounted(() => {
    const sync = () => {
        if (titleInput.value) syncTruncationTooltip(titleInput.value);
    };
    sync();
    addEventListener("resize", sync);
    onUnmounted(() => removeEventListener("resize", sync));
});
</script>

<template>
    <header class="topbar">
        <div class="titleGroup">
            <input ref="titleInput" id="manuscript-title" class="title" :value="title" aria-label="Manuscript title"
                placeholder="Untitled Manuscript" @input="
                    renameManuscript(
                        ($event.currentTarget as HTMLInputElement).value,
                    )
                    " @blur="commitManuscriptTitle" />
            <SaveStatus id="save-status" class="saveStatus" :status="(modeState === 'outline'
                ? outlineUnsavedState || unsavedState
                : unsavedState)
                ? 'unsaved'
                : 'saved'" :message="message" />
        </div>
        <div class="right">
            <div
                class="modeSwitch"
                role="group"
                aria-label="Project view"
                aria-keyshortcuts="Control+G Meta+G"
                title="Switch between Manuscript and Outline (Ctrl+G)"
            >
                <button
                    type="button"
                    class="modeOption"
                    :class="{ selected: modeState === 'manuscript' }"
                    :aria-pressed="modeState === 'manuscript'"
                    :disabled="modeState === 'manuscript'"
                    data-project-mode="manuscript"
                    @click="props.onShowManuscript()"
                >
                    Manuscript
                </button>
                <button
                    type="button"
                    class="modeOption"
                    :class="{ selected: modeState === 'outline' }"
                    :aria-pressed="modeState === 'outline'"
                    :disabled="modeState === 'outline' || !projectLoadedState"
                    :title="!projectLoadedState ? 'Open or create a project first' : undefined"
                    data-project-mode="outline"
                    @click="props.onOpenOutline()"
                >
                    Outline
                </button>
            </div>
            <DropdownMenu id="app-menu" placement="bottom-end" :open="menuState" @open-change="menuOpen.value = $event">
                <template #trigger>
                    <Button variant="quiet" size="small" id="menu-toggle" class="menuToggle" aria-label="Menu"
                        title="Menu (Ctrl+M)" aria-haspopup="true" :aria-expanded="menuState">
                        <span class="hamburger" aria-hidden="true">
                            <span />
                            <span />
                            <span />
                        </span>
                    </Button>
                </template>
                <nav class="menu" aria-label="Application menu">
                    <button type="button" role="menuitem" class="item" @click="save()">
                        <span>Save</span>
                        <kbd class="kbd">Ctrl+S</kbd>
                    </button>
                    <button v-if="modeState === 'manuscript'" type="button" role="menuitem" class="item"
                        id="menu-save-epub" @click="saveAsEpub()">
                        <span>Save As</span>
                    </button>
                    <Divider />
                    <button type="button" role="menuitem" class="item" id="menu-new-project" @click="onNewProject">
                        New Project
                        <kbd class="kbd">Ctrl+N</kbd>
                    </button>
                    <button type="button" role="menuitem" class="item" id="menu-open-project" @click="onOpenProject">
                        Open Project
                        <kbd class="kbd">Ctrl+O</kbd>
                    </button>
                    <Divider />
                    <a role="menuitem" href="/settings" class="item">Settings</a>
                    <button type="button" role="menuitem" class="item" id="menu-toggle-toolbar"
                        @click="onToggleToolbar">
                        {{ toolbarVisible ? "Hide toolbar" : "Show toolbar" }}
                    </button>
                    <a role="menuitem" href="/about" class="item">About</a>
                    <Divider />
                    <button type="button" role="menuitem" class="item" id="menu-fullscreen" @click="toggleFullscreen()">
                        <span>Fullscreen</span>
                        <kbd class="kbd">F11</kbd>
                    </button>
                    <button type="button" role="menuitem" :class="['item', 'quit']" id="menu-quit" @click="quit()">
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

.modeSwitch {
    align-items: stretch;
    background: var(--surface-sunken);
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    display: flex;
    gap: 0.1rem;
    padding: 0.12rem;
}

.modeOption {
    background: transparent;
    border: 0;
    border-radius: calc(var(--radius-control) - 0.12rem);
    color: var(--muted);
    cursor: pointer;
    font: inherit;
    font-size: 0.75rem;
    font-weight: 500;
    line-height: 1.2;
    min-height: 1.55rem;
    padding: 0.2rem 0.55rem;
    white-space: nowrap;
}

.modeOption:hover:not(:disabled) {
    background: var(--surface);
    color: var(--text);
}

.modeOption.selected {
    background: var(--surface);
    box-shadow: var(--shadow-sm);
    color: var(--accent-strong);
    font-weight: 600;
}

.modeOption:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
}

.modeOption:disabled {
    cursor: default;
    opacity: 1;
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

.saveStatus {
    color: var(--muted);
    font-size: 0.72rem;
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

.item.selected,
.item:disabled {
    color: var(--muted);
    cursor: default;
}

.item:disabled:hover,
.item.selected:hover {
    background: transparent;
}

.selection {
    color: var(--accent);
    font-weight: 700;
    margin-left: auto;
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
