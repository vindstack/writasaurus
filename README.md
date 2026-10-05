# Writasaurus

A local-first manuscript editor built with [Deno Fresh](https://fresh.deno.dev) (Vite), Preact, and
`@preact/signals`. Styling uses CSS Modules. Deno Desktop packages it in a native webview.

## Run

```sh
deno task dev
```

Open <http://localhost:8000>.

Production:

```sh
deno task build
deno task start
```

Desktop:

```sh
deno task desktop:dev   # build and run with HMR for server handlers
deno task desktop       # package for the current platform into desktop/
```

Check formatting, linting, types, and tests (unit and Playwright browser tests):

```sh
deno task check
```

## Structure

- `main.ts` creates the Fresh app; `desktop.ts` is the Deno Desktop entry.
- `routes/` contains pages, `_app.tsx`, `_middleware.ts` (CSRF), and `api/editor/*` native file
  APIs.
- `islands/` contains the only hydrated components; static pages render none.
- `components/` contains Preact components with colocated `.module.css` files.
- `lib/` contains framework-agnostic logic (EPUB, Markdown, settings, storage, history, and the
  signal-based `lib/editor/`).
- `assets/styles.css` is the single global stylesheet; `static/` is served unchanged.

## Editor

The editor is the root route (`/`). It stores the active manuscript in localStorage, remembers
granted file handles in IndexedDB, and integrates with native desktop file dialogs or the File
System Access API when available. It supports a Save button, Ctrl/Cmd+S saving, multiple chapters,
Markdown import/export, EPUB export, drag-and-drop opening, and live word, page, and character
counts. Browsers without direct file access use normal uploads and downloads. On Desktop, local
writing assistance (Harper) highlights spelling and grammar issues.

## Secure defaults

Unsafe HTTP methods are same-origin only. Scripts and styles load from external files (no inline
scripts or styles). Desktop and server tasks grant only the network, environment, and file
permissions the app needs.
