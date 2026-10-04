import { join } from "@std/path";

const staticDir = "static";
const distDir = "dist";
const assetsDir = join(distDir, "assets");
const manifestPath = join(distDir, "manifest.json");

async function hash(data: BufferSource): Promise<string> {
  const buffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(buffer));
  const hex = hashArray.map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return hex.slice(0, 8);
}

async function copyDir(srcDir: string, destDir: string): Promise<void> {
  try {
    for await (const entry of Deno.readDir(srcDir)) {
      const srcPath = join(srcDir, entry.name);
      const destPath = join(destDir, entry.name);
      if (entry.isDirectory) {
        await Deno.mkdir(destPath, { recursive: true });
        await copyDir(srcPath, destPath);
      } else if (entry.isFile) {
        await Deno.copyFile(srcPath, destPath);
      }
    }
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
}

function manifestKey(entry: string): string {
  return entry.replace(/^\.?\/*src\//, "");
}

function outputExtension(entry: string): string {
  return entry.endsWith(".css") ? ".css" : ".js";
}

function outputStem(entry: string): string {
  return manifestKey(entry)
    .replace(/\.[^.]+$/, "")
    .replaceAll("/", "-");
}

export interface BundleOptions {
  hash?: boolean;
  hashFiles?: boolean;
  manifest?: boolean;
  watch?: boolean;
}

function parseBooleanArg(name: string): boolean | undefined {
  if (Deno.args.includes(`--${name}`)) return true;
  if (Deno.args.includes(`--no-${name}`)) return false;
  return undefined;
}

export function resolveBundleOptions(options?: BundleOptions): {
  hash: boolean;
  manifest: boolean;
  watch: boolean;
} {
  const hashArg = parseBooleanArg("hash") ?? parseBooleanArg("hash-files");
  const manifestArg = parseBooleanArg("manifest");
  const watchArg = parseBooleanArg("watch");

  return {
    hash: options?.hash ?? options?.hashFiles ?? hashArg ?? false,
    manifest: options?.manifest ?? manifestArg ?? false,
    watch: options?.watch ?? watchArg ?? false,
  };
}

export async function build(
  entries: readonly string[],
  options?: BundleOptions,
): Promise<void> {
  const { hash: hashEnabled, manifest: manifestEnabled } = resolveBundleOptions(options);
  const startTime = performance.now();
  const tempDir = await Deno.makeTempDir({ prefix: "deno-bundle-" });

  try {
    await Deno.mkdir(assetsDir, { recursive: true });

    try {
      for await (const entry of Deno.readDir(assetsDir)) {
        await Deno.remove(join(assetsDir, entry.name), { recursive: true });
      }
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }

    try {
      await Deno.remove(join(distDir, ".vite"), { recursive: true });
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }

    try {
      await Deno.remove(manifestPath);
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }

    const manifest: Record<string, string> = {};
    for (const entry of entries) {
      const extension = outputExtension(entry);
      const bundledPath = join(tempDir, `${outputStem(entry)}${extension}`);
      const command = new Deno.Command(Deno.execPath(), {
        args: [
          "bundle",
          "--platform=browser",
          "--minify",
          "-o",
          bundledPath,
          entry,
        ],
        stdout: "piped",
        stderr: "piped",
      });
      const output = await command.output();
      if (!output.success) {
        const stderr = new TextDecoder().decode(output.stderr);
        throw new Error(`Failed to bundle ${entry}:\n${stderr}`);
      }

      const data = await Deno.readFile(bundledPath);
      let outputName: string;
      if (hashEnabled) {
        const contentHash = await hash(data);
        outputName = `${outputStem(entry)}-${contentHash}${extension}`;
      } else {
        outputName = `${outputStem(entry)}${extension}`;
      }
      await Deno.writeFile(join(assetsDir, outputName), data);
      if (manifestEnabled) {
        manifest[manifestKey(entry)] = `/assets/${outputName}`;
      }
    }

    if (manifestEnabled) {
      await Deno.writeTextFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    }
    await copyDir(staticDir, distDir);

    const elapsed = Math.round(performance.now() - startTime);
    console.log(`✓ built ${entries.length} asset entries in ${elapsed}ms`);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
}

export async function bundle(
  entries: readonly string[],
  options?: BundleOptions,
): Promise<void> {
  const resolved = resolveBundleOptions(options);
  await build(entries, resolved);

  if (!resolved.watch) return;

  console.log("Watching src for asset changes...");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const watcher = Deno.watchFs("src");
  for await (const event of watcher) {
    if (event.kind === "access") continue;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        console.log("Rebuilding assets...");
        await build(entries, resolved);
      } catch (error) {
        console.error("Build failed:", error);
      }
    }, 100);
  }
}
