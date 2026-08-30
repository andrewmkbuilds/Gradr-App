# Fix: outgoing emails rejected — gradr.me not verified in Resend

## Diagnosis (confirmed)

- Notification emails (`send-notification`, `notify-policy-update`) send through the Resend connector with `From: Gradr <noreply@gradr.me>`.
- Resend account has exactly one domain, `gradr.me`, status **`not_started`** — its DNS records were never added, so Resend is in test mode and rejects every send to non-owner recipients with 403.
- No conflict with the existing Lovable email setup: the Lovable NS delegation covers only the `notify.app.gradr.me` subdomain. Resend's records live on `resend._domainkey.gradr.me` and `send.gradr.me` and can coexist.

## Fix — the core step is DNS, which only the domain owner can do

### Step 1 (owner action, ~5 min): add 3 DNS records for gradr.me at the DNS provider

| Type | Host/Name | Value |
|---|---|---|
| TXT | `resend._domainkey` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCoMipRoCkKyARbT1zvpUEhNqZs5q66xLyS58GCOVWgr29fVn5WmwhU2EB4scTtdVqpproW4wXFgD/EgNvKBDozfs7+kZFdcCvv9+9GQdVpJ5G8Ivh5aDZzJaXO6AgFWeAWrPSi5pMTsu8z2PS8LqYNHalPzHwo16iDct7BwM+YWQIDAQAB` |
| MX | `send` | `feedback-smtp.eu-west-1.amazonses.com` (priority 10) |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` |

### Step 2 (I do this): trigger verification and confirm
- Call Resend's verify endpoint for the domain and poll until status is `verified`.
- If DNS hasn't propagated yet, report status and re-check on the next turn.

### Step 3 (I do this, small code change): alert on provider rejection
- In `send-notification` and `notify-policy-update`, when the email provider returns non-2xx, also insert a row into the existing email delivery audit/log so a rejected send is visible in the admin email logs instead of only in function logs, and surface it via the existing admin alert path.
- Redeploy the two functions.

### Step 4 (I do this): end-to-end verification
- Trigger one real notification to a non-owner test address and confirm a 2xx from the provider plus a `sent` entry in the logs.

## Technical details
- Files touched: `supabase/functions/send-notification/index.ts`, `supabase/functions/notify-policy-update/index.ts` (error-path logging only).
- No schema changes, no migration, no change to the `From` address — `noreply@gradr.me` becomes valid once the domain verifies.
- Note: the separate Lovable email domain `notify.app.gradr.me` (used by auth/transactional templates) currently shows **drifted** DNS — that's a distinct issue from this finding; flagging it for awareness, not changing it here.
