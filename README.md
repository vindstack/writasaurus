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

## Website and Desktop

The website serves the Writasaurus marketing page at `/` and the public license agreement at
`/agreement`. Visitors must accept the agreement before the page reveals the current Linux, macOS,
and Windows downloads. The page reads release metadata from the website's deployed `/latest.json`
file. The agreement is a plain-language draft and has not been reviewed by a lawyer.

In Deno Desktop, `/` opens the editor. Editor-only pages and `/api/editor/*` return 404 outside
Desktop mode. The editor stores the active manuscript in localStorage, remembers granted file
handles in IndexedDB, and integrates with native desktop file dialogs or the File System Access API
when available. It supports a Save button, Ctrl/Cmd+S saving, multiple chapters, Markdown
import/export, EPUB export, drag-and-drop opening, and live word, page, and character counts. On
Desktop, local writing assistance (Harper) highlights spelling and grammar issues.

## Publishing Desktop releases

Create a dedicated Cloudflare R2 bucket for public release files using the **Standard** storage
class, and connect a public HTTPS custom domain to that bucket. Do not configure a lifecycle rule
that transitions objects to Infrequent Access. For local publishing, copy `.env.example` to `.env`
and fill in these values. `.env` is git-ignored, and the release task loads it automatically. Never
commit the R2 credentials:

```dotenv
WRITASAURUS_R2_ACCOUNT_ID=your Cloudflare account ID
WRITASAURUS_R2_ACCESS_KEY_ID=your R2 access key ID
WRITASAURUS_R2_SECRET_ACCESS_KEY=your R2 secret access key
WRITASAURUS_R2_BUCKET=your release bucket
WRITASAURUS_RELEASES_PUBLIC_URL=https://downloads.example.com
```

`WRITASAURUS_RELEASES_PUBLIC_URL` must be the HTTPS origin that serves the bucket keys directly.
Publish a semantic version locally:

```sh
deno task release:desktop 1.2.3
```

The command builds the web bundle, then explicitly cross-compiles an x86-64 Linux AppImage, an Apple
Silicon macOS application bundle, and an x86-64 Windows MSI. It archives the macOS bundle as a
`.tar.gz`, verifies the non-empty outputs, calculates SHA-256 checksums, and uploads to immutable
`releases/v<version>/` paths. It verifies uploaded sizes/checksum metadata before writing
`release.json`. Existing versions cannot be overwritten. The separate `release:latest` task updates
the website's `public/latest.json` pointer after a version is published. The macOS download must be
extracted before moving the app into Applications. A macOS build made on a non-macOS host is
unsigned; one made on macOS is ad-hoc signed by default. Neither is notarized, so Gatekeeper may
require users to approve it manually.

This workflow uses only R2's Standard storage class, S3-compatible API operations, public bucket
delivery, and Cloudflare edge caching—no Workers, Infrequent Access, or multipart-upload feature. It
requires a dedicated releases bucket and refuses new uploads if the currently listed objects plus
this release would exceed 10,000,000,000 bytes. This is a guard, not a billing guarantee: the free
10 GB-month storage and monthly Class A/B request quotas are shared across your Cloudflare account,
and this bucket check cannot see usage in other buckets, earlier daily storage peaks, or future
visitor traffic. High release/download traffic or other R2 usage can exceed the free quotas, so
monitor Cloudflare usage and set billing alerts. Public R2 downloads have no egress charge.

Preview the build and metadata without reading credentials or making R2 requests:

```sh
deno task release:desktop 1.2.3 --dry-run
```

Dry runs still build and checksum all three packages and write a metadata preview under
`desktop/release-dry-run/`. Deno Desktop may download the required cross-compilation runtime and
backend components.

After publishing, generate or update the website's latest-release pointer from the versioned,
validated metadata:

```sh
deno task release:latest 1.2.3
```

This writes `public/latest.json`; deploy the website with that updated file so the download page
serves the selected version. The task reads the published `release.json` from the public R2 URL and
refuses to replace a newer local pointer. It does not require R2 credentials or upload anything to
R2.

## Secure defaults

Unsafe HTTP methods are same-origin only. The middleware applies a per-response nonce to scripts and
styles and sets a CSP without `unsafe-inline`. Desktop and server tasks grant only the permissions
the app needs.
