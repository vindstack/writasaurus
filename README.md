# Writasaurus

A local-first manuscript editor built with Astro, Vue, and Deno. Desktop and website code are
separate applications in one Deno workspace.

## Applications

- `apps/desktop/` contains the editor, native launchers, and desktop tests.
- `apps/website/` contains the marketing site, customer account, checkout, administration pages, and
  server APIs.
- `packages/shared/` contains release, licensing-token, and private R2 utilities.

## Development

Use Deno 2:

```sh
deno task dev                 # website at http://localhost:8000
deno task desktop:dev         # desktop app in a native window
deno task build               # build both applications
deno task desktop             # package desktop app for this platform
deno task test                # build and run unit and Playwright tests
deno task check               # format, lint, types, and tests
```

To exercise checkout without Stripe, run the website with `PAYMENT_PROVIDER=mock deno task dev`.
Mock purchases are available only outside Deno Deploy; email delivery still requires Resend
credentials. Mock purchases persist in memory for the life of the server process.

## Website deployment

The website runs on Deno Deploy and requires PostgreSQL. Apply migrations before deployment:

```sh
deno task db:migrate
```

Configure the website's environment/secret store with:

- `DATABASE_URL`
- `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, and `STRIPE_WEBHOOK_SECRET`
- `RESEND_API_KEY` and `RESEND_FROM_EMAIL`
- `PUBLIC_SITE_URL` and `ADMIN_EMAIL`
- `SESSION_SECRET`, `LICENSE_ENCRYPTION_KEY`, `LICENSE_SIGNING_PRIVATE_KEY`
- `WRITASAURUS_R2_ACCOUNT_ID`, `WRITASAURUS_R2_ACCESS_KEY_ID`, `WRITASAURUS_R2_SECRET_ACCESS_KEY`,
  and `WRITASAURUS_R2_BUCKET`

Generate signing and encryption secrets locally with `deno task license:secrets`. Keep the private
signing key, encryption key, session secret, Stripe credentials, and R2 credentials only in a secret
manager; never commit them. Configure Stripe Checkout for one-time payment and create a webhook for
`checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`, and
`charge.dispute.created`. Set the matching webhook signing secret in `STRIPE_WEBHOOK_SECRET`.
Configure Resend with a verified sending domain.

### Local PostgreSQL

Install Docker Compose, copy `.env.example` to `.env`, then start the local database and apply its
schema:

```sh
deno task db:dev:up
deno task db:migrate
deno --env-file=.env task --cwd apps/website dev
```

The local database credentials in `.env.example` are only for development. The Compose service
stores data in a persistent Docker volume; stop it with `deno task db:dev:down`. Use separate
credentials and a separate database for staging or production.

The website uses passwordless email codes for customer accounts and for the single configured
administrator. The administrator can search purchases, revoke or restore eligible licenses, reset
device activations, and inspect device activity. Refunds requested during the first seven days are
submitted to Stripe; successful refunds revoke the license. A restored license cannot be one that
has been refunded or disputed.

## Desktop licensing

The desktop app requires a license key on first launch. A purchase supports two device activations.
It stores a signed, device-bound token locally, refreshes it on launch while online, and can operate
offline until the token expires after 30 days. Revocation therefore takes effect on the next online
refresh or when the current offline token expires; no client-side licensing scheme can prevent a
determined owner of a desktop computer from modifying their local copy.

For desktop builds, provide the public build-time variables `PUBLIC_LICENSE_API_URL` and
`PUBLIC_LICENSE_SIGNING_PUBLIC_KEY`. The public key must match the private Ed25519 key held by the
website. These public values are embedded in the desktop build and are not secrets. Generate the
signing pair and other application secrets with `deno task license:secrets`; copy
`LICENSE_SIGNING_PRIVATE_KEY` to the website's secret configuration and
`PUBLIC_LICENSE_SIGNING_PUBLIC_KEY` to the desktop build environment.

## Public desktop downloads

Create a Cloudflare R2 bucket for downloadable release artifacts and expose it through a public
HTTPS custom domain. For local publishing, copy `.env.example` to `.env` and set the R2 account ID,
access key ID, secret access key, bucket name, and the public base URL for that domain. Keep R2
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

The marketing page reads `latest.json` and presents direct downloads for Linux, macOS, and Windows.
The account's authenticated download endpoint remains available and checks for an active paid
license before returning a short-lived signed R2 URL.

## Data and security

Manuscripts remain on the user's device. The website stores the purchase email, a hash of each
license key, an encrypted copy for email recovery, activations, sign-in and refund state, and
administrative audit events. Device identifiers are stored as one-way hashes. PostgreSQL backups,
access, retention, tax handling, consumer disclosures, and final license terms must be reviewed
before a paid launch. The plain-language agreement in the website is a product draft, not legal
advice.
