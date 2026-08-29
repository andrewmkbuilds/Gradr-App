# Security headers

`bun run check:security-headers` (`scripts/check-security-headers.mjs`) audits the
production app surface, `https://app.gradr.me`. It reports in two tiers because
two different systems own the response.

## Blocking — owned by this repository / the platform edge

| Check | Source |
|---|---|
| `strict-transport-security` (>= 180 days, `includeSubDomains`) | hosting edge |
| `referrer-policy` (strict) | hosting edge |
| `x-content-type-options: nosniff` | hosting edge |
| no technology/version disclosure headers, no `<meta name="generator">` | build output |
| document CSP: `base-uri 'self'`, `object-src 'none'`, `form-action` | `index.html` |

The document CSP lives in `index.html` as `<meta http-equiv="Content-Security-Policy">`.
`base-uri`, `object-src` and `form-action` are the directives a meta-delivered
policy actually enforces, so they are gated here. Changing that tag without
keeping those three directives fails CI.

## Advisory — hosting/CDN configuration only

These cannot be produced by any change in this repository: `<meta http-equiv>`
ignores `frame-ancestors` and report-only policies, and `X-Frame-Options` and
`Permissions-Policy` have no meta equivalent at all.

- `content-security-policy` with `frame-ancestors`
- `content-security-policy-report-only` (staging policy + reporting endpoint)
- `x-frame-options`
- `permissions-policy`

The checker prints them as `!` warnings and the route as `WARN`. Closing them
requires edge configuration on the hosting side (Cloudflare rules / platform
header support). Do not "fix" them by re-adding blocking assertions — the
pipeline would then fail on something no commit can change.

Expected origins for a future enforced policy are kept in
`scripts/lib/securityHeaders.mjs` (`REPORT_ONLY_ORIGINS`, `REPORT_ONLY_DIRECTIVES`)
so the policy can be written accurately once the edge supports it.
