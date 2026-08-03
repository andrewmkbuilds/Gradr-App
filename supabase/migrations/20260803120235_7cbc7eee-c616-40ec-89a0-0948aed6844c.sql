-- ============================================================
-- 1. Notification helpers become backend-only (were client-callable)
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.enqueue_notification(uuid, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_notification(uuid, text, text, text, text, jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.notify_admins(text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_admins(text, text, text, text, jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.generate_affiliate_code() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_affiliate_code() TO service_role;

REVOKE EXECUTE ON FUNCTION public.trg_notify_new_application() FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 2. Admin RPCs: signed-out callers cannot even reach them
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.approve_affiliate_application(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reject_affiliate_application(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_create_payout(uuid, numeric, text, text, text, uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_mark_payout_paid(uuid, text, text) FROM PUBLIC, anon;

-- ============================================================
-- 3. Audit + throttle the money-moving admin RPCs
-- ============================================================
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