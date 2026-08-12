-- 1. Configurable tiers ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.affiliate_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  min_referrals integer NOT NULL DEFAULT 0,
  bonus_rate numeric NOT NULL DEFAULT 0,
  color text NOT NULL DEFAULT '#22d3ee',
  perks text,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.affiliate_tiers TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.affiliate_tiers TO authenticated;
GRANT ALL ON public.affiliate_tiers TO service_role;

ALTER TABLE public.affiliate_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tiers readable by authenticated"
  ON public.affiliate_tiers FOR SELECT TO authenticated USING (true);

CREATE POLICY "tiers writable by admins"
  ON public.affiliate_tiers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_affiliate_tiers_updated
  BEFORE UPDATE ON public.affiliate_tiers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.affiliate_tiers (key, name, min_referrals, bonus_rate, color, perks, sort_order)
VALUES
  ('starter', 'Starter',  1,  0, '#38bdf8', 'Referral link, live stats and payouts', 1),
  ('rising',  'Rising',   5,  2, '#a78bfa', '+2% bonus rate and campaign link builder', 2),
  ('pro',     'Pro',      15, 5, '#f59e0b', '+5% bonus rate, priority payouts, custom assets', 3),
  ('elite',   'Elite',    30, 10, '#f43f5e', '+10% bonus rate, co-marketing and early access', 4)
ON CONFLICT (key) DO NOTHING;

-- 2. Referral / commission integrity -----------------------------------------
ALTER TABLE public.affiliate_commissions
  ADD COLUMN IF NOT EXISTS source_record_id text;

CREATE UNIQUE INDEX IF NOT EXISTS affiliate_commissions_source_uniq
  ON public.affiliate_commissions (affiliate_referral_id, source_record_id)
  WHERE source_record_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS affiliate_referrals_profile_idx
  ON public.affiliate_referrals (affiliate_profile_id, created_at DESC);

-- Backfill source_record_id from legacy `notes` usage so the guard covers history.
UPDATE public.affiliate_commissions
   SET source_record_id = notes
 WHERE source_record_id IS NULL AND notes IS NOT NULL;

CREATE OR REPLACE FUNCTION public.record_conversion_commission(
  _referred_user_id uuid,
  _source_amount numeric,
  _conversion_type affiliate_conversion_type DEFAULT 'paid_upgrade'::affiliate_conversion_type,
  _source_record_id text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  ref RECORD;
  prof RECORD;
  settings RECORD;
  tier_bonus NUMERIC := 0;
  ref_count INTEGER := 0;
  use_type public.affiliate_commission_type;
  use_rate NUMERIC;
  amount NUMERIC;
  commission_id UUID;
BEGIN
  SELECT * INTO ref FROM public.affiliate_referrals WHERE referred_user_id = _referred_user_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO prof FROM public.affiliate_profiles WHERE id = ref.affiliate_profile_id;
  IF NOT FOUND OR prof.status <> 'active' THEN RETURN NULL; END IF;

  -- Self-referral guard (defence in depth; attribution also blocks it).
  IF prof.user_id = _referred_user_id THEN RETURN NULL; END IF;

  -- Idempotency: the same source record can never pay twice.
  IF _source_record_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.affiliate_commissions
        WHERE affiliate_referral_id = ref.id
          AND (source_record_id = _source_record_id OR notes = _source_record_id)
     ) THEN
    RETURN NULL;
  END IF;

  SELECT * INTO settings FROM public.affiliate_settings WHERE id = 1;

  use_type := COALESCE(prof.default_commission_type, settings.default_commission_type);
  use_rate := COALESCE(prof.custom_commission_rate, settings.default_commission_rate);

  -- Tier bonus, driven by the configurable tier table.
  SELECT count(*) INTO ref_count
    FROM public.affiliate_referrals r
   WHERE r.affiliate_profile_id = prof.id
     AND r.attribution_status = 'confirmed';

  SELECT COALESCE(t.bonus_rate, 0) INTO tier_bonus
    FROM public.affiliate_tiers t
   WHERE t.active AND t.min_referrals <= ref_count
   ORDER BY t.min_referrals DESC
   LIMIT 1;

  IF use_type = 'percentage' THEN
    use_rate := use_rate + COALESCE(tier_bonus, 0);
    amount := round((COALESCE(_source_amount,0) * use_rate / 100.0)::numeric, 2);
  ELSE
    amount := use_rate;
  END IF;

  INSERT INTO public.affiliate_commissions
    (affiliate_profile_id, affiliate_referral_id, commission_type, commission_rate,
     commission_amount, source_amount, status, source_record_id, notes)
  VALUES
    (prof.id, ref.id, use_type, use_rate, amount, _source_amount, 'pending', _source_record_id, _source_record_id)
  ON CONFLICT DO NOTHING
  RETURNING id INTO commission_id;

  IF commission_id IS NULL THEN RETURN NULL; END IF;

  UPDATE public.affiliate_referrals
    SET conversion_date = COALESCE(conversion_date, now()),
        conversion_type = _conversion_type,
        source_record_id = COALESCE(source_record_id, _source_record_id),
        attribution_status = 'confirmed'
    WHERE id = ref.id;

  PERFORM public.enqueue_notification(
    prof.user_id, 'affiliate_commission_earned',
    'New commission: $' || to_char(amount, 'FM999999990.00'),
    'A referral converted. Track it in your referral dashboard.',
    '/affiliate/dashboard',
    jsonb_build_object('commission_id', commission_id, 'amount', amount)
  );

  RETURN commission_id;
END $function$;

-- Refund / cancellation handling: reverse instead of delete.
CREATE OR REPLACE FUNCTION public.reverse_commission_for_source(
  _source_record_id text,
  _reason text DEFAULT 'refund')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE n integer := 0;
BEGIN
  IF _source_record_id IS NULL THEN RETURN 0; END IF;

  UPDATE public.affiliate_commissions
     SET status = 'reversed',
         reversed_date = now(),
         notes = COALESCE(notes, '') || ' | reversed: ' || left(COALESCE(_reason,'refund'), 100)
   WHERE (source_record_id = _source_record_id OR notes = _source_record_id)
     AND status IN ('pending','approved');
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $function$;

-- 3. Admin commission moderation ---------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_commission_status(
  _commission_ids uuid[],
  _status affiliate_commission_status,
  _reason text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE n integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can moderate commissions';
  END IF;
  IF _status NOT IN ('approved','canceled','reversed','pending') THEN
    RAISE EXCEPTION 'Unsupported commission status transition';
  END IF;

  PERFORM public.assert_admin_write_rate_limit(auth.uid(), 50);

  UPDATE public.affiliate_commissions
     SET status = _status,
         approved_date = CASE WHEN _status = 'approved' THEN now() ELSE approved_date END,
         reversed_date = CASE WHEN _status = 'reversed' THEN now() ELSE reversed_date END,
         notes = CASE WHEN _reason IS NULL THEN notes
                      ELSE COALESCE(notes,'') || ' | ' || left(_reason, 200) END
   WHERE id = ANY(_commission_ids)
     AND status <> 'paid';
  GET DIAGNOSTICS n = ROW_COUNT;

  INSERT INTO public.admin_audit_log (actor_id, action, resource_type, resource_id, record_count, details)
  VALUES (auth.uid(), 'update', 'affiliate_commissions', NULL, n,
          jsonb_build_object('status', _status, 'reason', _reason, 'ids', to_jsonb(_commission_ids)));

  RETURN n;
END $function$;

CREATE OR REPLACE FUNCTION public.admin_affiliate_overview()
RETURNS TABLE(
  profile_id uuid, user_id uuid, display_name text, affiliate_code text,
  status affiliate_profile_status, created_at timestamptz,
  clicks bigint, referrals bigint, conversions bigint,
  pending_amount numeric, approved_amount numeric, paid_amount numeric, reversed_amount numeric,
  suspicious boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can read affiliate overviews';
  END IF;

  RETURN QUERY
  SELECT p.id, p.user_id, pr.display_name, p.affiliate_code, p.status, p.created_at,
         (SELECT count(*) FROM public.affiliate_clicks c WHERE c.affiliate_profile_id = p.id),
         (SELECT count(*) FROM public.affiliate_referrals r WHERE r.affiliate_profile_id = p.id),
         (SELECT count(*) FROM public.affiliate_referrals r WHERE r.affiliate_profile_id = p.id AND r.conversion_date IS NOT NULL),
         COALESCE((SELECT sum(x.commission_amount) FROM public.affiliate_commissions x WHERE x.affiliate_profile_id = p.id AND x.status = 'pending'),0),
         COALESCE((SELECT sum(x.commission_amount) FROM public.affiliate_commissions x WHERE x.affiliate_profile_id = p.id AND x.status = 'approved'),0),
         COALESCE((SELECT sum(x.commission_amount) FROM public.affiliate_commissions x WHERE x.affiliate_profile_id = p.id AND x.status = 'paid'),0),
         COALESCE((SELECT sum(x.commission_amount) FROM public.affiliate_commissions x WHERE x.affiliate_profile_id = p.id AND x.status = 'reversed'),0),
         (
           -- Flag: many clicks with no conversions, or referrals converting within 60s of the click.
           ((SELECT count(*) FROM public.affiliate_clicks c WHERE c.affiliate_profile_id = p.id) > 100
             AND (SELECT count(*) FROM public.affiliate_referrals r WHERE r.affiliate_profile_id = p.id) = 0)
           OR EXISTS (
             SELECT 1 FROM public.affiliate_referrals r
              JOIN public.affiliate_clicks c ON c.id = r.affiliate_click_id
              WHERE r.affiliate_profile_id = p.id
                AND r.conversion_date IS NOT NULL
                AND r.conversion_date - c.clicked_at < interval '60 seconds')
         )
  FROM public.affiliate_profiles p
  LEFT JOIN public.profiles pr ON pr.user_id = p.user_id
  ORDER BY p.created_at DESC;
END $function$;

-- 4. Affiliate (customer) gamification ---------------------------------------
CREATE OR REPLACE FUNCTION public.my_affiliate_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  prof RECORD;
  clicks_count integer := 0;
  referrals_count integer := 0;
  conversions_count integer := 0;
  confirmed_count integer := 0;
  streak_weeks integer := 0;
  cur RECORD;
  nxt RECORD;
  pending numeric := 0; approved numeric := 0; paid numeric := 0; reversed numeric := 0;
  avg_commission numeric := 0;
  threshold numeric := 0;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT * INTO prof FROM public.affiliate_profiles WHERE user_id = uid;
  IF NOT FOUND THEN RETURN jsonb_build_object('has_profile', false); END IF;

  SELECT count(*) INTO clicks_count FROM public.affiliate_clicks WHERE affiliate_profile_id = prof.id;
  SELECT count(*) INTO referrals_count FROM public.affiliate_referrals WHERE affiliate_profile_id = prof.id;
  SELECT count(*) INTO conversions_count FROM public.affiliate_referrals
    WHERE affiliate_profile_id = prof.id AND conversion_date IS NOT NULL;
  SELECT count(*) INTO confirmed_count FROM public.affiliate_referrals
    WHERE affiliate_profile_id = prof.id AND attribution_status = 'confirmed';

  SELECT
    COALESCE(sum(commission_amount) FILTER (WHERE status='pending'),0),
    COALESCE(sum(commission_amount) FILTER (WHERE status='approved'),0),
    COALESCE(sum(commission_amount) FILTER (WHERE status='paid'),0),
    COALESCE(sum(commission_amount) FILTER (WHERE status='reversed'),0),
    COALESCE(avg(commission_amount) FILTER (WHERE status <> 'reversed'),0)
  INTO pending, approved, paid, reversed, avg_commission
  FROM public.affiliate_commissions WHERE affiliate_profile_id = prof.id;

  SELECT * INTO cur FROM public.affiliate_tiers
   WHERE active AND min_referrals <= confirmed_count
   ORDER BY min_referrals DESC LIMIT 1;

  SELECT * INTO nxt FROM public.affiliate_tiers
   WHERE active AND min_referrals > confirmed_count
   ORDER BY min_referrals ASC LIMIT 1;

  -- Streak: consecutive weeks (ending this week) with at least one referral.
  WITH weeks AS (
    SELECT DISTINCT date_trunc('week', signup_date) AS w
    FROM public.affiliate_referrals WHERE affiliate_profile_id = prof.id
  ), ranked AS (
    SELECT w, row_number() OVER (ORDER BY w DESC) AS rn FROM weeks
  )
  SELECT count(*) INTO streak_weeks FROM ranked
   WHERE w = date_trunc('week', now()) - ((rn - 1) * interval '1 week');

  SELECT minimum_payout_threshold INTO threshold FROM public.affiliate_settings WHERE id = 1;

  RETURN jsonb_build_object(
    'has_profile', true,
    'profile', jsonb_build_object(
      'id', prof.id, 'code', prof.affiliate_code, 'status', prof.status,
      'approval_date', prof.approval_date, 'payout_email', prof.payout_email,
      'payout_method', prof.payout_method),
    'stats', jsonb_build_object(
      'clicks', clicks_count, 'referrals', referrals_count,
      'conversions', conversions_count, 'confirmed', confirmed_count,
      'conversion_rate', CASE WHEN clicks_count = 0 THEN 0
                              ELSE round((conversions_count::numeric / clicks_count) * 100, 1) END,
      'streak_weeks', streak_weeks),
    'earnings', jsonb_build_object(
      'pending', pending, 'approved', approved, 'paid', paid, 'reversed', reversed,
      'unpaid', pending + approved, 'lifetime', pending + approved + paid,
      'avg_commission', round(avg_commission, 2),
      'payout_threshold', COALESCE(threshold, 0),
      'projected_next_30d', round(
        CASE WHEN clicks_count = 0 THEN 0
             ELSE avg_commission * conversions_count::numeric
                  * LEAST(1.0, 30.0 / GREATEST(1, EXTRACT(day FROM now() - prof.created_at)::numeric))
        END, 2)),
    'tier', CASE WHEN cur.key IS NULL THEN NULL ELSE
      jsonb_build_object('key', cur.key, 'name', cur.name, 'color', cur.color,
                         'bonus_rate', cur.bonus_rate, 'perks', cur.perks,
                         'min_referrals', cur.min_referrals) END,
    'next_tier', CASE WHEN nxt.key IS NULL THEN NULL ELSE
      jsonb_build_object('key', nxt.key, 'name', nxt.name, 'color', nxt.color,
                         'bonus_rate', nxt.bonus_rate, 'perks', nxt.perks,
                         'min_referrals', nxt.min_referrals,
                         'remaining', GREATEST(nxt.min_referrals - confirmed_count, 0)) END
  );
END $function$;

CREATE OR REPLACE FUNCTION public.affiliate_leaderboard(_limit integer DEFAULT 10)
RETURNS TABLE(rank bigint, alias text, confirmed_referrals bigint, tier_name text, tier_color text, is_me boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT p.id, p.user_id, p.affiliate_code,
           (SELECT count(*) FROM public.affiliate_referrals r
             WHERE r.affiliate_profile_id = p.id AND r.attribution_status = 'confirmed') AS refs
    FROM public.affiliate_profiles p
    WHERE p.status = 'active'
  )
  SELECT row_number() OVER (ORDER BY b.refs DESC, b.affiliate_code) AS rank,
         CASE WHEN b.user_id = auth.uid() THEN 'You'
              ELSE left(b.affiliate_code, 2) || '•••' || right(b.affiliate_code, 2) END AS alias,
         b.refs,
         t.name, t.color,
         (b.user_id = auth.uid())
  FROM base b
  LEFT JOIN LATERAL (
    SELECT name, color FROM public.affiliate_tiers
     WHERE active AND min_referrals <= b.refs
     ORDER BY min_referrals DESC LIMIT 1
  ) t ON true
  WHERE auth.uid() IS NOT NULL
  ORDER BY b.refs DESC, b.affiliate_code
  LIMIT GREATEST(LEAST(COALESCE(_limit, 10), 50), 1);
$function$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(((auth.jwt() ->> 'is_anonymous')::boolean), false) = false
     AND public.has_role(auth.uid(), 'admin');
$function$;

-- 5. Execution grants ---------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.record_conversion_commission(uuid, numeric, affiliate_conversion_type, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reverse_commission_for_source(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_set_commission_status(uuid[], affiliate_commission_status, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_affiliate_overview() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.my_affiliate_overview() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.affiliate_leaderboard(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.record_conversion_commission(uuid, numeric, affiliate_conversion_type, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reverse_commission_for_source(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_commission_status(uuid[], affiliate_commission_status, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_affiliate_overview() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_affiliate_overview() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.affiliate_leaderboard(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;