<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { saveLocal } from "../../lib/editor/storage.ts";
import { openProject } from "../../lib/editor/file-io.ts";
import { restoreEditor } from "../../lib/editor/session.ts";
import { focusEditor, redo, undo } from "../../lib/editor/surface.ts";
import { save, toggleFullscreen } from "../../lib/editor/commands.ts";
import { toggleAssistance } from "../../lib/editor/assistance-state.ts";
import { checkSavedLicense, licenseConfiguration } from "../../lib/license.ts";
import { getProjectShortcutAction } from "../../lib/shortcuts.ts";
import type { Manuscript } from "../../lib/editor/types.ts";
import { editorHistory } from "../../lib/editor/history.ts";
import {
    activeChapterIndex,
    desktopFileLoaded,
    hasUnsavedChanges,
    manuscript,
    menuOpen,
    replaceManuscript,
    sidebarOpen,
    statsIndex,
} from "../../lib/editor/state.ts";
import { effect } from "@preact/signals";
import Topbar from "../editor/Topbar.vue";
import Toolbar from "../editor/Toolbar.vue";
import Sidebar from "../editor/Sidebar.vue";
import WritingArea from "../editor/WritingArea.vue";
import AssistancePanel from "../editor/AssistancePanel.vue";
import StatusBar from "../editor/StatusBar.vue";
import LicenseGate from "./LicenseGate.vue";
import ProjectCreateDialog from "./ProjectCreateDialog.vue";

const AUTOSAVE_DEBOUNCE_MS = 1_000;
const {
    publicKey: licensePublicKey,
    apiUrl: licenseApiUrl,
    testBypass: licenseTestBypass,
} = licenseConfiguration();
const ready = ref(false);
const licensed = ref(false);
const licenseCheckError = ref("");
const toolbarVisible = ref(true);
const createProjectOpen = ref(false);
let disposed = false;
let stopPersistence: (() => void) | undefined;
let autosaveTimer: ReturnType<typeof setTimeout> | undefined;
let licenseRefreshTimer: ReturnType<typeof setInterval> | undefined;
let cleanupListeners: (() => void) | undefined;

onMounted(() => {
    if (!licenseTestBypass) {
        void checkSavedLicense(licensePublicKey, licenseApiUrl).then((valid) => {
            licensed.value = valid;
            ready.value = true;
            if (valid) {
                void restoreDesktopEditor();
                licenseRefreshTimer = setInterval(() => {
                    void checkSavedLicense(licensePublicKey, licenseApiUrl).then((stillValid) => {
                        licensed.value = stillValid;
                    }).catch((error: unknown) => {
                        console.warn(
                            "Could not refresh the Writasaurus license.",
                            error,
                        );
                    });
                }, 24 * 60 * 60 * 1000);
            }
        }).catch((error: unknown) => {
            licenseCheckError.value = error instanceof Error
                ? error.message
                : "Could not verify the saved license.";
            ready.value = true;
        });
    } else {
        licensed.value = true;
        ready.value = true;
        void restoreDesktopEditor();
    }
    const onKeyDown = (event: KeyboardEvent) => {
        const modifier = event.ctrlKey || event.metaKey;
        const key = event.key.toLowerCase();
        const projectAction = getProjectShortcutAction(event);
        if (projectAction === "new-project") {
            event.preventDefault();
            createProjectOpen.value = true;
        } else if (projectAction === "open-project") {
            event.preventDefault();
            void openProject();
        } else if (projectAction === "writing-assistance") {
            event.preventDefault();
            void toggleAssistance();
        } else if (modifier && key === "z") {
            event.preventDefault();
            if (event.shiftKey) redo();
            else undo();
        } else if (modifier && key === "y") {
            event.preventDefault();
            redo();
        } else if (modifier && key === "b") {
            event.preventDefault();
            sidebarOpen.value = !sidebarOpen.value;
        } else if (modifier && key === "g") {
            event.preventDefault();
            statsIndex.value = (statsIndex.value + 1) % 3;
        } else if (modifier && key === "s") {
            event.preventDefault();
            void save();
        } else if (modifier && event.key === ",") {
            event.preventDefault();
            location.href = "/settings";
        } else if (modifier && event.shiftKey && key === "e") {
            event.preventDefault();
            focusEditor();
        } else if (event.key === "F11") {
            event.preventDefault();
            menuOpen.value = false;
            void toggleFullscreen();
        } else if (event.key === "Escape") {
            menuOpen.value = false;
        } else if (modifier && key === "m") {
            event.preventDefault();
            menuOpen.value = true;
            setTimeout(() => {
                document
                    .querySelector<HTMLElement>('#app-menu [role="menuitem"]')
                    ?.focus();
            });
        }
    };
    document.addEventListener("keydown", onKeyDown);
    cleanupListeners = () => {
        document.removeEventListener("keydown", onKeyDown);
    };
});

async function restoreDesktopEditor(): Promise<void> {
    const opened = await restoreEditor();
    if (disposed) return;
    if (!opened) {
        location.replace("/welcome");
        return;
    }
    stopPersistence = effect(() => {
        const unsaved = hasUnsavedChanges.value;
        saveLocal(manuscript.value, activeChapterIndex.value, unsaved);
        if (desktopFileLoaded.value && unsaved) {
            clearTimeout(autosaveTimer);
            autosaveTimer = setTimeout(
                () => void save(),
                AUTOSAVE_DEBOUNCE_MS,
            );
        } else if (!unsaved) {
            clearTimeout(autosaveTimer);
        }
        return () => clearTimeout(autosaveTimer);
    });
}

onUnmounted(() => {
    disposed = true;
    stopPersistence?.();
    clearTimeout(autosaveTimer);
    clearInterval(licenseRefreshTimer);
    cleanupListeners?.();
});

function onLicenseActivated(): void {
    licensed.value = true;
    void restoreDesktopEditor();
    licenseRefreshTimer = setInterval(() => {
        void checkSavedLicense(licensePublicKey, licenseApiUrl).then((stillValid) => {
            licensed.value = stillValid;
        }).catch((error: unknown) => {
            console.warn("Could not refresh the Writasaurus license.", error);
        });
    }, 24 * 60 * 60 * 1000);
}

function useCreatedProject(created: Manuscript): void {
    replaceManuscript(created, { desktopFileLoaded: true });
    editorHistory.clear();
}

</script>

<template>
    <p v-if="licenseCheckError && !licensed" role="alert">
        {{ licenseCheckError }} You may retry by restarting Writasaurus.
    </p>
    <LicenseGate
        v-else-if="ready && !licensed"
        :public-key="licensePublicKey"
        :api-url="licenseApiUrl"
        @activated="onLicenseActivated"
    />
    <div
        v-else-if="licensed"
        :class="['app', !toolbarVisible && 'toolbarHidden']"
        :data-ready="String(ready)"
    >
        <Topbar
            :on-new-project="() => createProjectOpen = true"
            :on-open-project="() => void openProject()"
            :toolbar-visible="toolbarVisible"
            :on-toggle-toolbar="() => toolbarVisible = !toolbarVisible"
        />
        <ProjectCreateDialog
            :open="createProjectOpen"
            @close="createProjectOpen = false"
            @created="useCreatedProject"
        />
        <Toolbar v-if="toolbarVisible" />
        <main class="main">
            <div class="workspace">
                <Sidebar />
                <WritingArea />
                <AssistancePanel />
            </div>
        </main>
        <StatusBar />
    </div>
</template>

<style scoped>
.app {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr) auto;
    height: 100vh;
    max-width: 100vw;
    overflow: hidden;
    width: 100vw;
}

.app.toolbarHidden {
    grid-template-rows: auto minmax(0, 1fr) auto;
}

.main {
    min-height: 0;
    min-width: 0;
    overflow: hidden;
    width: 100%;
}

.workspace {
    display: flex;
    height: 100%;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
    position: relative;
    width: 100%;
}

@media (max-width: 55rem) {
    .app {
        height: 100dvh;
    }
}
</style>
