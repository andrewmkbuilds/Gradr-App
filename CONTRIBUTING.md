# Contributing to Gradr

This guide covers the parts of the workflow that are easy to get wrong: theme
visual baselines, how CI reports drift, and what "quarantined" means.

## Before you push

```bash
bun install
bun run typecheck        # tsgo, no emit
bunx vitest run          # unit tests
bun run theme:check      # no hardcoded colours; light/dark actually differ
```

---

## Theme visual baselines

Gradr screenshots its key screens in light and dark mode and compares each
capture against a **committed, human-approved baseline**. A baseline is only
trusted when its `sha256` is recorded in
`tests/visual/themes/baselines.lock.json` together with who approved it and
why. An edited baseline that was not re-approved fails CI as a *lock mismatch*
rather than silently redefining "correct".

| Path | What it is |
| --- | --- |
| `tests/visual/themes/baseline/` | approved truth (committed) |
| `tests/visual/themes/pending/` | candidate captures awaiting review (gitignored) |
| `tests/visual/themes/current/` | what this run actually rendered (gitignored) |
| `tests/visual/themes/diff/` | highlighted pixel diffs (gitignored, uploaded by CI) |
| `tests/visual/themes/baselines.lock.json` | the lock: hash + reviewer + reason per baseline |

### Reviewing and approving new baselines

A baseline is **never** overwritten in place. Approval is a deliberate,
one-time review step:

1. **Capture candidates.** Run the app locally (`bun run dev`, or
   `bun run build && bunx vite preview --port 8080`), then:

   ```bash
   bun run test:visual:themes:update
   ```

   Every capture lands in `tests/visual/themes/pending/` — nothing is promoted.

2. **Review what is waiting**, with the drift each candidate represents:

   ```bash
   bun run visual:baseline:review
   ```

   Output looks like:

   ```
   Locked baselines: 6/6

   Pending review (2):
     auth-dark.png       3.41% pixels changed
     dashboard-light.png NEW capture
   ```

3. **Look at the images.** Open the pending PNG next to the baseline it would
   replace (`tests/visual/themes/pending/auth-dark.png` vs
   `tests/visual/themes/baseline/auth-dark.png`). Confirm every visible
   difference is one you intended. If anything surprises you, fix the code
   instead of approving the screenshot.

4. **Approve and lock**, with a real reason — it is stored in the lock file and
   is what makes a future regression triageable:

   ```bash
   bun run visual:baseline:approve -- --all \
     --reviewer "Your Name" \
     --reason "New sidebar spacing scale"
   ```

   Approve individual files by naming them instead of `--all`:

   ```bash
   bun run visual:baseline:approve -- auth-dark.png --reviewer "You" --reason "…"
   ```

5. **Commit the PNGs and `baselines.lock.json` in the same commit.** A baseline
   without its lock entry fails CI, and a lock entry without its PNG is
   meaningless.

If a baseline was changed on disk outside this flow (a bad merge, a stray
`--update`), CI reports a lock mismatch. Either restore the file, or review the
change and re-lock it explicitly:

```bash
bun run visual:baseline:relock -- --reviewer "You" --reason "why"
```

### How to interpret drift %

Drift is the share of pixels that differ between the current capture and the
baseline, measured with `pixelmatch` (colour threshold `0.15`, anti-aliasing
ignored). The same number is reported at review time and in CI, so what you
approve is what CI measures.

| Drift | CI verdict | What it usually means |
| --- | --- | --- |
| ≤ **2%** (`VISUAL_TOLERANCE`) | ✅ pass | anti-aliasing, font hinting, sub-pixel noise |
| 2% – **25%** (`VISUAL_QUARANTINE_TOLERANCE`) | ❌ fail, blocks merge | a real regression: colour, spacing, a component swap |
| > **25%** | 🟡 quarantined, does **not** block | too large to be a targeted regression — renderer/font/environment difference, wrong route captured, a whole-screen change |
| size changed | counted as 100% | the viewport or page height changed; no pixel diff image is produced |

Rules of thumb when triaging a number:

- **Under 1%** on one theme only is almost always rendering noise. The suite
  already retries up to `VISUAL_RETRIES` (3) before failing, so a number that
  survives the retries is worth a look.
- **A few percent, localised in the diff image**, is a genuine UI change. Either
  it is intended (approve a new baseline) or it is a bug (fix the code).
- **Double-digit drift on every capture at once** is an environment problem, not
  a design change — this is exactly what quarantine exists for. Do not approve
  new baselines to make it go away; find out why the whole render changed.

Override the thresholds locally when you need to:

```bash
VISUAL_TOLERANCE=0.01 VISUAL_QUARANTINE_TOLERANCE=0.4 bun run test:visual:themes
```

### Quarantined runs

When *every* over-threshold capture is above the quarantine threshold and
nothing else failed, the visual step exits 0 and the run is marked
**quarantined**: it stops blocking merges, but it is reported loudly. CI still
uploads the full `theme-visual-diffs` artifact (baseline + current + diff PNGs
and `visual-themes.json`), the PR comment carries a warning banner, and the
workflow emits a `::warning` annotation.

A quarantined run is not a pass. It means "a human has to look at this" —
triage it before merging anything that depends on the visuals.

---

## Reading the CI summary comment

Every pull request gets one upserted comment (`CI test summary`) with:

- a per-suite table (route guards, refresh rotation, multi-tab sign-out, theme
  visuals) with pass/fail/quarantined counts;
- a **theme visual diffs** table listing each non-passing capture, its drift %,
  and a link to the diff image for that capture;
- links to the Playwright HTML report, failing traces and videos (open a trace
  at [trace.playwright.dev](https://trace.playwright.dev)), axe JSON, and the
  visual artifacts.

GitHub cannot deep-link into a file inside an artifact zip, so diff links point
at the run's artifact list and name the exact file to open. If you host the diff
images somewhere public, set `VISUAL_DIFF_BASE_URL` on the summary step and the
comment will link the PNGs directly instead.

---

## Auth and session tests

- `bun run test:refresh-rotation` — API-level: refresh tokens rotate, spent
  tokens cannot start a new chain, and nothing survives sign-out.
- `bun run test:multi-tab-signout` — UI-level: two tabs share one session, tab A
  signs out, and tab B can neither reach a protected route nor mint a new
  session from the refresh token it was holding.

Both skip themselves (exit 0) when `E2E_EMAIL` / `E2E_PASSWORD` are absent, so
forks and secret-less runs stay green.
