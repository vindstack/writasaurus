<script setup lang="ts">
import { ref } from "vue";
import Button from "../../../../../packages/shared/ui/components/Button.vue";
import { setSkipWelcome } from "../../lib/editor/storage.ts";
import { requestProject } from "../../lib/open-project.ts";
import { usePageEffects } from "../../composables/usePageEffects.ts";
import ProjectCreateDialog from "./ProjectCreateDialog.vue";

const createProjectOpen = ref(false);

function navigateToEditor(): void {
  globalThis.location.href = "/";
}

function returnToEditor(): void {
  setSkipWelcome();
  navigateToEditor();
}

usePageEffects(returnToEditor);

async function openExistingProject(): Promise<void> {
  const result = await requestProject();
  if (result.kind === "cancelled") return;
  navigateToEditor();
}
</script>

<template>
  <div class="actions">
    <Button variant="primary" block id="welcome-project-open" @click="openExistingProject">
      Open Existing Project
    </Button>
    <Button block id="welcome-project-new" @click="createProjectOpen = true">
      Create New Project
    </Button>
  </div>
  <ProjectCreateDialog :open="createProjectOpen" @close="createProjectOpen = false" @created="navigateToEditor" />
  <div class="footer">
    <a href="/" class="returnLink" title="Return to Editor (Ctrl+Shift+E)" @click="setSkipWelcome()">
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
