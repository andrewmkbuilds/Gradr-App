# Base44 Dev Environment — Gradr

## Stack
- **Frontend:** Vite 5 + React 18 + TypeScript + Tailwind v3 + React Router v6
- **Package manager:** Bun (bun.lock is the source of truth)
- **Backend:** Supabase (Lovable Cloud) — hosted remotely, no local backend
- **Dev server:** `vite` on port 8080, mapped to host port 3000

## Running the app
```bash
docker compose -f docker-compose.base44.yml up -d
```
The compose service runs `bun install && bun run dev` inside `oven/bun:1` with the source bind-mounted at `/app`. Vite live-reloads on file changes.

## Key details
- **No external secrets needed.** All credentials in `.env` are client-side publishable keys (Supabase anon key, Paddle client token, PostHog key) committed to the repo. Server-side secrets (PADDLE_API_KEY, webhook secrets) are for Supabase edge functions, not the local dev server.
- **`allowedHosts: true`** was added to `vite.config.ts` so the preview proxy hostname is accepted by Vite's host checking (Vite 5.4.19 DNS rebinding fix).
- **`predev` hook** runs `scripts/generate-sitemap.ts` before `vite` starts — writes sitemap XML files to `public/`.
- **TanStack Start/Router is forbidden** in this repo — see README. Do not add it.
- **VITE_GRADR_SURFACE=app** in `.env` pins the app surface at `/`.

## Verification
```bash
curl -sf -H "Host: external-preview.example.com" http://localhost:3000/   # must return 200 + HTML
docker compose -f docker-compose.base44.yml logs --tail 20                  # check "VITE ready"
```
