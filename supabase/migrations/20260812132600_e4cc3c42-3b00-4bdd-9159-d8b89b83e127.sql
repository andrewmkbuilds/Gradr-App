-- Resolve the single best discount available to a user for a plan/interval.
CREATE OR REPLACE FUNCTION public.best_discount_for(
  _user_id uuid,
  _plan text DEFAULT NULL,
  _interval text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  best RECORD;
  allow_stack boolean := false;
  total numeric := 0;
  parts jsonb := '[]'::jsonb;
  r RECORD;
BEGIN
  IF _user_id IS NULL THEN RETURN jsonb_build_object('percentage', 0); END IF;

  SELECT allow_stacking INTO allow_stack FROM public.discount_settings WHERE id = 1;

  FOR r IN
    SELECT dr.id, dr.name, dr.percentage, dr.eligibility_type, dr.stackable
      FROM public.discount_rules dr
      JOIN public.eligibility_categories ec ON ec.key = dr.eligibility_type
      JOIN public.eligibility_verifications ev
        ON ev.eligibility_type = dr.eligibility_type AND ev.user_id = _user_id
     WHERE dr.active
       AND ec.active
       AND (dr.starts_at IS NULL OR dr.starts_at <= now())
       AND (dr.ends_at IS NULL OR dr.ends_at > now())
       AND (dr.max_redemptions IS NULL OR dr.redemption_count < dr.max_redemptions)
       AND (_plan IS NULL OR _plan = ANY(dr.applicable_plans))
       AND (_interval IS NULL OR _interval = ANY(dr.applicable_intervals))
       AND ev.status = 'verified'
       AND (ev.expires_at IS NULL OR ev.expires_at > now())
     ORDER BY dr.percentage DESC
  LOOP
    IF NOT allow_stack THEN
      -- Highest single discount wins.
      RETURN jsonb_build_object(
        'percentage', r.percentage,
        'rule_id', r.id,
        'rule_name', r.name,
        'eligibility_type', r.eligibility_type);
    END IF;

    IF total = 0 OR r.stackable THEN
      total := LEAST(total + r.percentage, 100);
      parts := parts || jsonb_build_object('rule_id', r.id, 'name', r.name,
                                           'percentage', r.percentage,
                                           'eligibility_type', r.eligibility_type);
    END IF;
  END LOOP;

  IF total = 0 THEN RETURN jsonb_build_object('percentage', 0); END IF;
  RETURN jsonb_build_object('percentage', total, 'stacked', parts);
END $$;

REVOKE EXECUTE ON FUNCTION public.best_discount_for(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.best_discount_for(uuid, text, text) TO service_role;

-- Snapshot of the caller's own eligibility + available discounts.
CREATE OR REPLACE FUNCTION public.my_eligibility_state()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  verifications jsonb := '[]'::jsonb;
  best jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', ev.id,
           'eligibility_type', ev.eligibility_type,
           'label', ec.label,
           'status', CASE WHEN ev.status = 'verified'
                            AND ev.expires_at IS NOT NULL
                            AND ev.expires_at <= now()
                          THEN 'expired' ELSE ev.status END,
           'provider', ev.provider,
           'verified_at', ev.verified_at,
           'expires_at', ev.expires_at,
           'failure_reason', ev.failure_reason,
           'discount_percent', ec.default_discount_percent
         ) ORDER BY ec.sort_order), '[]'::jsonb)
    INTO verifications
    FROM public.eligibility_verifications ev
    JOIN public.eligibility_categories ec ON ec.key = ev.eligibility_type
   WHERE ev.user_id = uid;

  best := public.best_discount_for(uid, NULL, NULL);

  RETURN jsonb_build_object('verifications', verifications, 'best_discount', best);
END $$;

REVOKE EXECUTE ON FUNCTION public.my_eligibility_state() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_eligibility_state() TO authenticated, service_role;

-- Admin moderation of a verification.
CREATE OR REPLACE FUNCTION public.admin_review_verification(
  _verification_id uuid,
  _status text,
  _reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v RECORD;
  validity integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can review verifications';
  END IF;
  IF _status NOT IN ('verified','failed','revoked','expired','manual_review','pending') THEN
    RAISE EXCEPTION 'Unsupported verification status';
  END IF;

  PERFORM public.assert_admin_write_rate_limit(auth.uid(), 50);

  SELECT * INTO v FROM public.eligibility_verifications WHERE id = _verification_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Verification not found'; END IF;

  SELECT verification_validity_days INTO validity
    FROM public.eligibility_categories WHERE key = v.eligibility_type;

  UPDATE public.eligibility_verifications
     SET status = _status,
         verified_at = CASE WHEN _status = 'verified' THEN COALESCE(verified_at, now()) ELSE verified_at END,
         expires_at = CASE WHEN _status = 'verified'
                           THEN COALESCE(expires_at, now() + make_interval(days => COALESCE(validity, 365)))
                           WHEN _status IN ('revoked','expired') THEN now()
                           ELSE expires_at END,
         failure_reason = CASE WHEN _status IN ('failed','revoked') THEN left(COALESCE(_reason,''), 300) ELSE failure_reason END,
         reviewed_by = auth.uid(),
         last_checked_at = now()
   WHERE id = _verification_id;

  INSERT INTO public.admin_audit_log (actor_id, action, resource_type, resource_id, record_count, details)
  VALUES (auth.uid(), 'update', 'eligibility_verifications', _verification_id::text, 1,
          jsonb_build_object('status', _status, 'reason', _reason,
                             'eligibility_type', v.eligibility_type,
                             'subject_user_id', v.user_id));

  PERFORM public.enqueue_notification(
    v.user_id,
    'eligibility_' || _status,
    CASE _status
      WHEN 'verified' THEN 'Your eligibility was approved'
      WHEN 'failed' THEN 'We could not verify your eligibility'
      WHEN 'revoked' THEN 'Your eligibility discount was revoked'
      ELSE 'Your eligibility status changed' END,
    COALESCE(_reason, 'See your eligibility settings for details.'),
    '/settings?tab=eligibility',
    jsonb_build_object('verification_id', _verification_id, 'status', _status)
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_review_verification(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_verification(uuid, text, text) TO authenticated, service_role;

-- Maintenance: expire verifications that are past their validity window.
CREATE OR REPLACE FUNCTION public.expire_stale_verifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE n integer := 0;
BEGIN
  UPDATE public.eligibility_verifications
     SET status = 'expired', last_checked_at = now()
   WHERE status = 'verified'
     AND expires_at IS NOT NULL
     AND expires_at <= now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE EXECUTE ON FUNCTION public.expire_stale_verifications() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_verifications() TO service_role;

-- Record a discount actually used at checkout (server processes only).
CREATE OR REPLACE FUNCTION public.record_discount_redemption(
  _user_id uuid,
  _rule_id uuid,
  _eligibility_type text,
  _percentage numeric,
  _plan text,
  _interval text,
  _env text,
  _transaction_id text,
  _subscription_id text,
  _gross numeric,
  _discount numeric,
  _net numeric,
  _currency text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE new_id uuid;
BEGIN
  INSERT INTO public.discount_redemptions
    (user_id, discount_rule_id, eligibility_type, percentage, plan, interval, environment,
     transaction_id, subscription_id, gross_amount, discount_amount, net_amount, currency)
  VALUES
    (_user_id, _rule_id, _eligibility_type, _percentage, _plan, _interval, COALESCE(_env,'live'),
     _transaction_id, _subscription_id, _gross, _discount, _net, _currency)
  ON CONFLICT (transaction_id, environment) DO NOTHING
  RETURNING id INTO new_id;

  IF new_id IS NOT NULL AND _rule_id IS NOT NULL THEN
    UPDATE public.discount_rules
       SET redemption_count = redemption_count + 1
     WHERE id = _rule_id;
  END IF;

  RETURN new_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.record_discount_redemption(uuid, uuid, text, numeric, text, text, text, text, text, numeric, numeric, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_discount_redemption(uuid, uuid, text, numeric, text, text, text, text, text, numeric, numeric, numeric, text) TO service_role;

-- Trigger function should never be callable through the API.
REVOKE EXECUTE ON FUNCTION public.trg_audit_discount_config() FROM PUBLIC, anon, authenticated;