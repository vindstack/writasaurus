import { blankManuscript, parseManuscript, SAMPLE_NOVEL } from "../editor/client/data.ts";
import { openFile } from "../editor/client/fileio.ts";
import { state } from "../editor/client/state.ts";
import { saveLocal, setSkipWelcome, storeHandle } from "../editor/client/storage.ts";
import { registerReturnToEditorShortcut } from "../../../lib/shortcuts.ts";
import { parseEpub } from "../../../lib/epub.ts";
import { applyThemePreference, getThemePreference } from "../../../lib/settings.ts";

applyThemePreference(getThemePreference());

try {
  const statusRes = await fetch("/api/editor/status");
  if (statusRes.ok) {
    const status = await statusRes.json();
    state.isDesktop = status.isDesktop === true;
  }
} catch {
  state.isDesktop = false;
}

function navigateToEditor(): void {
  globalThis.location.href = "/";
}

const fileInput = document.querySelector<HTMLInputElement>("#welcome-file-input");
const openButton = document.querySelector<HTMLButtonElement>("#welcome-open");
const newButton = document.querySelector<HTMLButtonElement>("#welcome-new");
const sampleButton = document.querySelector<HTMLButtonElement>("#welcome-sample");

async function readManuscriptFile(file: File) {
  return await parseEpub(new Uint8Array(await file.arrayBuffer()), file.name);
}

openButton?.addEventListener("click", () => {
  if (!fileInput) return;
  void openFile(fileInput, async (file, handle) => {
    if (file.size > 0) {
      const manuscript = await readManuscriptFile(file);
      saveLocal(manuscript, 0);
      await storeHandle(handle);
    }
    navigateToEditor();
  });
});

fileInput?.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (file) {
    const manuscript = await readManuscriptFile(file);
    saveLocal(manuscript, 0);
    await storeHandle(null);
    navigateToEditor();
  }
  fileInput.value = "";
});

async function closeActiveDesktopFile(): Promise<void> {
  if (!state.isDesktop) return;
  try {
    await fetch("/api/editor/close", { method: "POST" });
  } catch (error) {
    console.warn("Could not clear the previously active file.", error);
  }
}

newButton?.addEventListener("click", async () => {
  const manuscript = blankManuscript();
  saveLocal(manuscript, 0);
  await storeHandle(null);
  await closeActiveDesktopFile();
  navigateToEditor();
});

sampleButton?.addEventListener("click", async () => {
  const manuscript = parseManuscript(SAMPLE_NOVEL, "the-chroniclers-compass.epub");
  saveLocal(manuscript, 0);
  await storeHandle(null);
  await closeActiveDesktopFile();
  navigateToEditor();
});

const returnLink = document.querySelector<HTMLAnchorElement>(".return-link");
returnLink?.addEventListener("click", () => {
  setSkipWelcome();
});

registerReturnToEditorShortcut(() => {
  setSkipWelcome();
  navigateToEditor();
});
