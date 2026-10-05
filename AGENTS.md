# Copilot instructions

## Commands

This is a Deno 2 project built on Deno Fresh 2 (Vite) and Preact. Use Deno tasks and JSR imports;
never use Node.js or npm commands.

- `deno task dev` starts the Vite dev server at `http://localhost:8000` with HMR.
- `deno task build` builds the app into `_fresh/` (generated, gitignored).
- `deno task start` serves an existing production build (`_fresh/server.js`).
- `deno task desktop:dev` builds and runs the Deno Desktop app with HMR for server handler changes.
- `deno task desktop` builds the native application for the current platform into `desktop/`.
- `deno task check` runs formatting checks, linting, type checks, and the full test suite.

Only run tests after making changes; never run tests preemptively before changes have been made.
Always run tests using the `deno task test` command only. It builds first (tests run against
`_fresh/server.js`) and includes the Playwright browser tests.

When granting permissions, specify the minimal `--allow-*` flags needed rather than defaulting to
`-A`. Use `deno <subcommand> --help` to verify flags and `deno doc <specifier>` to inspect library
APIs. Always check `deno desktop --help` before searching the web for Deno Desktop help.

Formatting is configured for 100-column lines, semicolons, and double quotes.

Never commit code; leave committing to the user.

## Architecture

Writasaurus is a local-first manuscript editor with one Fresh app and two launch modes:

- `main.ts` defines the Fresh `App` (static files, `_middleware.ts`, `fsRoutes()`). `desktop.ts` and
  `desktop.dev.ts` are the Desktop entries (they set the 1000x700 frameless window, which
  auto-detection cannot). `lib/platform.ts` exposes the platform (desktop flag/exit) that tests can
  override; Desktop is detected from `DENO_SERVE_ADDRESS`, or `WRITASAURUS_DESKTOP` (set by
  `desktop.dev.ts` for its Vite child process).
- `routes/` holds file-based routes: pages (`*.tsx` with `define.page`), `_app.tsx` (layout),
  `main.ts` registers Fresh's `csrf()` middleware (same-origin only for unsafe methods);
  `_middleware.ts` sets the CSP, and JSON APIs under `routes/api/editor/*.ts` (native dialogs and
  file I/O on Desktop).
- `islands/` holds the only interactive (hydrated) components: `EditorApp`, `SettingsForm`,
  `WelcomeActions`, `AboutCounter`, `PageEffects`. Pages that need no interactivity render no
  islands.
- `components/` holds Preact components, each with a colocated `.module.css`. `components/editor/`
  holds the editor UI pieces composed by `islands/EditorApp.tsx`.
- `lib/` holds framework-agnostic logic: EPUB/Markdown, settings, storage, history, and
  `lib/editor/` (signal-based editor state, contenteditable surface helpers, file I/O, commands,
  Harper-based writing assistance).
- `assets/styles.css` is the only global stylesheet (reset, tokens, document typography, view
  transitions, `::highlight()` rules). `static/` is served as-is.

Editor behavior notes:

- State is `@preact/signals` in `lib/editor/state.ts`; use signals rather than stores/event buses.
- The writing area is an uncontrolled contenteditable; content is mounted imperatively only when the
  active chapter changes so the caret never moves. Do not make it a controlled component.
- Manuscripts persist in `localStorage`; browser file handles persist in IndexedDB. Browsers use the
  File System Access API with upload/download fallbacks; Desktop uses `/api/editor/*` routes.
- Markdown files use JSON frontmatter and `<!-- chapter: ... -->` separators.
- Deno Desktop's webview is WebKitGTK; `::highlight()` does not paint on text in anonymous block
  boxes, so the editor normalizes content into block elements.

## Conventions

- Styling uses CSS Modules only (`Foo.module.css` beside `Foo.tsx`). No Tailwind, no inline styles,
  no `style` attributes. Add global rules to `assets/styles.css` only for tokens/reset/document
  defaults.
- Prefer `data-*` attributes (not CSS class names) as test hooks, since module class names are
  hashed.
- Fresh only links the CSS of a route/island entry. `vite.config.ts` pins `lib/editor/` shared
  modules into an `editor-lib` chunk so the `EditorApp` island entry owns its CSS; if CSS stops
  loading after restructuring imports, check the island's entry in
  `_fresh/client/.vite/manifest.json`.
- Use explicit `.ts`/`.tsx` extensions for local imports and the import map aliases in `deno.json`.
- CSRF uses Fresh's built-in `csrf()` (checks `Sec-Fetch-Site` and `Origin`; requests with neither
  header are non-browser clients and pass). Client `fetch` calls need no manual headers. Tests that
  simulate a browser POST should send `origin: "http://localhost"`; `tests/csrf_test.ts` covers web
  and Desktop.
- Test routes without a server using `createTestApp` from `tests/helpers.ts` and `app.request()`.
  Browser tests live in `tests/browser/` and use Playwright.
- Preserve browser/Desktop parity when changing open, save, close, or restore behavior.
