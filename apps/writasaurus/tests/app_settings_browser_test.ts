import { beforeEach, describe, expect, it, vi } from "vitest";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("browser app settings", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("localStorage", new MemoryStorage());
  });

  it("persists preferences without an editor server", async () => {
    const settings = await import("../src/lib/app-settings-client.ts");
    const defaults = await settings.loadAppSettings();
    expect(defaults.wordsPerPage).toBeGreaterThan(0);

    await settings.saveWordsPerPagePreference(300);
    await settings.saveWritingAssistanceWords(["one", "one", "two"]);
    vi.resetModules();

    const reloaded = await import("../src/lib/app-settings-client.ts");
    expect(await reloaded.loadAppSettings()).toMatchObject({
      wordsPerPage: 300,
      writingAssistanceWords: ["one", "two"],
    });
  });

  it("surfaces invalid saved settings rather than overwriting them", async () => {
    localStorage.setItem("writasaurus-app-settings-v1", "invalid");
    const settings = await import("../src/lib/app-settings-client.ts");
    await expect(settings.loadAppSettings()).rejects.toThrow();
    expect(localStorage.getItem("writasaurus-app-settings-v1")).toBe("invalid");
  });

  it("does not report success when browser storage fails", async () => {
    const settings = await import("../src/lib/app-settings-client.ts");
    await settings.loadAppSettings();
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("Storage is full", "QuotaExceededError");
    });
    await expect(settings.saveWordsPerPagePreference(300)).rejects.toThrow("Storage is full");
    expect(settings.appSettingsError.value).toBe("Storage is full");
  });
});
