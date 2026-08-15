# Serving Gradr subdomains directly

## The constraint

Lovable hosting serves **exactly one primary domain per project**. Every other
domain connected to that project is an *alias* and is 302-redirected to the
primary at the Cloudflare edge — before any JavaScript runs.

Verified against production:

```
gradr.me              200
www.gradr.me          302 -> gradr.me   (intended)
app.gradr.me          302 -> gradr.me
docs / news / affiliates / status / support   302 -> gradr.me
```

DNS is already correct: all hostnames resolve to `185.158.133.1` with valid
HTTPS. Nothing needs changing at the registrar. No router config, host
detection, or redirect handler can run earlier than that edge response, so this
is not solvable in application code.

## The fix: one project per domain

To serve `app.gradr.me` directly you need a project whose **primary** domain is
`app.gradr.me`. The codebase is the same; only the surface pin differs.

### Per-project setup

1. Create a new Lovable project from this codebase (Remix / duplicate).
2. Set the build env var:

   | Domain                | `VITE_GRADR_SURFACE` |
   | --------------------- | -------------------- |
   | `gradr.me`            | *(unset)* — this project |
   | `app.gradr.me`        | `app`                |
   | `docs.gradr.me`       | `docs`               |
   | `news.gradr.me`       | `news`               |
   | `affiliates.gradr.me` | `affiliates`         |
   | `marketing.gradr.me`  | `marketing`          |
   | `status.gradr.me`     | `status`             |
   | `support.gradr.me`    | `support`            |

3. Copy the remaining env vars (Cloud + Paddle) from `.env.example`. **Point
   every project at the same backend** — same `VITE_SUPABASE_*` values — so
   accounts, sessions and data are shared.
4. Publish. Verify on the project's `*.lovable.app` preview URL first: the
   pinned surface renders at `/` there, so you can confirm before touching DNS.
5. Connect the subdomain and set it as that project's **Primary** domain.
6. In this (apex) project, **remove** the subdomain from the connected-domains
   list so it stops being an alias here.

### What the pin does

`VITE_GRADR_SURFACE` (see `src/config/domains.ts`) makes the bundle render one
surface at the root on every host:

- `currentSurface()` returns the pinned surface regardless of hostname or path.
- `isMultiSurfaceHost()` is false, so in-surface links drop their path prefix
  (`docs.gradr.me/guides`, not `docs.gradr.me/docs/guides`).
- Links to the pinned surface stay on the current origin, so preview URLs are
  self-contained; cross-surface links use the canonical production origin.

`VITE_GRADR_SURFACE=app` mounts the full authenticated product at `/` — app
routes render directly on that host, which is the goal.

Unset (this project) keeps the existing behaviour: hostname routing in
production, path prefixes on shared hosts. Nothing regresses if the split is
never done.

### Auth note

OAuth and post-login redirects already resolve through `urlFor("app", …)`, so
they follow the app surface automatically. Once `app.gradr.me` is served
directly, the Google redirect URI `https://app.gradr.me/~oauth/callback` will
stop bouncing to the apex and the end-to-end sign-in test
(`scripts/test-oauth-flow.mjs`) should pass.

## Recommended scope

The apex/app split is the one that matters — it separates the public brand site
from the authenticated product and unblocks OAuth. The other five surfaces are
content and work fine as path prefixes on `gradr.me` today; each additional
project is a full duplicate deployment to keep in sync on every change. Split
those only when a subdomain earns it.
