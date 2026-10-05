# Writasaurus

A local-first manuscript editor built with [Astro](https://astro.build), Vue single-file components,
and Deno. Styling uses CSS Modules. Deno Desktop packages the server-rendered app in a native
webview.

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
deno task desktop:dev   # run Astro's dev server in a native window
deno task desktop       # package for the current platform into desktop/
```

Check formatting, linting, types, and unit and Playwright browser tests:

```sh
deno task check
```

## Structure

- `src/pages/` contains Astro pages and API routes; `src/layouts/` provides the shared document
  shell and `src/middleware.ts` enforces same-origin requests and the nonce-based CSP.
- `src/components/` contains Astro components, Vue SFCs, and colocated CSS Modules. Interactive Vue
  SFCs are hydrated by Astro only where needed.
- `src/lib/` contains editor, EPUB, Markdown, settings, storage, history, and platform logic. The
  editor uses signals for shared state and keeps its contenteditable surface uncontrolled.
- `src/styles/global.css` contains global styles. Files in `public/` are served unchanged.
- `astro.config.ts` configures Astro SSR with the Deno adapter; `app.ts`, `server.ts`, and
  `desktop.ts` connect the generated server to the web and native Desktop runtimes.

## Editor

The editor is the root route (`/`). It stores the active manuscript in localStorage, remembers
granted file handles in IndexedDB, and integrates with native desktop file dialogs or the File
System Access API when available. It supports a Save button, Ctrl/Cmd+S saving, multiple chapters,
Markdown import/export, EPUB export, drag-and-drop opening, and live word, page, and character
counts. Browsers without direct file access use normal uploads and downloads. On Desktop, local
writing assistance (Harper) highlights spelling and grammar issues.

## Secure defaults

Unsafe HTTP methods are same-origin only. The middleware applies a per-response nonce to scripts and
styles and sets a CSP without `unsafe-inline`. Desktop and server tasks grant only the permissions
the app needs.
