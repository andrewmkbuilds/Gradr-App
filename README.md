# Gradr

AI career copilot for resumes, job matching, applications and AI mock interviews.

## Architecture boundaries

Gradr runs on **Vite 5 + React 18 + TypeScript + Tailwind v3 + React Router v6**, with Lovable Cloud (Supabase) for database, auth, storage and edge functions.

### Hard rule: never migrate to TanStack Start

**TanStack Start (and TanStack Router) must never be introduced into this repo.** A previous attempt left broken artifacts and production outages; the decision is final and not up for re-evaluation. Do not add `@tanstack/start`, `@tanstack/react-start`, `@tanstack/react-router` or `@tanstack/router`, and do not create framework entry files such as `src/start.ts`, `app.config.ts`, `src/router.tsx` or `src/routeTree.gen.ts`.

### Allowed

- Routing: `react-router-dom` v6 with a single `<BrowserRouter>` in `src/App.tsx`
- Data: `@tanstack/react-query` (allowed — Query is *not* Start/Router)
- UI: shadcn/ui + Tailwind v3 tokens from `src/index.css` (Yacht Club palette)
- Motion: `motion/react` (Motion.dev) only
- Backend: Supabase client, RPCs with RLS, and edge functions under `supabase/functions/`

### Not allowed

- TanStack Start / TanStack Router (any package, import, or scaffold file)
- Alternative frameworks (Next.js, Remix, Astro, Vue, Svelte)
- Server-rendered route trees or file-based routing conventions
- Hosting config files from other platforms (`_redirects`, `vercel.json`, `netlify.toml`)

### How the rule is enforced

| Layer | Command | What it does |
| --- | --- | --- |
| Pre-commit hook | `.githooks/pre-commit` (installed by `bun run prepare`) | Blocks the commit when the scanner finds any forbidden reference; bypass only with `git commit --no-verify` |
| Pre-build script | `bun run check:no-tanstack` (auto-runs via `prebuild`) | Scans `package.json`, **all lockfiles (`yarn.lock`, `package-lock.json`, `bun.lock`, `pnpm-lock.yaml`) including transitive entries**, the installed `node_modules` tree, migration artifact files, all source imports, **and generated build output (`dist/`, `build/`, `.output/`)**; prints every violation and fails the build |
| CI | `.github/workflows/content-guardrails.yml` | Runs the script before typecheck, and again after `bun run build` so the emitted bundle is swept too |
| Lint | `bun run lint` | `no-restricted-imports` blocks TanStack Start/Router imports while allowing React Query and React Router |
| Tests | `bunx vitest run src/test/architectureGuard.test.tsx` | Asserts no forbidden deps/imports, `<BrowserRouter>` is intact, all critical routes are declared, and route rendering/fallback still works |

### SEO fallback flash regression

The crawler fallback copy lives inside `<noscript>` in `index.html` — never a CSS-hidden `#seo-shell` (that pattern reads as cloaking). Two checks keep it that way:

- `bunx vitest run src/test/seoShellHidden.test.ts` — structural guard: fallback copy exists only inside `<noscript>`, no hidden shell, splash styled for light *and* dark.
- `bun run test:seo-flash` — Playwright: first load, reload and cache-bypassing hard reload on `/`, `/pricing`, `/auth` in both colour schemes, sampling ~30 frames per load and failing if the fallback ever paints or the splash sticks.
- `bun run smoke:pages` — Playwright: landing, auth, pricing, dashboard and all engine routes render their expected UI with no loading/SEO flash.


Run the whole guard locally before shipping a wave:

```bash
bun run check:no-tanstack && bun run lint && bunx vitest run src/test/architectureGuard.test.tsx src/test/navRoutes.test.ts
```
