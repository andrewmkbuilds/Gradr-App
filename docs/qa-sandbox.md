# QA sandbox (credential-free end-to-end testing)

Dev/preview only. Open `/qa/sandbox` and switch on the modes you need. Nothing
is written to the database, and the routes are not mounted on `gradr.me`,
`www.gradr.me` or `app.gradr.me`.

| Mode | What it replaces | What you can test |
|---|---|---|
| Job search fixtures | `search-jobs`, `jobs-apify`, `recommend-jobs`, `match-jobs` | 46 saved listings over 3 pages + an empty page, board de-duplication, match scores, save/apply tracking (writes to the real `tracked_jobs`) |
| Resume ATS fixture | `analyze-resume` (SSE) | upload → streamed stages → partial scores → full ATS report |
| Local e-mail capture | `send-transactional-email`, `send-notification`, Supabase `auth/v1/recover` | forgot password → captured message → clickable reset link, all transactional sends |
| Mocked OAuth | `lovable.auth.signInWithOAuth` | Google/Apple/Microsoft consent → deterministic callback → redirect target; a real session is created when a QA account is saved on the sandbox page |
| Payment simulator | Paddle checkout, `subscribers`, `usage_credits`, `purchases`, `entitlement_snapshot` | paywall gating, upgrade/downgrade, cancel-at-period-end, credit packs (granted once per purchase id) |
| Camera & microphone | `navigator.mediaDevices` | pre-flight check, presence monitor, permission-denied and no-device handling |

## How it works

- `src/lib/qa/sandbox/flags.ts` — availability + per-mode flags (local storage).
- `src/lib/qa/sandbox/network.ts` — one `fetch` patch covering edge functions,
  the streamed AI protocol, PostgREST reads and the auth recover endpoint.
  Anything unhandled falls through to the real network.
- `src/lib/qa/sandbox/media.ts` — canvas video + oscillator audio tracks.
- `src/lib/qa/sandbox/simulator.ts` — plan/credit state and one-shot pack grants.
- `src/lib/qa/sandbox/oauth.ts` + `/qa/oauth` — the mock identity provider.
- `src/lib/qa/sandbox/inbox.ts` — captured mailbox and reset links.

The sandbox reset link carries `qa_sandbox=1` instead of a real recovery token:
no e-mail was sent, so no token exists. It exercises the reset screen, not
Supabase's token exchange.
