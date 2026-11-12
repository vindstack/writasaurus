# Writasaurus

Writasaurus is a local-first manuscript editor built with Astro and Vue. The marketing site,
editor, and optional account pages live in `apps/writasaurus/`. Manuscripts stay in a folder on
your device; an account is not required to write.

## Using the editor

Open `/editor` in a supported Chromium-based browser on HTTPS or localhost. Choose a project
folder or create one inside a folder you select. The browser may ask you to grant access again
after a restart. Unsupported browsers cannot open the editor's project folders.

Projects contain numbered EPUB drafts (`draft_1.epub`, `draft_2.epub`, and so on), `Outline.md`,
and `settings.json` with project goals and writing history. Existing Writasaurus desktop project
folders use the same format. Save As exports an EPUB copy without changing the open project.
Back up the entire project folder to preserve drafts, outline, and settings.

Editor preferences are stored in the browser, separately from project files. Preferences from the
former desktop app do not transfer automatically. Browser storage and file access permissions can
be cleared by the user or browser, so they are not a substitute for backups.

The editor can be installed as a progressive web app. After the initial online visit and offline
setup, editor features work without a network connection. Account sign-in and email preferences
require a connection. Manually clearing browser site data removes the offline cache and saved
permissions.

Outline template guidance is informed by the
[three-act structure](https://en.wikipedia.org/wiki/Three-act_structure),
[Save the Cat beat sheet](https://savethecat.com/beat-sheets),
[Hero's Journey](https://en.wikipedia.org/wiki/Hero%27s_journey), and Randy Ingermanson's
[Snowflake Method](https://www.advancedfictionwriting.com/articles/snowflake-method/). The
four-act template is a flexible midpoint-split adaptation, not a claim that there is one
canonical four-act structure. The guidance is included in the outline as editable text.

## Development

Use Node.js 24 or newer and pnpm 9.12. Install dependencies and the Chromium browser used by tests:

```sh
pnpm install
pnpm exec playwright install chromium
pnpm dev                 # http://localhost:8000
pnpm build               # Cloudflare production build
pnpm test                # build and run unit, API and browser tests
pnpm check               # formatting, lint, types and tests
```

`packages/fs/` wraps browser filesystem access, and `packages/shared/` contains shared UI and
utilities. The editor uses browser-side filesystem operations, never server-side manuscript file
APIs. Regenerate the local thesaurus index with
`pnpm --filter @writasaurus/app build:wordnet <unpacked-wordnet> <output>`.

Use `pnpm lint`, `pnpm format`, and `pnpm format:check` for the workspace. Astro files use the
Astro editor formatter. Install the recommended Astro, Vue, and Oxc VS Code extensions or their
Zed equivalents.

## Cloudflare deployment and accounts

The app deploys as an Astro Cloudflare Worker. Cloudflare D1 stores account sign-in codes, sessions,
and email preferences; project files are not uploaded to Cloudflare. Account sign-in uses Resend
for one-time email codes. Configure `SESSION_SECRET` (at least 32 cryptographically random
characters), `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `PUBLIC_SITE_URL` for the deployed
environment. Keep secrets in Wrangler secrets, not source control. Refer to `.env.example` and
`apps/writasaurus/.dev.vars.example` for local configuration.

The existing D1 binding and migration history remain in `apps/writasaurus/wrangler.jsonc` and
`apps/writasaurus/migrations/`. Historical payment tables are not deleted by this migration.
For local Worker development, apply local migrations and configure `.dev.vars` before starting
the Worker:

```sh
pnpm --filter @writasaurus/app db:migrate:local
pnpm --filter @writasaurus/app worker:dev
```

Apply migrations to the configured remote database and deploy with:

```sh
pnpm --filter @writasaurus/app db:migrate:remote
pnpm deploy
```

Configure the verified Resend sender and the site's public URL for the deployed domain. Local
development sign-in messages are logged rather than sent; treat these logs as sensitive.
