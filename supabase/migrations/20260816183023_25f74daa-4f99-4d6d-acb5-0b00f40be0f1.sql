CREATE OR REPLACE FUNCTION public.refund_entitlement(
  _user_id uuid, _feature text, _env text DEFAULT 'live', _amount integer DEFAULT 1
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  period date := date_trunc('month', now())::date;
  row_used integer;
  row_credits integer;
  credit_col text;
BEGIN
  IF _feature NOT IN ('resume','application','interview') THEN RETURN; END IF;
  IF _amount IS NULL OR _amount < 1 OR _amount > 10 THEN RETURN; END IF;

  SELECT used, credits_used INTO row_used, row_credits
    FROM public.feature_usage
   WHERE user_id = _user_id AND feature = _feature AND environment = _env AND period_start = period
   FOR UPDATE;

  IF NOT FOUND THEN RETURN; END IF;

  UPDATE public.feature_usage
     SET used = GREATEST(used - _amount, 0),
         credits_used = GREATEST(credits_used - LEAST(_amount, row_credits), 0)
   WHERE user_id = _user_id AND feature = _feature AND environment = _env AND period_start = period;

  IF row_credits >= _amount THEN
    credit_col := CASE _feature WHEN 'application' THEN 'application_credits'
                                WHEN 'interview' THEN 'interview_credits' ELSE NULL END;
    IF credit_col IS NOT NULL THEN
      EXECUTE format(
        'UPDATE public.usage_credits SET %I = %I + $3 WHERE user_id = $1 AND environment = $2',
        credit_col, credit_col) USING _user_id, _env, _amount;
    END IF;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.refund_entitlement(uuid, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_entitlement(uuid, text, text, integer) TO service_role;

ALTER TABLE public.subscribers DROP CONSTRAINT IF EXISTS subscribers_user_id_key;
ALTER TABLE public.subscribers ADD CONSTRAINT subscribers_user_id_environment_key UNIQUE (user_id, environment);

ALTER TABLE public.usage_credits DROP CONSTRAINT IF EXISTS usage_credits_user_id_key;
ALTER TABLE public.usage_credits ADD CONSTRAINT usage_credits_user_id_environment_key UNIQUE (user_id, environment);

CREATE OR REPLACE FUNCTION public.has_active_subscription(_user_id uuid, _env text DEFAULT 'live'::text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF auth.uid() <> _user_id AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized to read another user''s subscription';
  END IF;
  RETURN public.current_plan_tier(_user_id, _env) IN ('starter','pro');
END $$;

REVOKE ALL ON FUNCTION public.has_active_subscription(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_active_subscription(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_audit_actors() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_create_payout(uuid, numeric, text, text, text, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_mark_payout_paid(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approve_affiliate_application(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_affiliate_application(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.attribute_signup_referral(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.entitlement_snapshot(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.log_admin_access(text, text, integer, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assert_admin_write_rate_limit(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_entitlement(uuid, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_entitlement(uuid, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.current_plan_tier(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_notification(uuid, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_admins(text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_conversion_commission(uuid, numeric, public.affiliate_conversion_type, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_affiliate_code() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_audit_actors() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_payout(uuid, numeric, text, text, text, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_payout_paid(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_affiliate_application(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_affiliate_application(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.attribute_signup_referral(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.entitlement_snapshot(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_admin_access(text, text, integer, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

DROP POLICY IF EXISTS "Users can view their own resumes" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own resumes" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own resumes" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own resumes" ON storage.objects;
DROP POLICY IF EXISTS "Users read own interview report files" ON storage.objects;
DROP POLICY IF EXISTS "Users update own interview report files" ON storage.objects;
DROP POLICY IF EXISTS "Users delete own interview report files" ON storage.objects;
DROP POLICY IF EXISTS "Users upload own interview report files" ON storage.objects;

CREATE POLICY "Users can view their own resumes" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'resumes'
    AND (auth.uid())::text = (storage.foldername(name))[1]
    AND COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

CREATE POLICY "Users can upload their own resumes" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'resumes'
    AND (auth.uid())::text = (storage.foldername(name))[1]
    AND COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

CREATE POLICY "Users can update their own resumes" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'resumes'
    AND (auth.uid())::text = (storage.foldername(name))[1]
    AND COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

CREATE POLICY "Users can delete their own resumes" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'resumes'
    AND (auth.uid())::text = (storage.foldername(name))[1]
    AND COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

CREATE POLICY "Users read own interview report files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'interview-reports'
    AND (storage.foldername(name))[1] = (auth.uid())::text
    AND COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

CREATE POLICY "Users upload own interview report files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'interview-reports'
    AND (storage.foldername(name))[1] = (auth.uid())::text
    AND COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

CREATE POLICY "Users update own interview report files" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'interview-reports'
    AND (storage.foldername(name))[1] = (auth.uid())::text
    AND COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

CREATE POLICY "Users delete own interview report files" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'interview-reports'
    AND (storage.foldername(name))[1] = (auth.uid())::text
    AND COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

CREATE TABLE public.security_audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category text NOT NULL CHECK (category IN ('billing_webhook','entitlement_check','ai_authorization')),
  event text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('allowed','denied','received','processed','failed')),
  user_id uuid,
  feature text,
  environment text,
  reason text,
  source text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.security_audit_log TO authenticated;
GRANT ALL ON public.security_audit_log TO service_role;

ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own security events"
  ON public.security_audit_log FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins read all security events"
  ON public.security_audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX security_audit_log_created_idx ON public.security_audit_log (created_at DESC);
CREATE INDEX security_audit_log_user_idx ON public.security_audit_log (user_id, created_at DESC);
CREATE INDEX security_audit_log_category_idx ON public.security_audit_log (category, created_at DESC);

CREATE OR REPLACE FUNCTION public.record_security_event(
  _category text, _event text, _decision text, _user_id uuid DEFAULT NULL,
  _feature text DEFAULT NULL, _env text DEFAULT NULL, _reason text DEFAULT NULL,
  _source text DEFAULT NULL, _details jsonb DEFAULT '{}'::jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE new_id uuid;
BEGIN
  INSERT INTO public.security_audit_log
    (category, event, decision, user_id, feature, environment, reason, source, details)
  VALUES (_category, _event, _decision, _user_id, _feature, _env, _reason, _source,
          COALESCE(_details, '{}'::jsonb))
  RETURNING id INTO new_id;
  RETURN new_id;
END $function$;

REVOKE ALL ON FUNCTION public.record_security_event(text, text, text, uuid, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_security_event(text, text, text, uuid, text, text, text, text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.consume_entitlement(_user_id uuid, _feature text, _env text DEFAULT 'live'::text, _amount integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  tier text;
  allowance integer;
  period date := date_trunc('month', now())::date;
  used_now integer := 0;
  credit_col text;
  credit_balance integer := 0;
  result jsonb;
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
    result := jsonb_build_object('allowed', true, 'source', 'plan', 'tier', tier,
      'allowance', allowance, 'used', used_now + _amount,
      'remaining', CASE WHEN allowance IS NULL THEN NULL ELSE allowance - used_now - _amount END);
    PERFORM public.record_security_event('entitlement_check', 'consume', 'allowed', _user_id,
      _feature, _env, 'plan_allowance', 'consume_entitlement', result);
    RETURN result;
  END IF;

  credit_col := CASE _feature WHEN 'application' THEN 'application_credits'
                              WHEN 'interview' THEN 'interview_credits' ELSE NULL END;
  IF credit_col IS NULL THEN
    result := jsonb_build_object('allowed', false, 'reason', 'quota_exceeded', 'tier', tier,
      'allowance', allowance, 'used', used_now, 'credits', 0);
    PERFORM public.record_security_event('entitlement_check', 'consume', 'denied', _user_id,
      _feature, _env, 'quota_exceeded', 'consume_entitlement', result);
    RETURN result;
  END IF;

  EXECUTE format(
    'SELECT COALESCE(%I,0) FROM public.usage_credits WHERE user_id = $1 AND environment = $2 FOR UPDATE', credit_col)
    INTO credit_balance USING _user_id, _env;

  IF credit_balance < _amount THEN
    result := jsonb_build_object('allowed', false, 'reason', 'no_credits', 'tier', tier,
      'allowance', allowance, 'used', used_now, 'credits', credit_balance);
    PERFORM public.record_security_event('entitlement_check', 'consume', 'denied', _user_id,
      _feature, _env, 'no_credits', 'consume_entitlement', result);
    RETURN result;
  END IF;

  EXECUTE format(
    'UPDATE public.usage_credits SET %I = %I - $3 WHERE user_id = $1 AND environment = $2', credit_col, credit_col)
    USING _user_id, _env, _amount;

  UPDATE public.feature_usage SET used = used + _amount, credits_used = credits_used + _amount
   WHERE user_id = _user_id AND feature = _feature AND environment = _env AND period_start = period;

  result := jsonb_build_object('allowed', true, 'source', 'credits', 'tier', tier,
    'allowance', allowance, 'used', used_now + _amount, 'credits', credit_balance - _amount);
  PERFORM public.record_security_event('entitlement_check', 'consume', 'allowed', _user_id,
    _feature, _env, 'credit_pack', 'consume_entitlement', result);
  RETURN result;
END $function$;

-- Paddle customer mirror
CREATE TABLE IF NOT EXISTS public.paddle_customers (
  customer_id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text NOT NULL,
  environment text NOT NULL DEFAULT 'sandbox',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.paddle_customers TO authenticated;
GRANT ALL ON public.paddle_customers TO service_role;
ALTER TABLE public.paddle_customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own paddle customer" ON public.paddle_customers;
CREATE POLICY "Users read own paddle customer"
  ON public.paddle_customers FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.paddle_subscriptions (
  subscription_id text PRIMARY KEY,
  customer_id text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL,
  price_id text NOT NULL,
  product_id text NOT NULL,
  scheduled_change_action text,
  scheduled_change_at timestamptz,
  current_period_end timestamptz,
  environment text NOT NULL DEFAULT 'sandbox',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_paddle_subscriptions_user
  ON public.paddle_subscriptions(user_id, environment);
CREATE INDEX IF NOT EXISTS idx_paddle_subscriptions_customer
  ON public.paddle_subscriptions(customer_id);

GRANT SELECT ON public.paddle_subscriptions TO authenticated;
GRANT ALL ON public.paddle_subscriptions TO service_role;
ALTER TABLE public.paddle_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own paddle subscriptions" ON public.paddle_subscriptions;
CREATE POLICY "Users read own paddle subscriptions"
  ON public.paddle_subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP TRIGGER IF EXISTS trg_paddle_customers_updated ON public.paddle_customers;
CREATE TRIGGER trg_paddle_customers_updated
  BEFORE UPDATE ON public.paddle_customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_paddle_subscriptions_updated ON public.paddle_subscriptions;
CREATE TRIGGER trg_paddle_subscriptions_updated
  BEFORE UPDATE ON public.paddle_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.subscription_grants_access(
  _status text, _current_period_end timestamptz
) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN lower(_status) IN ('active', 'trialing', 'past_due') THEN true
    WHEN lower(_status) = 'canceled'
      THEN _current_period_end IS NOT NULL AND _current_period_end > now()
    ELSE false
  END;
$$;

REVOKE ALL ON FUNCTION public.subscription_grants_access(text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.subscription_grants_access(text, timestamptz) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.plan_allowance(_tier text, _feature text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE lower(_tier)
    WHEN 'advanced' THEN NULL::integer
    WHEN 'pro' THEN NULL::integer
    WHEN 'starter' THEN CASE _feature
      WHEN 'resume' THEN 20 WHEN 'application' THEN 10 WHEN 'interview' THEN 8 ELSE 20 END
    ELSE CASE _feature
      WHEN 'resume' THEN 3 WHEN 'application' THEN 1 WHEN 'interview' THEN 2 ELSE 3 END
  END;
$$;

-- Interview session metrics
CREATE TABLE public.interview_session_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_id uuid,
  provider text NOT NULL DEFAULT 'gemini_live',
  target_role text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_sec integer NOT NULL DEFAULT 0,
  minutes_used numeric NOT NULL DEFAULT 0,
  barge_in_count integer NOT NULL DEFAULT 0,
  interruption_count integer NOT NULL DEFAULT 0,
  dropout_count integer NOT NULL DEFAULT 0,
  reconnect_count integer NOT NULL DEFAULT 0,
  turn_count integer NOT NULL DEFAULT 0,
  first_token_latency_ms integer,
  avg_latency_ms integer,
  p95_latency_ms integer,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  end_reason text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interview_session_metrics TO authenticated;
GRANT ALL ON public.interview_session_metrics TO service_role;
ALTER TABLE public.interview_session_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own metrics select" ON public.interview_session_metrics FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own metrics insert" ON public.interview_session_metrics FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own metrics update" ON public.interview_session_metrics FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own metrics delete" ON public.interview_session_metrics FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX idx_ism_user_started ON public.interview_session_metrics(user_id, started_at DESC);
CREATE TRIGGER trg_ism_updated BEFORE UPDATE ON public.interview_session_metrics
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Resumable live session state
CREATE TABLE public.interview_session_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_key text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  persona text,
  difficulty text,
  target_role text,
  turn_index integer NOT NULL DEFAULT 0,
  interviewer_state text NOT NULL DEFAULT 'idle',
  transcript jsonb NOT NULL DEFAULT '[]'::jsonb,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  elapsed_sec integer NOT NULL DEFAULT 0,
  last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, session_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interview_session_state TO authenticated;
GRANT ALL ON public.interview_session_state TO service_role;
ALTER TABLE public.interview_session_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own state select" ON public.interview_session_state FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own state insert" ON public.interview_session_state FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own state update" ON public.interview_session_state FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own state delete" ON public.interview_session_state FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER trg_iss_updated BEFORE UPDATE ON public.interview_session_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Scheduled interviews (manual + Google Calendar imports)
CREATE TABLE public.scheduled_interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  kind text NOT NULL DEFAULT 'mock',
  target_role text,
  company text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  timezone text,
  location text,
  notes text,
  source text NOT NULL DEFAULT 'manual',
  external_event_id text,
  calendar_id text,
  html_link text,
  reminder_sent_at timestamptz,
  followup_sent_at timestamptz,
  status text NOT NULL DEFAULT 'scheduled',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source, external_event_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduled_interviews TO authenticated;
GRANT ALL ON public.scheduled_interviews TO service_role;
ALTER TABLE public.scheduled_interviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sched select" ON public.scheduled_interviews FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own sched insert" ON public.scheduled_interviews FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own sched update" ON public.scheduled_interviews FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own sched delete" ON public.scheduled_interviews FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX idx_sched_user_start ON public.scheduled_interviews(user_id, starts_at);
CREATE TRIGGER trg_sched_updated BEFORE UPDATE ON public.scheduled_interviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Email notification log
CREATE TABLE public.email_notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  template text NOT NULL,
  recipient text NOT NULL,
  subject text NOT NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'sent',
  provider_message_id text,
  error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key)
);
GRANT SELECT ON public.email_notification_log TO authenticated;
GRANT ALL ON public.email_notification_log TO service_role;
ALTER TABLE public.email_notification_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own email log select" ON public.email_notification_log FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Deduplicated discovered jobs cache
CREATE TABLE public.discovered_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key text NOT NULL,
  source text NOT NULL,
  external_id text,
  title text NOT NULL,
  company text,
  location text,
  remote boolean,
  url text NOT NULL,
  salary_min integer,
  salary_max integer,
  currency text,
  description text,
  posted_at timestamptz,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dedupe_key)
);
GRANT SELECT ON public.discovered_jobs TO authenticated;
GRANT ALL ON public.discovered_jobs TO service_role;
ALTER TABLE public.discovered_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signed in can read jobs" ON public.discovered_jobs FOR SELECT TO authenticated USING (true);
CREATE INDEX idx_discovered_last_seen ON public.discovered_jobs(last_seen_at DESC);
CREATE INDEX idx_discovered_source ON public.discovered_jobs(source);

-- Scope affiliate_campaigns + notifications policies to the authenticated role
DROP POLICY IF EXISTS "Admins can view all campaigns" ON public.affiliate_campaigns;
CREATE POLICY "Admins can view all campaigns"
ON public.affiliate_campaigns
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Affiliates manage their own campaigns" ON public.affiliate_campaigns;
CREATE POLICY "Affiliates manage their own campaigns"
ON public.affiliate_campaigns
FOR ALL
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.affiliate_profiles p
  WHERE p.id = affiliate_campaigns.affiliate_profile_id
    AND p.user_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.affiliate_profiles p
  WHERE p.id = affiliate_campaigns.affiliate_profile_id
    AND p.user_id = auth.uid()
));

DROP POLICY IF EXISTS "Admins can view all notifications" ON public.notifications;
CREATE POLICY "Admins can view all notifications"
ON public.notifications
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications"
ON public.notifications
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications"
ON public.notifications
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- user_roles: exclude anonymous (guest) sessions from reading role records.
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  AND COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
);

DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
CREATE POLICY "Admins can view all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  AND public.has_role(auth.uid(), 'admin'::app_role)
);

REVOKE ALL ON public.user_roles FROM anon;

-- Server-only audit/log tables: back the policy gap with real privileges.
REVOKE INSERT, UPDATE, DELETE ON public.digest_send_logs FROM anon, authenticated;
REVOKE SELECT ON public.digest_send_logs FROM anon;
GRANT SELECT ON public.digest_send_logs TO authenticated;
GRANT ALL ON public.digest_send_logs TO service_role;

REVOKE INSERT, UPDATE, DELETE ON public.email_notification_log FROM anon, authenticated;
REVOKE SELECT ON public.email_notification_log FROM anon;
GRANT SELECT ON public.email_notification_log TO authenticated;
GRANT ALL ON public.email_notification_log TO service_role;

-- Drop client EXECUTE on an unused SECURITY DEFINER helper.
REVOKE EXECUTE ON FUNCTION public.has_active_subscription(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE POLICY "Admins read all paddle customers"
ON public.paddle_customers FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins read all paddle subscriptions"
ON public.paddle_subscriptions FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.trg_audit_log_table_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  actor uuid := auth.uid();
  rec jsonb := to_jsonb(NEW);
  summary jsonb;
BEGIN
  summary := jsonb_strip_nulls(jsonb_build_object(
    'subject_user_id', rec->>'user_id',
    'status',          rec->>'status',
    'template',        rec->>'template',
    'recipient_domain', CASE
                          WHEN rec ? 'recipient' AND position('@' in COALESCE(rec->>'recipient','')) > 0
                          THEN split_part(rec->>'recipient', '@', 2)
                          ELSE NULL END,
    'jobs_count',      rec->>'jobs_count',
    'reminders_count', rec->>'reminders_count',
    'has_error',       CASE WHEN COALESCE(rec->>'error_message', rec->>'error') IS NOT NULL
                            THEN 'true' ELSE 'false' END,
    'previous_status', CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD)->>'status' ELSE NULL END
  ));

  INSERT INTO public.admin_audit_log
    (actor_id, action, resource_type, resource_id, record_count, details)
  VALUES (actor,
          CASE WHEN TG_OP = 'INSERT' THEN 'create' ELSE 'update' END,
          TG_TABLE_NAME, (rec->>'id'), 1, summary);

  RETURN NEW;
END $function$;

REVOKE EXECUTE ON FUNCTION public.trg_audit_log_table_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS audit_digest_send_logs_write ON public.digest_send_logs;
CREATE TRIGGER audit_digest_send_logs_write
AFTER INSERT OR UPDATE ON public.digest_send_logs
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_table_write();

DROP TRIGGER IF EXISTS audit_email_notification_log_write ON public.email_notification_log;
CREATE TRIGGER audit_email_notification_log_write
AFTER INSERT OR UPDATE ON public.email_notification_log
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_table_write();

-- legal_documents
CREATE TABLE public.legal_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type text NOT NULL CHECK (doc_type IN ('terms','privacy')),
  version integer NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  title text NOT NULL,
  content text,
  content_key text,
  summary_of_changes text,
  requires_acceptance boolean NOT NULL DEFAULT false,
  effective_date date NOT NULL DEFAULT current_date,
  published_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT legal_documents_version_unique UNIQUE (doc_type, version),
  CONSTRAINT legal_documents_body_present CHECK (
    (content IS NOT NULL AND length(btrim(content)) > 0) OR (content_key IS NOT NULL)
  )
);

CREATE UNIQUE INDEX legal_documents_one_published_per_type
  ON public.legal_documents (doc_type) WHERE status = 'published';

GRANT SELECT ON public.legal_documents TO anon;
GRANT SELECT, INSERT, UPDATE ON public.legal_documents TO authenticated;
GRANT ALL ON public.legal_documents TO service_role;

ALTER TABLE public.legal_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published legal documents are public"
  ON public.legal_documents FOR SELECT TO anon, authenticated
  USING (status = 'published');

CREATE POLICY "Admins read every legal document"
  ON public.legal_documents FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins create legal documents"
  ON public.legal_documents FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND status = 'draft');

CREATE POLICY "Admins edit draft legal documents"
  ON public.legal_documents FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND status = 'draft')
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND status = 'draft');

CREATE TRIGGER trg_legal_documents_updated
  BEFORE UPDATE ON public.legal_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- legal_acceptances
CREATE TABLE public.legal_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  document_id uuid NOT NULL REFERENCES public.legal_documents(id) ON DELETE RESTRICT,
  doc_type text NOT NULL,
  version integer NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ip_hash text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT legal_acceptances_unique UNIQUE (user_id, document_id)
);

CREATE INDEX legal_acceptances_document_idx ON public.legal_acceptances (document_id);

GRANT SELECT ON public.legal_acceptances TO authenticated;
GRANT ALL ON public.legal_acceptances TO service_role;

ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own acceptances"
  ON public.legal_acceptances FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins read all acceptances"
  ON public.legal_acceptances FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.accept_legal_document(_document_id uuid, _user_agent text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  doc RECORD;
  rec_id uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT id, doc_type, version, status INTO doc
  FROM public.legal_documents WHERE id = _document_id;

  IF NOT FOUND OR doc.status <> 'published' THEN
    RAISE EXCEPTION 'Legal document is not available for acceptance';
  END IF;

  INSERT INTO public.legal_acceptances (user_id, document_id, doc_type, version, user_agent)
  VALUES (uid, doc.id, doc.doc_type, doc.version, left(COALESCE(_user_agent, ''), 300))
  ON CONFLICT (user_id, document_id) DO NOTHING
  RETURNING id INTO rec_id;

  IF rec_id IS NULL THEN
    SELECT id INTO rec_id FROM public.legal_acceptances
     WHERE user_id = uid AND document_id = doc.id;
  END IF;

  RETURN rec_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.accept_legal_document(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_legal_document(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pending_legal_acceptances()
RETURNS TABLE(document_id uuid, doc_type text, version integer, title text, summary_of_changes text, effective_date date)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT d.id, d.doc_type, d.version, d.title, d.summary_of_changes, d.effective_date
  FROM public.legal_documents d
  WHERE d.status = 'published'
    AND d.requires_acceptance
    AND auth.uid() IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.legal_acceptances a
      WHERE a.document_id = d.id AND a.user_id = auth.uid()
    )
  ORDER BY d.doc_type;
$$;

REVOKE EXECUTE ON FUNCTION public.pending_legal_acceptances() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pending_legal_acceptances() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_publish_legal_document(_document_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE doc RECORD;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can publish legal documents';
  END IF;

  PERFORM public.assert_admin_write_rate_limit(auth.uid(), 50);

  SELECT * INTO doc FROM public.legal_documents WHERE id = _document_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Legal document not found'; END IF;
  IF doc.status = 'published' THEN RAISE EXCEPTION 'This version is already published'; END IF;
  IF doc.status = 'archived' THEN RAISE EXCEPTION 'Archived versions cannot be republished'; END IF;

  UPDATE public.legal_documents
     SET status = 'archived'
   WHERE doc_type = doc.doc_type AND status = 'published';

  UPDATE public.legal_documents
     SET status = 'published',
         published_at = now()
   WHERE id = _document_id;

  INSERT INTO public.admin_audit_log (actor_id, action, resource_type, resource_id, record_count, details)
  VALUES (auth.uid(), 'update', 'legal_documents', _document_id::text, 1,
          jsonb_build_object('doc_type', doc.doc_type, 'version', doc.version,
                             'requires_acceptance', doc.requires_acceptance,
                             'effective_date', doc.effective_date,
                             'action', 'publish'));

  RETURN _document_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_publish_legal_document(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_publish_legal_document(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_legal_document_stats()
RETURNS TABLE(document_id uuid, doc_type text, version integer, status text, accepted_count bigint, total_users bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can read legal document statistics';
  END IF;

  RETURN QUERY
  SELECT d.id, d.doc_type, d.version, d.status,
         (SELECT count(*) FROM public.legal_acceptances a WHERE a.document_id = d.id),
         (SELECT count(*) FROM public.profiles)
  FROM public.legal_documents d
  ORDER BY d.doc_type, d.version DESC;
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_legal_document_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_legal_document_stats() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_legal_pending_users(_document_id uuid, _limit integer DEFAULT 100)
RETURNS TABLE(user_id uuid, display_name text, joined_at timestamptz)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can read pending acceptance lists';
  END IF;

  RETURN QUERY
  SELECT p.user_id, p.display_name, p.created_at
  FROM public.profiles p
  WHERE NOT EXISTS (
    SELECT 1 FROM public.legal_acceptances a
    WHERE a.document_id = _document_id AND a.user_id = p.user_id
  )
  ORDER BY p.created_at DESC
  LIMIT GREATEST(LEAST(COALESCE(_limit, 100), 500), 1);
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_legal_pending_users(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_legal_pending_users(uuid, integer) TO authenticated, service_role;

-- seed v1 (bundled content)
INSERT INTO public.legal_documents
  (doc_type, version, status, title, content_key, summary_of_changes, requires_acceptance, effective_date, published_at)
VALUES
  ('terms', 1, 'published', 'Terms & Conditions', 'bundled:terms_v1',
   'Initial published version of the Gradr Terms & Conditions.', false, DATE '2026-08-12', now()),
  ('privacy', 1, 'published', 'Privacy Notice', 'bundled:privacy_v1',
   'Initial published version of the Gradr Privacy Notice.', false, DATE '2026-08-12', now());