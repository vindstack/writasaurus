export interface FileDialogOptions {
  title: string;
  defaultPath?: string;
  filters: { name: string; extensions: string[] }[];
}

/** Native capabilities are injected by Electron and can be replaced in Node tests. */
export interface Platform {
  exit(): void;
  openFile(options: FileDialogOptions): Promise<string | null>;
  saveFile(options: FileDialogOptions): Promise<string | null>;
  chooseDirectory(options: { title: string }): Promise<string | null>;
}

const KEY = "__WRITASAURUS_PLATFORM__";
type Holder = Record<string, Partial<Platform> | undefined>;

const defaults: Platform = {
  exit: () => process.exit(0),
  openFile: unavailableDialog,
  saveFile: unavailableDialog,
  chooseDirectory: unavailableDialog,
};

async function unavailableDialog(): Promise<never> {
  throw new Error(
    "Native file dialogs are unavailable. Open Writasaurus in the desktop application.",
  );
}

/**
 * State lives on `globalThis` so Electron and tests can configure the built Astro server bundle,
 * which is a separate module graph.
 */
export function setPlatform(overrides: Partial<Platform> | undefined): void {
  (globalThis as unknown as Holder)[KEY] = overrides;
}

export function getPlatform(): Platform {
  return { ...defaults, ...(globalThis as unknown as Holder)[KEY] };
}
