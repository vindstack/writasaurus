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

To exercise the Worker locally, apply the schema to Wrangler's local D1 database, configure local
runtime values, then start Wrangler's dev server:

```sh
pnpm --filter @writasaurus/website db:migrate:local
cp apps/website/.dev.vars.example apps/website/.dev.vars
pnpm --filter @writasaurus/website worker:dev
```

Local D1 and R2 data are stored under the ignored `.wrangler/` directory. Wrangler's local R2 bucket
starts empty; to test downloads locally, upload `latest.json` and the release objects to the local
bucket with `wrangler r2 object put ... --local`. Edit local Worker values in
`apps/website/.dev.vars` (do not commit this file); the ordinary Astro dev server instead reads the
root `.env`. Set the same runtime values for the deployed Worker in Cloudflare's variables/secrets.
Required values are `SESSION_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `PUBLIC_SITE_URL`. Keep credentials and signing keys in
Wrangler secrets; configure the public site URL as a non-secret variable. `PAYMENT_PROVIDER` is set
in Wrangler config.

Before the first deployment, authenticate Wrangler and provision the remote D1 database and R2
bucket (skip the bucket-create command if it already exists):

```sh
pnpm --filter @writasaurus/website exec wrangler login
pnpm --filter @writasaurus/website db:create
pnpm --filter @writasaurus/website exec wrangler r2 bucket create writasaurus-desktop
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

On Linux, browser-downloaded AppImages need the executable bit set before first launch, and AppImage
requires FUSE 2. For Ubuntu 24.04 or later, install `libfuse2t64`; older Ubuntu/Debian releases use
`libfuse2`. Then run:

```sh
chmod +x ~/Downloads/Writasaurus.AppImage
~/Downloads/Writasaurus.AppImage
```

Anyone who provides an email has an account, whether or not they donate. Accounts use passwordless
email codes to show any donation receipts and manage the marketing email preference. The marketing
checkbox is checked by default; account holders can uncheck it. There is no download history.
Passcode emails are necessary for sign-in and are not affected by the marketing preference.

### Private desktop releases

The website Worker reads desktop release files from the private `writasaurus-desktop` R2 bucket via
the `R2_DOWNLOAD_DESKTOP_BUCKET` binding. The bucket does not need public access or a public
download domain. The Worker streams version-validated files to browsers and supports byte ranges.
Ensure the binding's `bucket_name` in `apps/website/wrangler.jsonc` matches the bucket used by the
release publisher. For local publishing, copy `.env.example` to `.env` and set the R2 account ID,
access key ID, secret access key, and bucket name. Keep these credentials local; they are only used
by the publishing command. Each package must be built on its matching native OS. The command builds
and publishes one platform at a time:

```sh
pnpm release:desktop 1.2.3 --build-platform linux    # Run on Linux
pnpm release:desktop 1.2.3 --build-platform macos    # Run on Apple Silicon macOS
pnpm release:desktop 1.2.3 --build-platform windows  # Run on Windows x64
```

Each command builds and validates the selected package, uploads it and its checksums to R2, then
updates `latest.json`. Once the Worker has merged-manifest support, the website serves that platform
immediately; the other platforms keep their previous artifacts and versions until separately
published. Versions are tracked independently per platform. To preview without uploading, add
`--dry-run`; to publish an already-built package, add `--skip-build`:

```sh
pnpm release:desktop 1.2.3 --build-platform linux --dry-run
pnpm release:desktop 1.2.3 --build-platform linux --skip-build
```

Before the first independent platform publish, deploy the website Worker once so it understands the
merged manifest format:

```sh
pnpm deploy:website
```

Subsequent platform releases update `latest.json` and are available without another website deploy.

The publisher validates the selected package (Linux AppImage, Apple Silicon macOS archive, or Windows
MSI), generates checksums for the currently available platform builds, and uploads versioned
metadata. Uploads are verified and version paths cannot be overwritten. Updates merge with the
existing platform releases, so a Linux release does not require fresh macOS or Windows builds. The
release manifest uses same-origin Worker download routes rather than exposing R2 URLs. The latest
pointer is revalidated rather than cached, and conditional writes prevent concurrent releases from
silently overwriting each other. Dry runs do not read R2 credentials or make R2 requests.

The website reads `latest.json` and artifacts through its private R2 binding. Downloads are streamed
from the Worker, so the bucket itself remains private. No purchase, account, or license check is
involved. Release metadata is stored only in R2, not the website's public directory. Keep
`PUBLIC_SITE_URL` set to the website URL (`http://localhost:8000` for local development).

## Data and security

Manuscripts remain on the user's device. The website stores donation amounts and processor IDs,
donor email addresses, Stripe receipt URLs, passwordless sign-in state, and marketing email
preferences. Payment details are handled by Stripe; the website does not store card numbers.
D1 backups, access, retention, tax handling, marketing consent, and donation terms should be reviewed
before launch. The website terms are a product draft, not legal advice.
