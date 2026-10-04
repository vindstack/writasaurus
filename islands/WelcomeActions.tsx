import { useRef } from "preact/hooks";
import { Button } from "../components/Button.tsx";
import { blankManuscript, parseManuscript, SAMPLE_NOVEL } from "../lib/editor/data.ts";
import { saveLocal, setSkipWelcome, storeHandle } from "../lib/editor/storage.ts";
import { parseEpub } from "../lib/epub.ts";
import { requestOpen } from "../lib/open-manuscript.ts";
import { usePageEffects } from "../lib/use-page-effects.ts";
import styles from "./WelcomeActions.module.css";

interface WelcomeActionsProps {
  isDesktop: boolean;
}

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

export default function WelcomeActions({ isDesktop }: WelcomeActionsProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  usePageEffects(returnToEditor);

  async function closeActiveDesktopFile(): Promise<void> {
    if (!isDesktop) return;
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
    const result = await requestOpen(isDesktop);
    if (result.kind === "cancelled") return;
    if (result.kind === "input") {
      fileInput.current?.click();
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

  return (
    <>
      <div class={styles.actions}>
        <Button variant="primary" block id="welcome-open" onClick={open}>
          Browse Local File
        </Button>
        <Button block id="welcome-new" onClick={() => startFrom(blankManuscript())}>
          Start New Manuscript
        </Button>
        <Button
          block
          id="welcome-sample"
          onClick={() => startFrom(parseManuscript(SAMPLE_NOVEL, "the-chroniclers-compass.epub"))}
        >
          Load Sample Novel
        </Button>
        <input
          ref={fileInput}
          id="welcome-file-input"
          type="file"
          accept=".epub,application/epub+zip"
          hidden
          onChange={onFileChosen}
        />
      </div>
      <div class={styles.footer}>
        <a
          href="/"
          class={styles.returnLink}
          title="Return to Editor (Ctrl+Shift+E)"
          onClick={() => setSkipWelcome()}
        >
          ← Return to Editor
        </a>
      </div>
    </>
  );
}
