-- 1. Webhook delivery logs: make the anonymous-session exclusion explicit in the predicate.
DROP POLICY IF EXISTS "Admins read webhook delivery logs" ON public.webhook_delivery_logs;
CREATE POLICY "Admins read webhook delivery logs"
ON public.webhook_delivery_logs
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  AND NOT public.is_anonymous_session()
  AND public.has_role(auth.uid(), 'admin'::app_role)
);

-- 2. admin_review_verification_request: backend-only. Accept an explicit actor so the
--    service-role edge function can call it, and revoke EXECUTE from signed-in users.
CREATE OR REPLACE FUNCTION public.admin_review_verification_request(
  _request_id uuid,
  _decision text,
  _notes text DEFAULT NULL::text,
  _discount_percentage numeric DEFAULT NULL::numeric,
  _actor_id uuid DEFAULT NULL::uuid
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  actor uuid := coalesce(auth.uid(), _actor_id);
  req RECORD;
  cat RECORD;
  pct numeric;
  validity integer;
BEGIN
  -- _actor_id may only be supplied by trusted server-side (service_role) callers.
  IF auth.uid() IS NULL AND current_setting('role', true) IS DISTINCT FROM 'service_role'
     AND current_user <> 'service_role' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF actor IS NULL OR NOT public.has_role(actor, 'admin') THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;
  PERFORM public.assert_admin_write_rate_limit(actor, 100);

  IF _decision NOT IN ('approved','rejected','needs_more_information') THEN
    RAISE EXCEPTION 'Invalid decision';
  END IF;

  SELECT * INTO req FROM public.verification_requests WHERE id = _request_id FOR UPDATE;
  IF req IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;

  SELECT label, default_discount_percent, verification_validity_days
    INTO cat FROM public.eligibility_categories WHERE key = req.category;

  pct := GREATEST(LEAST(coalesce(_discount_percentage, cat.default_discount_percent, 0), 100), 0);
  validity := coalesce(cat.verification_validity_days, 365);

  UPDATE public.verification_requests
     SET status = _decision,
         reviewer_notes = nullif(trim(coalesce(_notes,'')),''),
         reviewed_by = actor,
         reviewed_at = now(),
         discount_percentage = CASE WHEN _decision = 'approved' THEN pct ELSE discount_percentage END
   WHERE id = _request_id;

  UPDATE public.verification_appeals
     SET status = 'reviewed', reviewed_at = now(),
         reviewer_notes = nullif(trim(coalesce(_notes,'')),'')
   WHERE request_id = _request_id AND status = 'submitted';

  INSERT INTO public.verification_request_events
    (request_id, user_id, actor_id, actor_role, event, from_status, to_status, notes, metadata)
  VALUES
    (_request_id, req.user_id, actor, 'admin', 'decision_recorded', req.status, _decision,
     nullif(trim(coalesce(_notes,'')),''),
     jsonb_build_object('discount_percentage', CASE WHEN _decision = 'approved' THEN pct ELSE NULL END));

  IF _decision = 'approved' THEN
    INSERT INTO public.eligibility_verifications
      (user_id, eligibility_type, provider, provider_reference_id, status,
       verified_at, expires_at, last_checked_at, failure_reason, reviewed_by, metadata)
    VALUES (req.user_id, req.category, 'gradr_review', _request_id::text, 'verified',
            now(), now() + make_interval(days => validity), now(), NULL, actor,
            jsonb_build_object('request_id', _request_id, 'discount_percentage', pct))
    ON CONFLICT (user_id, eligibility_type) DO UPDATE
      SET provider = 'gradr_review',
          provider_reference_id = _request_id::text,
          status = 'verified',
          verified_at = now(),
          expires_at = now() + make_interval(days => validity),
          last_checked_at = now(),
          failure_reason = NULL,
          reviewed_by = actor,
          metadata = jsonb_build_object('request_id', _request_id, 'discount_percentage', pct);

    PERFORM public.enqueue_notification(
      req.user_id, 'verification_approved', 'Verification approved',
      CASE WHEN pct > 0
        THEN cat.label || ' verified — ' || trim(to_char(pct,'FM999990.99')) || '% off is now applied at checkout.'
        ELSE cat.label || ' verified.' END,
      '/settings#eligibility', jsonb_build_object('request_id', _request_id));

  ELSIF _decision = 'rejected' THEN
    UPDATE public.eligibility_verifications
       SET status = 'failed', failure_reason = nullif(trim(coalesce(_notes,'')),''),
           verified_at = NULL, expires_at = NULL, reviewed_by = actor, last_checked_at = now()
     WHERE user_id = req.user_id AND eligibility_type = req.category;

    PERFORM public.enqueue_notification(
      req.user_id, 'verification_rejected', 'Verification not approved',
      coalesce(nullif(trim(coalesce(_notes,'')),''),
               'We could not confirm your eligibility. You can appeal with more evidence.'),
      '/settings#eligibility', jsonb_build_object('request_id', _request_id));
  ELSE
    PERFORM public.enqueue_notification(
      req.user_id, 'verification_needs_info', 'More information needed',
      coalesce(nullif(trim(coalesce(_notes,'')),''),
               'A reviewer needs a little more detail before deciding.'),
      '/settings#eligibility', jsonb_build_object('request_id', _request_id));
  END IF;
END;
$function$;

DROP FUNCTION IF EXISTS public.admin_review_verification_request(uuid, text, text, numeric);

REVOKE ALL ON FUNCTION public.admin_review_verification_request(uuid, text, text, numeric, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_verification_request(uuid, text, text, numeric, uuid) TO service_role;