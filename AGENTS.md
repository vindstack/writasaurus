# Copilot instructions

## Commands

This is a Node.js 24 project built on Astro and Vue, with an Electron desktop application.
Use pnpm tasks and workspace dependencies, not npm or Deno commands.

- `pnpm dev:website` starts the website Astro server at `http://localhost:8000` with HMR.
- `pnpm build:website` builds the website into `apps/website/dist/`.
- `pnpm build:desktop` builds the desktop app and Electron main process.
- `pnpm dev:desktop` runs Astro's development server inside Electron with HMR.
- `pnpm desktop` packages the native application for the current platform into `desktop/`.
- `pnpm check` runs Oxfmt checks, Oxlint, type checks, and the full test suite.

Only run tests after making changes; never run tests preemptively before changes have been made.
Always run tests using `pnpm test` (or a package-filtered `pnpm test`). It builds first and includes Playwright browser
tests.

Keep Electron renderers sandboxed with Node integration disabled and context isolation enabled.
Native dialogs and exit behavior are injected through `setPlatform` in the main process.

Oxfmt uses 100-column lines, semicolons, and double quotes. Astro files use the Astro editor formatter.

Never commit code; leave committing to the user.

## Architecture

Writasaurus is a local-first manuscript editor with an Astro app and two launch modes:

- Each app's `astro.config.ts` configures Astro SSR with the Node adapter and Vue integration.
  The website uses standalone mode. Desktop uses middleware mode; `app.ts` and `server.ts` host
  it in Node for tests, while `main.ts` launches the server and Electron window in production/dev.
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
- The editor normalizes content into block elements so highlights paint consistently across browsers.

## Conventions

- Keep component styles local: use `<style>` in Astro components and `<style scoped>` in Vue SFCs.
  No Tailwind, inline styles, or `style` attributes. Add global rules to `src/styles/global.css`
  only for tokens, reset, and document defaults.
- Prefer `data-*` attributes (not CSS class names) as test hooks because component styles are
  implementation details.
- Use explicit `.ts`/`.vue` extensions for local imports and declare dependencies in each workspace's
  `package.json`. Node 24 runs utility TypeScript scripts directly.
- `src/middleware.ts` enforces same-origin CSRF checks based on `Sec-Fetch-Site` and `Origin`, and
  attaches the CSP nonce. Client `fetch` calls need no manual headers. Browser POST tests should
  send `origin: "http://localhost"`.
- API tests exercise the built app through `tests/helpers.ts`; browser tests live in
  `tests/browser/` and use Playwright.
- Preserve browser/Desktop parity when changing open, save, close, or restore behavior.
