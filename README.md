# Writasaurus

A local-first manuscript editor built with Astro, Vue, and Node.js. Desktop and website code are
separate applications in one pnpm workspace. Electron provides native desktop windows and dialogs.

## Applications

- `apps/desktop/` contains the editor, native launchers, and desktop tests.
- `apps/website/` contains the marketing site, optional donation flow, accounts, and server APIs.
- `packages/shared/` contains release, settings, UI, path, and private R2 utilities.

Desktop project folders store manuscript versions as `draft_1.epub`, `draft_2.epub`, and so on;
`settings.json` keeps their numbered draft list, project-specific manuscript and daily word goals,
and a rolling 30-day writing history. The Goals page reports writing and goal-completion streaks and
estimates manuscript completion from that history. The editor opens the latest draft by default and
can create a blank draft or copy any earlier one. A Markdown outline is saved as `Outline.md` beside
the drafts. Outline mode includes replaceable templates and autosaves changes to the project folder.

Outline template guidance is informed by the
[three-act structure](https://en.wikipedia.org/wiki/Three-act_structure),
[Save the Cat beat sheet](https://savethecat.com/beat-sheets), the
[Hero's Journey](https://en.wikipedia.org/wiki/Hero%27s_journey), and Randy Ingermanson's
[Snowflake Method](https://www.advancedfictionwriting.com/articles/snowflake-method/). The four-act
template is a flexible midpoint-split adaptation, not a claim that there is one canonical four-act
structure. Its explanations and the other templates' section notes are included in the outline as
editable guidance.

## Development

Use Node.js 24 or newer and pnpm 9.12 (pinned in `package.json`). Run `corepack enable` if needed,
then install dependencies and the browser used by the tests:

```sh
pnpm install
pnpm exec playwright install chromium
pnpm dev:website         # website at http://localhost:8000
pnpm dev:desktop         # Electron window with Astro HMR
pnpm build:website       # build the website
pnpm build:desktop       # build the editor and Electron main process
pnpm desktop             # package Electron for this platform in desktop/
pnpm test                # build and run Vitest unit/API and Playwright browser tests
pnpm check               # format, lint, types, and tests
```

To exercise donations without Stripe, run the website with
`PAYMENT_PROVIDER=mock pnpm dev:website`. Mock donations are unavailable when `NODE_ENV=production`;
local sign-in messages are written to `apps/website/.data/emails.jsonl` instead of being
sent through Resend. The log is ignored by Git and may contain passcodes.

Oxlint and Oxfmt are required workspace dependencies, not optional global tools. Use `pnpm lint`,
`pnpm format`, and `pnpm format:check`. Oxfmt formats supported source files (including Vue);
Astro files retain the Astro extension's formatter because Oxfmt does not yet format `.astro`.
Install the recommended Astro, Vue, and Oxc VS Code extensions, or Astro, Vue, and Oxlint support
in Zed. Both editor configurations disable Deno and use workspace TypeScript and Oxfmt.
Native file dialogs require the Electron launcher; the standalone editor HTTP server is for testing.

Electron uses a custom draggable title bar with minimize, maximize/restore, and close controls on all
desktop pages. Window actions use a sandbox-compatible preload bridge restricted to the trusted main
frame. The title bar stays hidden when the editor is opened in an ordinary browser.

## Website deployment

The website runs as an Astro Cloudflare Worker and uses Cloudflare D1 for website storage. The D1
database starts empty; existing PostgreSQL data is intentionally not migrated.
Deployments are manual and run locally through Wrangler, which bundles the Worker and uploads its
server code and static assets.

For local development, apply the schema to Wrangler's local D1 database, configure local runtime
values, then start Astro:

```sh
pnpm --filter @writasaurus/website db:migrate:local
cp apps/website/.dev.vars.example apps/website/.dev.vars
pnpm dev:website
```

Local D1 data is stored under the ignored `.wrangler/` directory. Edit local runtime values in
`apps/website/.dev.vars` (do not commit this file); set the same runtime values for the deployed
Worker in Cloudflare's variables/secrets.
Required values are `SESSION_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `PUBLIC_SITE_URL`, and
`WRITASAURUS_R2_PUBLIC_BASE_URL`. Keep credentials and signing keys in Wrangler secrets; configure
the public URLs as non-secret variables. `PAYMENT_PROVIDER` should be `stripe`.

Before the first deployment, authenticate Wrangler and provision the remote D1 database:

```sh
pnpm --filter @writasaurus/website exec wrangler login
pnpm --filter @writasaurus/website db:create
```

`db:create` provisions the remote database and writes its ID into
[`apps/website/wrangler.jsonc`](./apps/website/wrangler.jsonc). Set secrets for the deployed Worker
with Wrangler, for example:

```sh
pnpm --filter @writasaurus/website exec wrangler secret put SESSION_SECRET
pnpm --filter @writasaurus/website exec wrangler secret put STRIPE_SECRET_KEY
pnpm --filter @writasaurus/website exec wrangler secret put STRIPE_WEBHOOK_SECRET
pnpm --filter @writasaurus/website exec wrangler secret put RESEND_API_KEY
```

To apply schema changes to D1 and deploy manually:

```sh
pnpm --filter @writasaurus/website db:migrate:remote
pnpm deploy:website
```

`pnpm deploy:website` builds the website locally and runs `wrangler deploy`; it does not set up a
GitHub Actions deployment. Configure Stripe Checkout for one-time payments and a webhook for
`checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`, and
`charge.dispute.created`. Configure Resend with a verified sending domain. Passcode emails are sent
for passwordless account sign-in; marketing email preference does not suppress them. Wrangler prints
the deployed `workers.dev` URL; attach the production domain to the Worker through Cloudflare when
ready.

To exercise the local Worker runtime, run `pnpm --filter @writasaurus/website worker:dev`.

## Free desktop downloads and donations

The desktop app is free to download and use. The website's download flow asks for a platform and
optionally an email address, then offers free, a one-time $10 or $25 USD donation, or a custom
one-time USD amount. Custom amounts must meet Stripe's minimum; Writasaurus sets no additional upper
cap. An email is required for a donation. Downloads do not require an account or payment. The
website requires explicit agreement to the terms and conditions before starting a download or
donation checkout. The checkbox is unchecked by default and validated by both the browser and
server.

Anyone who provides an email has an account, whether or not they donate. Accounts use passwordless
email codes to show any donation receipts and manage the marketing email preference. The marketing
checkbox is checked by default; account holders can uncheck it. There is no download history.
Passcode emails are necessary for sign-in and are not affected by the marketing preference.

### Public desktop releases

Create a Cloudflare R2 bucket for downloadable release artifacts and expose it through a public
HTTPS custom domain (or enable its public `r2.dev` URL for development). Do not use the private
`r2.cloudflarestorage.com` S3 API endpoint as `WRITASAURUS_R2_PUBLIC_BASE_URL`. For local
publishing, copy `.env.example` to `.env` and set the R2 account ID, access key ID, secret access
key, bucket name, and public base URL for that domain. Keep R2 credentials local; they are only used
by the publishing command. Electron packages must be built on their matching native OS:

```sh
pnpm release:desktop 1.2.3 --build-platform linux    # Linux x64 runner
pnpm release:desktop 1.2.3 --build-platform macos    # macOS Apple Silicon runner
pnpm release:desktop 1.2.3 --build-platform windows  # Windows x64 runner
```

Combine the outputs under `desktop/linux/`, `desktop/macos/`, and `desktop/windows/` on the publishing
machine, then preview and publish:

```sh
pnpm release:desktop 1.2.3 --skip-build --dry-run
pnpm release:desktop 1.2.3 --skip-build
```

CI checks build all three formats on native runners and upload them as workflow artifacts.
The publishing task validates the Linux AppImage, Apple Silicon macOS archive, and Windows MSI;
generates a `SHA256SUMS.txt`; and uploads the artifacts and versioned
metadata to R2. Uploads are verified and version paths cannot be overwritten. After all versioned
objects are verified, the task updates `latest.json` at the bucket root with the release manifest
and public artifact URLs. Downloads use the new release immediately, without a website deployment.
The latest pointer is revalidated rather than cached, and conditional writes prevent concurrent
releases from overwriting a newer pointer. Use `--skip-build --dry-run` to validate and preview the
release metadata without reading R2 credentials or uploading. Existing immutable version paths
cannot be republished.

The website fetches `latest.json` from `WRITASAURUS_R2_PUBLIC_BASE_URL` and redirects download
requests directly to the public artifact URL. No purchase, account, or license check is involved.
Release metadata is stored only in R2, not the website's public directory. Keep `PUBLIC_SITE_URL`
set to the website URL (`http://localhost:8000` for local development), not R2.

## Data and security

Manuscripts remain on the user's device. The website stores donation amounts and processor IDs,
donor email addresses, Stripe receipt URLs, passwordless sign-in state, and marketing email
preferences. Payment details are handled by Stripe; the website does not store card numbers.
D1 backups, access, retention, tax handling, marketing consent, and donation terms should be reviewed
before launch. The website terms are a product draft, not legal advice.
