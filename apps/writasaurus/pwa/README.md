# Editor offline integration

The app uses `editorPwa()` from `apps/writasaurus/pwa/integration.ts`. Serve the resulting `dist/client`
through the Cloudflare assets binding, including the root-level `writasaurus-editor-*` files and
`data/oewn-2025-synonyms.json`. The integration copies the editor's synonym data without moving it,
fails on conflicting assets, and precaches every eligible emitted client asset, including dynamic
chunks and WASM. Each fetched asset must match its build-time SHA-256 digest, so an SSR response or
stale deployment cannot be mistaken for a public build asset. The site must be deployed at the
origin root over HTTPS (or localhost). Cloudflare control files such as `_headers` and `_redirects`
are excluded because they are deployment metadata, not fetchable assets. The same integration works
with the Node middleware adapter's client directory used by the app's test configuration. The
manifest's 192px and 512px PNG icons are derived from the existing application artwork.

Import `apps/writasaurus/src/pwa/register.ts` in a bundled Astro `<script>` in the marketing layout as
well as the editor layout, and link `/writasaurus-editor.webmanifest` in both heads. The module
registers only in builds with the integration enabled. Keep CSP `worker-src
'self'` and `script-src 'self'`; add `manifest-src 'self'` and allow the icons under `img-src`. The first landing
visit must remain online until the service worker has finished installing; `navigator.serviceWorker.ready`
resolves after activation. The landing page itself is not cached.

The landing CTA queries `getInstalledRelatedApps()` where supported. A matching installed web
app, or the `appinstalled` event, changes it to "Open App" with a `web+writasaurus://open` link.
The manifest registers this protocol to launch `/editor#launch=%s`, keeping offline editor
navigation free of query strings. Set `PUBLIC_SITE_URL` to the deployed origin when building:
the integration uses it to override the absolute related-app ID required for desktop detection.
Without this override, the manifest targets `https://writasaurus.vindstack.com/editor`.
Browsers without installed-app detection retain "Try now"; no localStorage installation flag
is used because it would remain stale after uninstalling. Native protocol registration and
launch permission are browser/OS dependent; existing installs may require a manifest update
or reinstall. Tests simulate installed-app detection and verify the link/manifest contract,
not Brave's native launch dialog.

All seven routes in `public-pages.ts` must render complete, anonymous, non-personalized editor
shells without authentication, account data, user-specific server state, cookies, or API responses.
Adapt editor links and browser-side file/settings/goal behavior to these routes and to offline use.
In the merged middleware, apply `markOfflineEditorPage(context.request, response)` to the final HTML
response **after** CSP and nonce injection, and only after auditing those routes as public. It marks
only the worker's credential-free precache requests; other navigations are never written to cache.
The worker requires a successful unredirected HTML response with this explicit marker and nonce CSP,
and preserves the response headers and body together. Do not mark pages if any server rendering can
depend on IP, headers, sessions, or other user-specific information. Do not send `Set-Cookie`,
`Cache-Control: private/no-store`, or `Vary: Cookie/Authorization` on these anonymous shells.
Failure of any resource prevents installation rather than installing a partial offline editor.

The worker intercepts only exact editor navigations and emitted static asset URLs, never account,
API, cross-origin, query-string, or other requests. Navigations are network-first with an offline
fallback; assets are cache-first. Google-hosted fonts are not cached and need local fallbacks.
Cached HTML retains its original nonce and CSP, so its nonce is reused for offline renders; never
use these cached shells for personalized content or mix their HTML and headers with another response.

Each build creates a new revision. A new worker installs its complete cache in the background and
waits until old controlled tabs close; it does not forcibly reload or interrupt edits. Activation
removes older editor caches. Configure the CDN to revalidate `/writasaurus-editor-sw.js` (for example
`Cache-Control: no-cache`) and deploy the worker, assets, and SSR code atomically. Old hashed assets
must remain available during rollout and while old tabs are open. Monitor registration/install
failures in production; an install failure leaves the previous worker active.
