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
| Pre-build script | `bun run check:no-tanstack` (auto-runs via `prebuild`) | Scans `package.json`, lockfiles, migration artifact files, and all source imports; prints every violation with `file:line` and fails the build |
| CI | `.github/workflows/content-guardrails.yml` | Runs the same script as the first job step, before typecheck |
| Lint | `bun run lint` | `no-restricted-imports` blocks TanStack Start/Router imports while allowing React Query and React Router |
| Tests | `bunx vitest run src/test/architectureGuard.test.tsx` | Asserts no forbidden deps/imports, `<BrowserRouter>` is intact, all critical routes are declared, and route rendering/fallback still works |

Run the whole guard locally before shipping a wave:

```bash
bun run check:no-tanstack && bun run lint && bunx vitest run src/test/architectureGuard.test.tsx src/test/navRoutes.test.ts
```
