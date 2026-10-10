<script setup lang="ts">
import { ref } from "vue";
import Button from "../Button.vue";
import { blankManuscript, parseManuscript, SAMPLE_NOVEL } from "../../lib/editor/data.ts";
import { saveLocal, setSkipWelcome, storeHandle } from "../../lib/editor/storage.ts";
import { parseEpub } from "../../lib/epub.ts";
import { requestOpen } from "../../lib/open-manuscript.ts";
import { usePageEffects } from "../../composables/usePageEffects.ts";

const props = defineProps<{ isDesktop: boolean }>();
const fileInput = ref<HTMLInputElement | null>(null);

function navigateToEditor(): void {
  globalThis.location.href = "/";
}

function returnToEditor(): void {
  setSkipWelcome();
  navigateToEditor();
}

async function readManuscriptFile(file: File) {
  return await parseEpub(new Uint8Array(await file.arrayBuffer()), file.name);
}

usePageEffects(returnToEditor);

async function closeActiveDesktopFile(): Promise<void> {
  if (!props.isDesktop) return;
  try {
    await fetch("/api/editor/close", { method: "POST" });
  } catch (error) {
    console.warn("Could not clear the previously active file.", error);
  }
}

async function startFrom(manuscript: ReturnType<typeof blankManuscript>): Promise<void> {
  saveLocal(manuscript, 0);
  await storeHandle(null);
  await closeActiveDesktopFile();
  navigateToEditor();
}

async function open(): Promise<void> {
  const result = await requestOpen(props.isDesktop);
  if (result.kind === "cancelled") return;
  if (result.kind === "input") {
    fileInput.value?.click();
    return;
  }
  if (result.kind === "file" && result.file.size > 0) {
    saveLocal(await readManuscriptFile(result.file), 0);
    await storeHandle(result.handle);
  }
  navigateToEditor();
}

async function onFileChosen(event: Event): Promise<void> {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  if (file) {
    saveLocal(await readManuscriptFile(file), 0);
    await storeHandle(null);
    navigateToEditor();
  }
  input.value = "";
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
    <input
      ref="fileInput"
      id="welcome-file-input"
      type="file"
      accept=".epub,application/epub+zip"
      hidden
      @change="onFileChosen"
    />
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
