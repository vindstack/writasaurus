# Writasaurus

A local-first manuscript editor built with Astro, Vue, and Deno. Desktop and website code are
separate applications in one Deno workspace.

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

Use Deno 2:

```sh
deno task dev:website         # website at http://localhost:8000
deno task dev:desktop         # desktop app in a native window
deno task build:website       # build the website
deno task build:desktop       # build the desktop app
deno task desktop             # package desktop app for this platform
deno task test                # build and run unit and Playwright tests
deno task check               # format, lint, types, and tests
```

To exercise donations without Stripe, run the website with
`PAYMENT_PROVIDER=mock deno task dev:website`. Mock donations are available only outside Deno
Deploy; local sign-in messages are written to `apps/website/.data/emails.jsonl` instead of being
sent through Resend. The log is ignored by Git and may contain passcodes.

## Website deployment

The website runs on Deno Deploy and requires PostgreSQL. To start a new database from the current
schema, apply the initial migration:

```sh
deno task db:migrate
```

`deno task db:reset` is destructive: it drops the existing Writasaurus database tables and applies
the current initial schema. Use it only when intentionally starting over with all database data
deleted.

Configure the website's environment/secret store with:

- `DATABASE_URL`
- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`
- `RESEND_API_KEY` and `RESEND_FROM_EMAIL`
- `PUBLIC_SITE_URL` and `SESSION_SECRET`

Configure Stripe Checkout for one-time payments and a webhook for `checkout.session.completed`,
`checkout.session.async_payment_succeeded`, `charge.refunded`, and `charge.dispute.created`. Set its
signing secret in `STRIPE_WEBHOOK_SECRET`. Configure Resend with a verified sending domain. Passcode
emails are sent for passwordless account sign-in; marketing email preference does not suppress them.

### Local PostgreSQL

Install Docker Compose, copy `.env.example` to `.env`, then start the local database and apply its
schema:

```sh
deno task db:dev:up
deno task db:migrate
deno task dev:website
```

To discard local data and recreate the current schema, run `deno task db:reset`. The local database
credentials in `.env.example` are only for development. The Compose service stores data in a
persistent Docker volume; stop it with `deno task db:dev:down`. Use separate credentials and a
separate database for staging or production.

## Free desktop downloads and donations

The desktop app is free to download and use. The website's download flow asks for a platform and
optionally an email address, then offers free, a one-time $10 or $25 USD donation, or a custom
one-time USD amount. Custom amounts must meet Stripe's minimum; Writasaurus sets no additional upper
cap. An email is required for a donation. Downloads do not require an account or payment.

Anyone who provides an email has an account, whether or not they donate. Accounts use passwordless
email codes to show any donation receipts and manage the marketing email preference. The marketing
checkbox is checked by default; account holders can uncheck it. There is no download history.
Passcode emails are necessary for sign-in and are not affected by the marketing preference.

### Public desktop releases

Create a Cloudflare R2 bucket for downloadable release artifacts and expose it through a public
HTTPS custom domain. For local publishing, copy `.env.example` to `.env` and set the R2 account ID,
access key ID, secret access key, bucket name, and public base URL for that domain. Keep R2
credentials local; they are only used by the release command. Build and publish an immutable
semantic version:

```sh
deno task release:desktop 1.2.3
```

The release task builds the Linux AppImage, Apple Silicon macOS archive, and Windows MSI; validates
the package signatures; generates a `SHA256SUMS.txt`; and uploads the artifacts and versioned
metadata to R2. Uploads are verified and version paths cannot be overwritten. The task writes
`apps/website/public/releases/v<version>/release.json` and updates `apps/website/public/latest.json`
with public artifact URLs. Review and deploy the website to publish the latest release links. Use
`--dry-run` to build, validate, and preview the release metadata without reading R2 credentials or
uploading. Existing immutable version paths cannot be republished.

The website reads the release manifest and redirects download requests directly to the public
artifact URL. No purchase, account, or license check is involved.

## Data and security

Manuscripts remain on the user's device. The website stores donation amounts and processor IDs,
donor email addresses, Stripe receipt URLs, passwordless sign-in state, and marketing email
preferences. Payment details are handled by Stripe; the website does not store card numbers.
PostgreSQL backups, access, retention, tax handling, marketing consent, and donation terms should be
reviewed before launch. The website terms are a product draft, not legal advice.
