ALTER TABLE public.auth_email_link_audit
  ADD COLUMN IF NOT EXISTS allowlist_ok boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allowlist_reasons text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS redirect_sanitized boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS blocked boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS auth_email_link_audit_allowlist_idx
  ON public.auth_email_link_audit (allowlist_ok, created_at DESC);