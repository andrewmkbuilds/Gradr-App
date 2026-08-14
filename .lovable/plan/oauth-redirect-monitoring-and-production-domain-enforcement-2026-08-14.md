# OAuth redirect monitoring and production domain enforcement

## Build
- Correct the OAuth forensics contract so production expects `app.gradr.me`, logs the initiating origin, exact callback URL, callback arrival, authenticated session, and final dashboard landing, and flags any hop or final URL on `gradr.me` as a domain bounce.
- Add immediate operational alert signals for redirect deviations through the existing OAuth forensics/Sentry telemetry path without recording tokens or sensitive callback parameters.
- Upgrade the production Playwright check to start at `https://app.gradr.me/auth?next=/dashboard`, assert the exact callback URI `https://app.gradr.me/~oauth/callback`, preserve `next`, and verify an authenticated run lands at `https://app.gradr.me/dashboard`. Keep an unauthenticated provider-request mode for CI when no Google test account is available.
- Add focused unit coverage for expected production URLs and bounce detection.

## Domain configuration
- Probe DNS and HTTP headers before and after implementation. The application cannot override a hosting-edge 302 that occurs before JavaScript runs.
- If the connected-domain configuration is writable through available project tools, make `app.gradr.me` independently served. Otherwise, document the exact hosting blocker and the required project/domain split or primary-domain action; keep the E2E test failing loudly until the edge redirect is removed.

## Verification
- Run the focused OAuth tests and production redirect probe.
- Run the production OAuth test far enough to inspect the generated authorization request. Complete the signed-in landing assertion only when an approved test session/account is available and the hosting callback no longer redirects.
