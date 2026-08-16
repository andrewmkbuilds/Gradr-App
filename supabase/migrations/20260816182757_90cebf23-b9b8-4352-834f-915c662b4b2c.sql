CREATE TABLE public.analytics_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_name TEXT NOT NULL,
  article TEXT,
  location TEXT,
  destination TEXT,
  path TEXT,
  referrer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  session_id TEXT,
  user_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_analytics_events_event_created ON public.analytics_events(event_name, created_at DESC);
CREATE INDEX idx_analytics_events_article ON public.analytics_events(article);

GRANT INSERT ON public.analytics_events TO anon, authenticated;
GRANT SELECT ON public.analytics_events TO authenticated;
GRANT ALL ON public.analytics_events TO service_role;

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert analytics events"
  ON public.analytics_events FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can read analytics events"
  ON public.analytics_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Lock down commission creation to trusted backend only
REVOKE EXECUTE ON FUNCTION public.record_conversion_commission(uuid, numeric, public.affiliate_conversion_type, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_conversion_commission(uuid, numeric, public.affiliate_conversion_type, text) TO service_role;

-- Validation helper for affiliate click inserts (bypasses affiliate_profiles RLS safely, read-only)
CREATE OR REPLACE FUNCTION public.affiliate_click_is_valid(_profile_id uuid, _code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.affiliate_profiles p
    WHERE p.id = _profile_id
      AND p.affiliate_code = _code
      AND p.status = 'active'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.affiliate_click_is_valid(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.affiliate_click_is_valid(uuid, text) TO anon, authenticated, service_role;

-- Replace permissive affiliate_clicks INSERT policy
DROP POLICY IF EXISTS "anyone can insert clicks" ON public.affiliate_clicks;

CREATE POLICY "validated click inserts"
ON public.affiliate_clicks
FOR INSERT
TO anon, authenticated
WITH CHECK (
  affiliate_profile_id IS NOT NULL
  AND public.affiliate_click_is_valid(affiliate_profile_id, affiliate_code)
  AND ip_hash IS NULL
  AND length(coalesce(user_agent, '')) <= 500
  AND length(coalesce(landing_page, '')) <= 2048
  AND length(coalesce(affiliate_code, '')) <= 64
);

CREATE POLICY "admins can update clicks"
ON public.affiliate_clicks
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins can delete clicks"
ON public.affiliate_clicks
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Replace permissive analytics_events INSERT policy (no spoofed user_id)
DROP POLICY IF EXISTS "Anyone can insert analytics events" ON public.analytics_events;

CREATE POLICY "insert own analytics events"
ON public.analytics_events
FOR INSERT
TO anon, authenticated
WITH CHECK (
  (user_id IS NULL OR user_id = auth.uid())
  AND length(coalesce(event_name, '')) BETWEEN 1 AND 128
  AND length(coalesce(path, '')) <= 2048
  AND length(coalesce(referrer, '')) <= 2048
);

-- Admin audit log
CREATE TABLE public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  action text NOT NULL CHECK (action IN ('view','create','update','delete','export')),
  resource_type text NOT NULL,
  resource_id text,
  record_count integer NOT NULL DEFAULT 1,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read audit log"
ON public.admin_audit_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_admin_audit_log_created_at ON public.admin_audit_log (created_at DESC);
CREATE INDEX idx_admin_audit_log_actor ON public.admin_audit_log (actor_id, created_at DESC);
CREATE INDEX idx_admin_audit_log_resource ON public.admin_audit_log (resource_type, created_at DESC);

CREATE OR REPLACE FUNCTION public.assert_admin_write_rate_limit(_actor uuid, _limit integer DEFAULT 50)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE recent integer;
BEGIN
  IF _actor IS NULL THEN RETURN; END IF;
  SELECT count(*) INTO recent
  FROM public.admin_audit_log
  WHERE actor_id = _actor
    AND action IN ('update','delete')
    AND created_at > now() - interval '1 minute';

  IF recent >= _limit THEN
    RAISE EXCEPTION 'Rate limit exceeded: more than % admin write actions in one minute. Wait a moment and retry.', _limit
      USING ERRCODE = 'check_violation';
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.assert_admin_write_rate_limit(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_admin_write_rate_limit(uuid, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.trg_audit_tracking_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  act text := lower(TG_OP);
  rec_id text;
BEGIN
  PERFORM public.assert_admin_write_rate_limit(actor, 50);

  IF TG_OP = 'DELETE' THEN
    rec_id := OLD.id::text;
  ELSE
    rec_id := NEW.id::text;
  END IF;

  INSERT INTO public.admin_audit_log (actor_id, action, resource_type, resource_id, record_count, details)
  VALUES (
    actor,
    act,
    TG_TABLE_NAME,
    rec_id,
    1,
    CASE WHEN TG_OP = 'DELETE'
      THEN jsonb_build_object('before', to_jsonb(OLD))
      ELSE jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW))
    END
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.trg_audit_tracking_write() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER audit_affiliate_clicks_write
AFTER UPDATE OR DELETE ON public.affiliate_clicks
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_tracking_write();

CREATE TRIGGER audit_analytics_events_write
AFTER UPDATE OR DELETE ON public.analytics_events
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_tracking_write();

CREATE OR REPLACE FUNCTION public.log_admin_access(
  _action text,
  _resource_type text,
  _record_count integer DEFAULT 1,
  _resource_id text DEFAULT NULL,
  _details jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  new_id uuid;
  recent integer;
BEGIN
  IF actor IS NULL OR NOT public.has_role(actor, 'admin') THEN
    RAISE EXCEPTION 'Only admins can write audit entries';
  END IF;

  IF _action NOT IN ('view','export') THEN
    RAISE EXCEPTION 'Only view/export actions may be logged explicitly';
  END IF;

  IF _resource_type NOT IN ('affiliate_clicks','analytics_events') THEN
    RAISE EXCEPTION 'Unsupported resource type';
  END IF;

  SELECT count(*) INTO recent
  FROM public.admin_audit_log
  WHERE actor_id = actor
    AND action = _action
    AND resource_type = _resource_type
    AND created_at > now() - interval '30 seconds';
  IF recent > 0 THEN RETURN NULL; END IF;

  INSERT INTO public.admin_audit_log (actor_id, action, resource_type, resource_id, record_count, details)
  VALUES (actor, _action, _resource_type, _resource_id, GREATEST(COALESCE(_record_count,0), 0), COALESCE(_details,'{}'::jsonb))
  RETURNING id INTO new_id;

  RETURN new_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.log_admin_access(text, text, integer, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_admin_access(text, text, integer, text, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_audit_actors()
RETURNS TABLE(user_id uuid, display_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.user_id, p.display_name
  FROM public.profiles p
  WHERE public.has_role(auth.uid(), 'admin');
$$;

REVOKE EXECUTE ON FUNCTION public.admin_audit_actors() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_audit_actors() TO authenticated, service_role;

-- Notification helpers become backend-only (were client-callable)
REVOKE EXECUTE ON FUNCTION public.enqueue_notification(uuid, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_notification(uuid, text, text, text, text, jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.notify_admins(text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_admins(text, text, text, text, jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.generate_affiliate_code() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_affiliate_code() TO service_role;

REVOKE EXECUTE ON FUNCTION public.trg_notify_new_application() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.approve_affiliate_application(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reject_affiliate_application(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_create_payout(uuid, numeric, text, text, text, uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_mark_payout_paid(uuid, text, text) FROM PUBLIC, anon;

-- Audit + throttle the money-moving admin RPCs
CREATE OR REPLACE FUNCTION public.admin_create_payout(
  _affiliate_profile_id uuid,
  _amount numeric,
  _payout_method text,
  _reference text DEFAULT NULL::text,
  _notes text DEFAULT NULL::text,
  _commission_ids uuid[] DEFAULT NULL::uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE payout_id UUID;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Only admins can create payouts';
  END IF;

  IF _amount IS NULL OR _amount <= 0 OR _amount > 100000 THEN
    RAISE EXCEPTION 'Payout amount must be between 0 and 100000';
  END IF;

  PERFORM public.assert_admin_write_rate_limit(auth.uid(), 50);

  INSERT INTO public.affiliate_payouts
    (affiliate_profile_id, amount, payout_method, reference, notes, status, created_by)
  VALUES
    (_affiliate_profile_id, _amount, _payout_method, _reference, _notes, 'pending', auth.uid())
  RETURNING id INTO payout_id;

  IF _commission_ids IS NOT NULL THEN
    UPDATE public.affiliate_commissions
      SET affiliate_payout_id = payout_id
      WHERE id = ANY(_commission_ids)
        AND affiliate_profile_id = _affiliate_profile_id
        AND status IN ('approved','pending');
  END IF;

  INSERT INTO public.admin_audit_log (actor_id, action, resource_type, resource_id, details)
  VALUES (auth.uid(), 'create', 'affiliate_payouts', payout_id::text,
          jsonb_build_object('amount', _amount, 'method', _payout_method,
                             'affiliate_profile_id', _affiliate_profile_id));

  RETURN payout_id;
END $function$;

CREATE OR REPLACE FUNCTION public.admin_mark_payout_paid(
  _payout_id uuid,
  _reference text DEFAULT NULL::text,
  _payout_method text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE p RECORD; affiliate_user UUID;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Only admins can mark payouts paid';
  END IF;

  PERFORM public.assert_admin_write_rate_limit(auth.uid(), 50);

  SELECT * INTO p FROM public.affiliate_payouts WHERE id = _payout_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payout not found'; END IF;
  IF p.status = 'paid' THEN RAISE EXCEPTION 'Payout is already marked paid'; END IF;

  UPDATE public.affiliate_payouts
    SET status='paid',
        payout_date = COALESCE(payout_date, now()),
        reference = COALESCE(_reference, reference),
        payout_method = COALESCE(_payout_method, payout_method)
    WHERE id = _payout_id;

  UPDATE public.affiliate_commissions
    SET status='paid', paid_date = now()
    WHERE affiliate_payout_id = _payout_id;

  INSERT INTO public.admin_audit_log (actor_id, action, resource_type, resource_id, details)
  VALUES (auth.uid(), 'update', 'affiliate_payouts', _payout_id::text,
          jsonb_build_object('status', 'paid', 'amount', p.amount, 'reference', _reference));

  SELECT user_id INTO affiliate_user FROM public.affiliate_profiles WHERE id = p.affiliate_profile_id;
  IF affiliate_user IS NOT NULL THEN
    PERFORM public.enqueue_notification(
      affiliate_user, 'affiliate_payout_paid',
      'Payout sent: $' || to_char(p.amount, 'FM999999990.00'),
      'Your affiliate payout has been marked as paid.',
      '/affiliate/dashboard',
      jsonb_build_object('payout_id', _payout_id, 'amount', p.amount)
    );
  END IF;
END $function$;

REVOKE EXECUTE ON FUNCTION public.admin_create_payout(uuid, numeric, text, text, text, uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_mark_payout_paid(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_payout(uuid, numeric, text, text, text, uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_mark_payout_paid(uuid, text, text) TO authenticated, service_role;

-- Affiliate settings: restrict direct reads to admins and active affiliates
DROP POLICY IF EXISTS "settings readable by authenticated" ON public.affiliate_settings;

CREATE POLICY "settings readable by admins and active affiliates"
ON public.affiliate_settings
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.affiliate_profiles ap
    WHERE ap.user_id = auth.uid() AND ap.status = 'active'
  )
);

CREATE OR REPLACE FUNCTION public.get_affiliate_public_settings()
RETURNS TABLE(
  program_enabled boolean,
  cookie_duration_days integer,
  default_commission_type public.affiliate_commission_type,
  default_commission_rate numeric,
  minimum_payout_threshold numeric,
  affiliate_terms text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT s.program_enabled, s.cookie_duration_days, s.default_commission_type,
         s.default_commission_rate, s.minimum_payout_threshold, s.affiliate_terms
  FROM public.affiliate_settings s
  WHERE s.id = 1;
$$;

REVOKE ALL ON FUNCTION public.get_affiliate_public_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_affiliate_public_settings() TO anon, authenticated;

CREATE TABLE public.subscribers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  subscribed boolean not null default false,
  subscription_tier text,
  billing_interval text,
  subscription_status text,
  price_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT ON public.subscribers TO authenticated;
GRANT ALL ON public.subscribers TO service_role;
ALTER TABLE public.subscribers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own subscription readable" ON public.subscribers FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE TABLE public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_session_id text unique,
  stripe_payment_intent_id text,
  pack_key text not null,
  pack_label text,
  quantity integer not null default 1,
  credits_granted integer not null default 0,
  amount_total integer not null default 0,
  currency text not null default 'usd',
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT ON public.purchases TO authenticated;
GRANT ALL ON public.purchases TO service_role;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own purchases readable" ON public.purchases FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_purchases_user ON public.purchases(user_id, created_at DESC);

CREATE TABLE public.usage_credits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  application_credits integer not null default 0,
  interview_credits integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT ON public.usage_credits TO authenticated;
GRANT ALL ON public.usage_credits TO service_role;
ALTER TABLE public.usage_credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own credits readable" ON public.usage_credits FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_subscribers_updated BEFORE UPDATE ON public.subscribers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_purchases_updated BEFORE UPDATE ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_usage_credits_updated BEFORE UPDATE ON public.usage_credits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.interview_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_role TEXT,
  duration_sec INTEGER NOT NULL DEFAULT 0,
  overall_score INTEGER,
  report JSONB NOT NULL,
  integrity JSONB,
  transcript JSONB,
  practice_plan JSONB,
  focus_areas TEXT[],
  pdf_path TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.interview_sessions TO authenticated;
GRANT ALL ON public.interview_sessions TO service_role;

ALTER TABLE public.interview_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own interview sessions"
ON public.interview_sessions FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_interview_sessions_user_created ON public.interview_sessions(user_id, created_at DESC);

CREATE POLICY "Users read own interview report files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'interview-reports' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users upload own interview report files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'interview-reports' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users update own interview report files"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'interview-reports' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users delete own interview report files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'interview-reports' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE TABLE IF NOT EXISTS public.company_research (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key text NOT NULL UNIQUE,
  company text NOT NULL,
  role text,
  payload jsonb NOT NULL,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  provider text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.company_research TO authenticated;
GRANT ALL ON public.company_research TO service_role;

ALTER TABLE public.company_research ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read cached research" ON public.company_research;
CREATE POLICY "Authenticated users can read cached research"
ON public.company_research FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS company_research_created_idx ON public.company_research (created_at DESC);

ALTER TABLE public.tracked_jobs ADD COLUMN IF NOT EXISTS details jsonb;

CREATE TABLE public.user_integrations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  provider text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'connected',
  last_synced_at timestamptz,
  last_error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_integrations TO authenticated;
GRANT ALL ON public.user_integrations TO service_role;

ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own integrations"
ON public.user_integrations FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_user_integrations_updated
BEFORE UPDATE ON public.user_integrations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Restrict affiliate_settings direct reads to admins only.
DROP POLICY IF EXISTS "settings readable by admins and active affiliates" ON public.affiliate_settings;
CREATE POLICY "settings readable by admins only"
ON public.affiliate_settings FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Cached company research is written and read only by the backend function.
DROP POLICY IF EXISTS "Authenticated users can read cached research" ON public.company_research;
REVOKE SELECT ON public.company_research FROM authenticated;
CREATE POLICY "Admins can read cached research"
ON public.company_research FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));
GRANT SELECT ON public.company_research TO authenticated;

-- Remove blanket PUBLIC execute on all SECURITY DEFINER functions in public schema
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
  END LOOP;
END $$;

-- Referral attribution requires an authenticated user; anon must not call it
REVOKE EXECUTE ON FUNCTION public.attribute_signup_referral(text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.attribute_signup_referral(text, uuid) TO authenticated;

-- Public referral-link validation + public program terms stay reachable for visitors
GRANT EXECUTE ON FUNCTION public.lookup_affiliate_by_code(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_affiliate_public_settings() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.affiliate_click_is_valid(uuid, text) TO anon, authenticated;

-- Admin-gated functions: signed-in only (each re-checks has_role internally)
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_audit_actors() TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_admin_access(text, text, integer, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_payout(uuid, numeric, text, text, text, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_payout_paid(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_affiliate_application(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_affiliate_application(uuid, text) TO authenticated;

-- Internal-only helpers: service_role / trigger context only
REVOKE EXECUTE ON FUNCTION public.assert_admin_write_rate_limit(uuid, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_notification(uuid, text, text, text, text, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_admins(text, text, text, text, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_affiliate_code() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_conversion_commission(uuid, numeric, public.affiliate_conversion_type, text) FROM anon, authenticated;

-- Environment separation
ALTER TABLE public.subscribers ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'sandbox';
ALTER TABLE public.purchases   ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'sandbox';
ALTER TABLE public.usage_credits ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'sandbox';

-- Monthly feature usage
CREATE TABLE IF NOT EXISTS public.feature_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  feature text NOT NULL,
  environment text NOT NULL DEFAULT 'sandbox',
  period_start date NOT NULL,
  used integer NOT NULL DEFAULT 0,
  credits_used integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, feature, environment, period_start)
);

GRANT SELECT ON public.feature_usage TO authenticated;
GRANT ALL ON public.feature_usage TO service_role;

ALTER TABLE public.feature_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own feature usage"
  ON public.feature_usage FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_feature_usage_updated
  BEFORE UPDATE ON public.feature_usage
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.current_plan_tier(_user_id uuid, _env text DEFAULT 'live')
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN s.user_id IS NULL THEN 'free'
    WHEN s.subscription_status IN ('active','trialing','past_due')
      AND (s.current_period_end IS NULL OR s.current_period_end > now())
      THEN COALESCE(lower(s.subscription_tier), 'free')
    WHEN s.subscription_status IN ('canceled','paused')
      AND s.current_period_end > now()
      THEN COALESCE(lower(s.subscription_tier), 'free')
    ELSE 'free'
  END
  FROM (SELECT * FROM public.subscribers WHERE user_id = _user_id AND environment = _env LIMIT 1) s
  RIGHT JOIN (SELECT 1) dummy ON true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.has_active_subscription(_user_id uuid, _env text DEFAULT 'live')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.current_plan_tier(_user_id, _env) IN ('starter','pro');
$$;

CREATE OR REPLACE FUNCTION public.plan_allowance(_tier text, _feature text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE lower(_tier)
    WHEN 'pro' THEN NULL::integer
    WHEN 'starter' THEN CASE _feature
      WHEN 'resume' THEN 20 WHEN 'application' THEN 10 WHEN 'interview' THEN 8 ELSE 20 END
    ELSE CASE _feature
      WHEN 'resume' THEN 3 WHEN 'application' THEN 1 WHEN 'interview' THEN 2 ELSE 3 END
  END;
$$;

CREATE OR REPLACE FUNCTION public.consume_entitlement(
  _user_id uuid, _feature text, _env text DEFAULT 'live', _amount integer DEFAULT 1
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  tier text;
  allowance integer;
  period date := date_trunc('month', now())::date;
  used_now integer := 0;
  credit_col text;
  credit_balance integer := 0;
BEGIN
  IF _feature NOT IN ('resume','application','interview') THEN
    RAISE EXCEPTION 'Unknown feature %', _feature;
  END IF;
  IF _amount IS NULL OR _amount < 1 OR _amount > 10 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;

  tier := public.current_plan_tier(_user_id, _env);
  allowance := public.plan_allowance(tier, _feature);

  INSERT INTO public.feature_usage (user_id, feature, environment, period_start, used)
  VALUES (_user_id, _feature, _env, period, 0)
  ON CONFLICT (user_id, feature, environment, period_start) DO NOTHING;

  SELECT used INTO used_now FROM public.feature_usage
   WHERE user_id = _user_id AND feature = _feature AND environment = _env AND period_start = period
   FOR UPDATE;

  IF allowance IS NULL OR used_now + _amount <= allowance THEN
    UPDATE public.feature_usage SET used = used + _amount
     WHERE user_id = _user_id AND feature = _feature AND environment = _env AND period_start = period;
    RETURN jsonb_build_object('allowed', true, 'source', 'plan', 'tier', tier,
      'allowance', allowance, 'used', used_now + _amount,
      'remaining', CASE WHEN allowance IS NULL THEN NULL ELSE allowance - used_now - _amount END);
  END IF;

  credit_col := CASE _feature WHEN 'application' THEN 'application_credits'
                              WHEN 'interview' THEN 'interview_credits' ELSE NULL END;
  IF credit_col IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'quota_exceeded', 'tier', tier,
      'allowance', allowance, 'used', used_now, 'credits', 0);
  END IF;

  EXECUTE format(
    'SELECT COALESCE(%I,0) FROM public.usage_credits WHERE user_id = $1 AND environment = $2 FOR UPDATE', credit_col)
    INTO credit_balance USING _user_id, _env;

  IF credit_balance < _amount THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'no_credits', 'tier', tier,
      'allowance', allowance, 'used', used_now, 'credits', credit_balance);
  END IF;

  EXECUTE format(
    'UPDATE public.usage_credits SET %I = %I - $3 WHERE user_id = $1 AND environment = $2', credit_col, credit_col)
    USING _user_id, _env, _amount;

  UPDATE public.feature_usage SET used = used + _amount, credits_used = credits_used + _amount
   WHERE user_id = _user_id AND feature = _feature AND environment = _env AND period_start = period;

  RETURN jsonb_build_object('allowed', true, 'source', 'credits', 'tier', tier,
    'allowance', allowance, 'used', used_now + _amount, 'credits', credit_balance - _amount);
END $$;

CREATE OR REPLACE FUNCTION public.entitlement_snapshot(_env text DEFAULT 'live')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  tier text;
  period date := date_trunc('month', now())::date;
  result jsonb := '{}'::jsonb;
  f text;
  allowance integer;
  used_now integer;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('tier','free'); END IF;
  tier := public.current_plan_tier(uid, _env);

  FOREACH f IN ARRAY ARRAY['resume','application','interview'] LOOP
    allowance := public.plan_allowance(tier, f);
    SELECT COALESCE(used,0) INTO used_now FROM public.feature_usage
     WHERE user_id = uid AND feature = f AND environment = _env AND period_start = period;
    used_now := COALESCE(used_now, 0);
    result := result || jsonb_build_object(f, jsonb_build_object(
      'allowance', allowance, 'used', used_now,
      'remaining', CASE WHEN allowance IS NULL THEN NULL ELSE GREATEST(allowance - used_now, 0) END));
  END LOOP;

  RETURN jsonb_build_object('tier', tier, 'features', result);
END $$;

REVOKE ALL ON FUNCTION public.consume_entitlement(uuid, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.current_plan_tier(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.plan_allowance(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_entitlement(uuid, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.current_plan_tier(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_active_subscription(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.entitlement_snapshot(text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.has_active_subscription(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.entitlement_snapshot(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_active_subscription(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.entitlement_snapshot(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.current_plan_tier(_user_id uuid, _env text DEFAULT 'live')
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s RECORD;
BEGIN
  SELECT subscription_status, subscription_tier, current_period_end
    INTO s
    FROM public.subscribers
   WHERE user_id = _user_id AND environment = _env
   ORDER BY updated_at DESC NULLS LAST
   LIMIT 1;

  IF NOT FOUND OR s.subscription_tier IS NULL THEN
    RETURN 'free';
  END IF;

  IF s.subscription_status IN ('active','trialing','past_due')
     AND (s.current_period_end IS NULL OR s.current_period_end > now()) THEN
    RETURN lower(s.subscription_tier);
  END IF;

  IF s.subscription_status IN ('canceled','paused')
     AND s.current_period_end IS NOT NULL AND s.current_period_end > now() THEN
    RETURN lower(s.subscription_tier);
  END IF;

  RETURN 'free';
END $$;

REVOKE ALL ON FUNCTION public.current_plan_tier(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_plan_tier(uuid, text) TO service_role;