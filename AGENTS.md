# Copilot instructions

## Commands

This is a Deno 2 project built on Astro and Vue. Use Deno tasks and import-map dependencies; never
use Node.js or npm commands.

- `deno task dev` starts Astro at `http://localhost:8000` with HMR.
- `deno task build` builds the app into `dist/` (generated, gitignored).
- `deno task start` serves the generated Astro server build.
- `deno task desktop:dev` runs Astro's development server in a Deno Desktop window.
- `deno task desktop` builds the native application for the current platform into `desktop/`.
- `deno task check` runs formatting checks, linting, type checks, and the full test suite.

Only run tests after making changes; never run tests preemptively before changes have been made.
Always run tests using `deno task test` only. It builds first and includes the Playwright browser
tests.

When granting permissions, specify the minimal `--allow-*` flags needed rather than defaulting to
`-A`. Use `deno <subcommand> --help` to verify flags and `deno doc <specifier>` to inspect library
APIs. Always check `deno desktop --help` before searching the web for Deno Desktop help.

Formatting is configured for 100-column lines, semicolons, and double quotes.

Never commit code; leave committing to the user.

## Architecture

Writasaurus is a local-first manuscript editor with an Astro app and two launch modes:

- `astro.config.ts` configures Astro SSR with the Deno adapter and Vue integration. `app.ts` serves
  the generated server and static assets; `server.ts` is the web entry point. `desktop.ts` and
  `desktop.dev.ts` launch production and development Desktop windows with explicit window sizing.
- `src/pages/` contains Astro pages and JSON APIs under `src/pages/api/editor/`. `src/layouts/`
  provides the shared document shell, and `src/middleware.ts` enforces same-origin requests and a
  nonce-based CSP.
- `src/components/` contains Astro components and Vue SFCs with colocated CSS Modules. Interactive
  Vue components are hydrated by Astro only where needed.
- `src/lib/` contains editor, EPUB, settings, storage, and platform logic.
- `src/styles/global.css` is the global stylesheet; files in `public/` are served as-is.
- `lib/editor/state.ts` uses `@preact/signals` for shared application state; Vue SFCs bridge signal
  values into Vue reactivity. Do not introduce Preact UI components.

Editor behavior notes:

- The writing area is an uncontrolled contenteditable. Mount content imperatively only when the
  active chapter changes so the caret never moves; do not make it a controlled component.
- Manuscript session state persists in `sessionStorage` to survive same-tab reloads. EPUBs are the
  manuscript file format; the Desktop app uses `/api/editor/*` routes for native file operations.
- Deno Desktop's webview is WebKitGTK; `::highlight()` does not paint on text in anonymous block
  boxes, so the editor normalizes content into block elements.

## Conventions

- Keep component styles local: use `<style>` in Astro components and `<style scoped>` in Vue SFCs.
  No Tailwind, inline styles, or `style` attributes. Add global rules to `src/styles/global.css`
  only for tokens, reset, and document defaults.
- Prefer `data-*` attributes (not CSS class names) as test hooks because component styles are
  implementation details.
- Use explicit `.ts`/`.vue` extensions for local imports and import-map aliases from `deno.json`.
- `src/middleware.ts` enforces same-origin CSRF checks based on `Sec-Fetch-Site` and `Origin`, and
  attaches the CSP nonce. Client `fetch` calls need no manual headers. Browser POST tests should
  send `origin: "http://localhost"`.
- API tests exercise the built app through `tests/helpers.ts`; browser tests live in
  `tests/browser/` and use Playwright.
- Preserve browser/Desktop parity when changing open, save, close, or restore behavior.
