<script setup lang="ts">
import Button from "../../../../../packages/shared/ui/components/Button.vue";
import { blankManuscript, parseManuscript, SAMPLE_NOVEL } from "../../lib/editor/data.ts";
import { saveLocal, setSkipWelcome } from "../../lib/editor/storage.ts";
import { requestOpen } from "../../lib/open-manuscript.ts";
import { usePageEffects } from "../../composables/usePageEffects.ts";

function navigateToEditor(): void {
  globalThis.location.href = "/";
}

function returnToEditor(): void {
  setSkipWelcome();
  navigateToEditor();
}

usePageEffects(returnToEditor);

async function closeActiveFile(): Promise<void> {
  try {
    await fetch("/api/editor/close", { method: "POST" });
  } catch (error) {
    console.warn("Could not clear the previously active file.", error);
  }
}

async function startFrom(manuscript: ReturnType<typeof blankManuscript>): Promise<void> {
  saveLocal(manuscript, 0);
  await closeActiveFile();
  navigateToEditor();
}

async function open(): Promise<void> {
  const result = await requestOpen();
  if (result.kind === "cancelled") return;
  navigateToEditor();
}
</script>

<template>
  <div class="actions">
    <Button variant="primary" block id="welcome-open" @click="open">Browse Local File</Button>
    <Button block id="welcome-new" @click="startFrom(blankManuscript())">
      Start New Manuscript
    </Button>
    <Button
      block
      id="welcome-sample"
      @click="startFrom(parseManuscript(SAMPLE_NOVEL, 'the-chroniclers-compass.epub'))"
    >
      Load Sample Novel
    </Button>
  </div>
  <div class="footer">
    <a
      href="/"
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
