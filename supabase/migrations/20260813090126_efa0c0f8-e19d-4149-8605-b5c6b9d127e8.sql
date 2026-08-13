-- 1. Idempotency ledger: guarantees one send per idempotency key
CREATE TABLE IF NOT EXISTS public.email_idempotency (
  idempotency_key text PRIMARY KEY,
  message_id text NOT NULL,
  template_name text NOT NULL,
  recipient_email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.email_idempotency TO service_role;
ALTER TABLE public.email_idempotency ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read email idempotency" ON public.email_idempotency
  FOR SELECT TO authenticated USING (public.is_admin());
GRANT SELECT ON public.email_idempotency TO authenticated;

-- 2. Delivery / engagement events
CREATE TABLE IF NOT EXISTS public.email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id text,
  template_name text,
  recipient_email text,
  event_type text NOT NULL CHECK (event_type IN ('queued','sent','delivered','opened','clicked','bounced','complained','failed','suppressed','deduped')),
  url text,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_events_message_id_idx ON public.email_events (message_id);
CREATE INDEX IF NOT EXISTS email_events_created_at_idx ON public.email_events (created_at DESC);
CREATE INDEX IF NOT EXISTS email_events_type_idx ON public.email_events (event_type);
-- one terminal event per message per type (dedupe across webhook retries / queue reprocessing)
CREATE UNIQUE INDEX IF NOT EXISTS email_events_terminal_unique
  ON public.email_events (message_id, event_type)
  WHERE event_type IN ('queued','sent','delivered','bounced','complained','deduped');
GRANT ALL ON public.email_events TO service_role;
GRANT SELECT ON public.email_events TO authenticated;
ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read email events" ON public.email_events
  FOR SELECT TO authenticated USING (public.is_admin());

-- 3. Email feature flags (opt-in behaviours)
CREATE TABLE IF NOT EXISTS public.email_feature_flags (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.email_feature_flags TO service_role;
GRANT SELECT, UPDATE ON public.email_feature_flags TO authenticated;
ALTER TABLE public.email_feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read email flags" ON public.email_feature_flags
  FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Admins can update email flags" ON public.email_feature_flags
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

INSERT INTO public.email_feature_flags (key, enabled, description) VALUES
  ('plain_text_fallback', false, 'Attach a generated plain-text alternative part to every transactional email'),
  ('open_tracking', true, 'Embed a 1x1 pixel to record email opens'),
  ('click_tracking', true, 'Rewrite CTA links through the click-tracking redirect')
ON CONFLICT (key) DO NOTHING;