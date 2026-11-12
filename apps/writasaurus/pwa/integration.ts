import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";
import { OFFLINE_EDITOR_PAGES } from "./public-pages.ts";

const assetsDir = fileURLToPath(new URL("./assets/", import.meta.url));
const workerTemplate = new URL("./service-worker.js", import.meta.url);
const synonymsSource = new URL("../public/data/oewn-2025-synonyms.json", import.meta.url);
const synonymsPath = "data/oewn-2025-synonyms.json";
const generatedNames = [
  "writasaurus-editor-sw.js",
  "writasaurus-editor.webmanifest",
  "writasaurus-editor-icon-192.png",
  "writasaurus-editor-icon-512.png",
];

async function filesIn(root: string, dir = root): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return filesIn(root, path);
      return entry.isFile() ? [relative(root, path)] : [];
    }),
  );
  return files.flat();
}

function isPublicAsset(path: string): boolean {
  const parts = path.split(sep);
  return (
    !parts.some((part) => part.startsWith(".")) &&
    !parts.some((part) =>
      ["api", "account", "_worker.js", "_headers", "_redirects", "_routes.json"].includes(
        part.toLowerCase(),
      ),
    ) &&
    !/\.html?$/i.test(path)
  );
}

/** Add to the app's Astro integrations to emit its offline assets. */
export function editorPwa(): AstroIntegration {
  return {
    name: "writasaurus-editor-pwa",
    hooks: {
      "astro:config:setup": ({ updateConfig, command }) => {
        updateConfig({
          vite: { define: { __WRITASAURUS_EDITOR_PWA__: JSON.stringify(command === "build") } },
        });
      },
      "astro:build:done": async ({ dir }) => {
        const clientDir = fileURLToPath(dir);
        const existing = await filesIn(clientDir);
        for (const name of generatedNames) {
          if (existing.includes(name)) throw new Error(`PWA output conflicts with ${name}`);
        }
        for (const name of generatedNames.slice(1)) {
          await writeFile(join(clientDir, name), await readFile(join(assetsDir, name)));
        }
        const synonyms = await readFile(synonymsSource);
        const synonymsDestination = join(clientDir, ...synonymsPath.split("/"));
        if (existing.includes(synonymsPath.split("/").join(sep))) {
          if (!synonyms.equals(await readFile(synonymsDestination))) {
            throw new Error(`PWA output conflicts with ${synonymsPath}`);
          }
        } else {
          await mkdir(join(clientDir, "data"), { recursive: true });
          await writeFile(synonymsDestination, synonyms);
          existing.push(synonymsPath.split("/").join(sep));
        }
        const files = [...existing.filter(isPublicAsset), ...generatedNames.slice(1)].sort();
        const assets = await Promise.all(
          files.map(async (path) => [
            `/${path.split(sep).map(encodeURIComponent).join("/")}`,
            createHash("sha256")
              .update(await readFile(join(clientDir, path)))
              .digest("hex"),
          ]),
        );
        const template = await readFile(workerTemplate, "utf8");
        const config = JSON.stringify({
          revision: randomUUID(),
          assets,
          pages: OFFLINE_EDITOR_PAGES,
        });
        await writeFile(
          join(clientDir, generatedNames[0]),
          template.replace('"__WRITASAURUS_PWA_CONFIG__"', config),
        );
      },
    },
  };
}
