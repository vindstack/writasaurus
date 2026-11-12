<script setup lang="ts">
import { onMounted, ref } from "vue";
import { isSupported } from "@writasaurus/fs";
import Button from "../../../../../packages/shared/ui/components/Button.vue";
import { restoreLocal, setSkipWelcome } from "../../lib/editor/storage.ts";
import { requestProject } from "../../lib/open-project.ts";
import { usePageEffects } from "../../composables/usePageEffects.ts";
import ProjectCreateDialog from "./ProjectCreateDialog.vue";

const createProjectOpen = ref(false);
const supported = ref(true);
onMounted(() => (supported.value = isSupported()));

function navigateToEditor(): void {
  globalThis.location.href = "/editor";
}

function returnToEditor(): void {
  setSkipWelcome();
  navigateToEditor();
}

usePageEffects(returnToEditor);

async function openExistingProject(): Promise<void> {
  const result = await requestProject(async () => confirmDiscardCachedChanges());
  if (result.kind === "cancelled") return;
  navigateToEditor();
}

function confirmDiscardCachedChanges(): boolean {
  const saved = restoreLocal();
  if (!saved?.hasUnsavedChanges && !saved?.outlineHasUnsavedChanges) return true;
  return confirm(
    "You have unsaved changes in this tab. Return to the editor to export them, or discard them and continue?",
  );
}

function startNewProject(): void {
  if (confirmDiscardCachedChanges()) createProjectOpen.value = true;
}
</script>

<template>
  <div class="actions">
    <p v-if="!supported" role="alert">
      This browser does not support project folders. Use Chrome or Edge to open or create projects.
    </p>
    <Button variant="primary" block id="welcome-project-open" @click="openExistingProject">
      Open Existing Project
    </Button>
    <Button block id="welcome-project-new" @click="startNewProject"> Create New Project </Button>
  </div>
  <ProjectCreateDialog
    :open="createProjectOpen"
    @close="createProjectOpen = false"
    @created="navigateToEditor"
  />
  <div class="footer">
    <a
      href="/editor"
      class="returnLink"
      title="Return to Editor (Ctrl+Shift+E)"
      @click="setSkipWelcome()"
    >
      ← Return to Editor
    </a>
  </div>
</template>

<style scoped>
.actions {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

.footer {
  margin-top: 0.5rem;
  text-align: center;
}

.returnLink {
  color: var(--muted);
  font-size: 0.875rem;
  text-decoration: none;
}

.returnLink:hover {
  color: var(--text);
}
</style>
