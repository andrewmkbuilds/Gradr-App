CREATE TABLE public.auth_email_link_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id TEXT,
  message_id UUID,
  action_type TEXT NOT NULL,
  template_key TEXT,
  recipient_redacted TEXT,
  link_origin TEXT,
  link_path TEXT,
  link_type TEXT,
  redirect_to TEXT,
  token_param TEXT,
  token_digest TEXT,
  url_digest TEXT,
  link_valid BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.auth_email_link_audit IS
  'Sanitized audit trail of the dynamic auth action URL used for each authentication email. Never stores the raw token or full URL - only SHA-256 digests.';

CREATE INDEX auth_email_link_audit_created_at_idx ON public.auth_email_link_audit (created_at DESC);
CREATE INDEX auth_email_link_audit_message_id_idx ON public.auth_email_link_audit (message_id);

GRANT SELECT ON public.auth_email_link_audit TO authenticated;
GRANT ALL ON public.auth_email_link_audit TO service_role;

ALTER TABLE public.auth_email_link_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read auth email link audit"
  ON public.auth_email_link_audit
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));