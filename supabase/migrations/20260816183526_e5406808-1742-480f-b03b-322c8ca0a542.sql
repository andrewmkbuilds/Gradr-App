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

  IF prof.user_id = _referred_user_id THEN RETURN NULL; END IF;

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

-- ============ eligibility categories ============
CREATE TABLE public.eligibility_categories (
  key text PRIMARY KEY,
  label text NOT NULL,
  description text,
  requires_verification boolean NOT NULL DEFAULT true,
  default_discount_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (default_discount_percent >= 0 AND default_discount_percent <= 100),
  verification_validity_days integer NOT NULL DEFAULT 365 CHECK (verification_validity_days > 0),
  self_serve boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.eligibility_categories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.eligibility_categories TO authenticated;
GRANT ALL ON public.eligibility_categories TO service_role;
ALTER TABLE public.eligibility_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read eligibility categories"
  ON public.eligibility_categories FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins manage eligibility categories"
  ON public.eligibility_categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ organizations ============
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  org_type text NOT NULL DEFAULT 'school'
    CHECK (org_type IN ('school','university','bootcamp','career_program','employer','nonprofit','other')),
  discount_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
  email_domains text[] NOT NULL DEFAULT '{}',
  contact_email text,
  seats integer,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage organizations"
  ON public.organizations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('member','manager')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_members TO authenticated;
GRANT ALL ON public.organization_members TO service_role;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read own organization membership"
  ON public.organization_members FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins manage organization members"
  ON public.organization_members FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ discount rules / campaigns ============
CREATE TABLE public.discount_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'eligibility' CHECK (kind IN ('campaign','organization','eligibility')),
  eligibility_type text REFERENCES public.eligibility_categories(key) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  percentage numeric(5,2) NOT NULL CHECK (percentage > 0 AND percentage <= 100),
  applicable_plans text[] NOT NULL DEFAULT ARRAY['starter','pro','advanced'],
  applicable_intervals text[] NOT NULL DEFAULT ARRAY['monthly','annual'],
  requires_verification boolean NOT NULL DEFAULT true,
  stackable boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  advertised boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz,
  max_redemptions integer CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  redemption_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_discount_rules_lookup ON public.discount_rules(active, eligibility_type);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discount_rules TO authenticated;
GRANT SELECT ON public.discount_rules TO anon;
GRANT ALL ON public.discount_rules TO service_role;
ALTER TABLE public.discount_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read live advertised discount programs"
  ON public.discount_rules FOR SELECT TO anon, authenticated
  USING (
    active
    AND advertised
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at > now())
  );
CREATE POLICY "Admins manage discount rules"
  ON public.discount_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ eligibility verifications ============
CREATE TABLE public.eligibility_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  eligibility_type text NOT NULL REFERENCES public.eligibility_categories(key) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'sheerid',
  provider_reference_id text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','verified','failed','expired','revoked','manual_review')),
  verified_at timestamptz,
  expires_at timestamptz,
  last_checked_at timestamptz,
  failure_reason text,
  reviewed_by uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, eligibility_type)
);
CREATE UNIQUE INDEX idx_eligibility_provider_ref
  ON public.eligibility_verifications(provider, provider_reference_id)
  WHERE provider_reference_id IS NOT NULL;
GRANT SELECT ON public.eligibility_verifications TO authenticated;
GRANT ALL ON public.eligibility_verifications TO service_role;
ALTER TABLE public.eligibility_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own verifications"
  ON public.eligibility_verifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins read all verifications"
  ON public.eligibility_verifications FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- ============ redemptions ============
CREATE TABLE public.discount_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  discount_rule_id uuid REFERENCES public.discount_rules(id) ON DELETE SET NULL,
  eligibility_type text,
  percentage numeric(5,2) NOT NULL,
  plan text,
  interval text,
  environment text NOT NULL DEFAULT 'live',
  transaction_id text,
  subscription_id text,
  gross_amount numeric(12,2),
  discount_amount numeric(12,2),
  net_amount numeric(12,2),
  currency text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (transaction_id, environment)
);
GRANT SELECT ON public.discount_redemptions TO authenticated;
GRANT ALL ON public.discount_redemptions TO service_role;
ALTER TABLE public.discount_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own redemptions"
  ON public.discount_redemptions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins read all redemptions"
  ON public.discount_redemptions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- ============ global settings ============
CREATE TABLE public.discount_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  allow_stacking boolean NOT NULL DEFAULT false,
  affiliate_commission_basis text NOT NULL DEFAULT 'net' CHECK (affiliate_commission_basis IN ('net','gross')),
  notify_verified boolean NOT NULL DEFAULT true,
  notify_failed boolean NOT NULL DEFAULT true,
  notify_expiring boolean NOT NULL DEFAULT true,
  notify_expired boolean NOT NULL DEFAULT true,
  expiry_reminder_days integer[] NOT NULL DEFAULT ARRAY[30,7,1],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.discount_settings TO authenticated;
GRANT ALL ON public.discount_settings TO service_role;
ALTER TABLE public.discount_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read discount settings"
  ON public.discount_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage discount settings"
  ON public.discount_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ paddle discount cache (server-side only) ============
CREATE TABLE public.paddle_discounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment text NOT NULL,
  percentage numeric(5,2) NOT NULL,
  recurring boolean NOT NULL DEFAULT true,
  paddle_discount_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (environment, percentage, recurring)
);
GRANT SELECT ON public.paddle_discounts TO authenticated;
GRANT ALL ON public.paddle_discounts TO service_role;
ALTER TABLE public.paddle_discounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read paddle discount cache"
  ON public.paddle_discounts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- ============ updated_at triggers ============
CREATE TRIGGER trg_eligibility_categories_updated BEFORE UPDATE ON public.eligibility_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_discount_rules_updated BEFORE UPDATE ON public.discount_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_eligibility_verifications_updated BEFORE UPDATE ON public.eligibility_verifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_organizations_updated BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_discount_settings_updated BEFORE UPDATE ON public.discount_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ audit trigger for discount config ============
CREATE OR REPLACE FUNCTION public.trg_audit_discount_config()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  actor uuid := auth.uid();
  rec jsonb;
  before_rec jsonb;
  rec_id text;
  act text := CASE TG_OP WHEN 'INSERT' THEN 'create' WHEN 'UPDATE' THEN 'update' ELSE 'delete' END;
BEGIN
  IF actor IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF actor IS NOT NULL THEN
    PERFORM public.assert_admin_write_rate_limit(actor, 50);
  END IF;

  IF TG_OP = 'DELETE' THEN
    before_rec := to_jsonb(OLD);
    rec := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    before_rec := NULL;
    rec := to_jsonb(NEW);
  ELSE
    before_rec := to_jsonb(OLD);
    rec := to_jsonb(NEW);
  END IF;

  rec_id := COALESCE(rec->>'id', rec->>'key', before_rec->>'id', before_rec->>'key');

  INSERT INTO public.admin_audit_log (actor_id, action, resource_type, resource_id, record_count, details)
  VALUES (actor, act, TG_TABLE_NAME, rec_id, 1,
          jsonb_strip_nulls(jsonb_build_object('before', before_rec, 'after', rec)));

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER audit_discount_rules AFTER INSERT OR UPDATE OR DELETE ON public.discount_rules
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_discount_config();
CREATE TRIGGER audit_eligibility_categories AFTER INSERT OR UPDATE OR DELETE ON public.eligibility_categories
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_discount_config();
CREATE TRIGGER audit_organizations AFTER INSERT OR UPDATE OR DELETE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_discount_config();

-- ============ seed configuration ============
INSERT INTO public.discount_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

INSERT INTO public.eligibility_categories
  (key, label, description, requires_verification, default_discount_percent, verification_validity_days, self_serve, sort_order)
VALUES
  ('student','Student','Currently enrolled at a school, college or university.', true, 50, 365, true, 10),
  ('educator','Educator','Teachers, lecturers and academic staff.', true, 30, 365, true, 20),
  ('military','Military / Veteran','Active duty, reserve, veteran and military family.', true, 30, 730, true, 30),
  ('first_responder','First Responder','Firefighters, police, EMTs and paramedics.', true, 30, 730, true, 40),
  ('healthcare','Healthcare Worker','Nurses, doctors and licensed healthcare staff.', true, 30, 730, true, 50),
  ('nonprofit','Nonprofit','Staff at a registered nonprofit organization.', true, 30, 365, true, 60),
  ('professional','Professional','Verified working professionals. No standing discount by default.', true, 0, 365, true, 70),
  ('accessibility','Accessibility','Configurable support pricing. Reviewed manually, minimal data collected.', true, 0, 365, false, 80),
  ('organization','Organization / Education Program','Schools, bootcamps and career programs on custom pricing.', true, 0, 365, false, 90)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.discount_rules (name, kind, eligibility_type, percentage, requires_verification, advertised)
VALUES
  ('Gradr Student Program', 'eligibility', 'student', 50, true, true),
  ('Educator Discount', 'eligibility', 'educator', 30, true, true),
  ('Military & Veteran Discount', 'eligibility', 'military', 30, true, true),
  ('First Responder Discount', 'eligibility', 'first_responder', 30, true, true),
  ('Healthcare Worker Discount', 'eligibility', 'healthcare', 30, true, true),
  ('Nonprofit Discount', 'eligibility', 'nonprofit', 30, true, true);

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

REVOKE EXECUTE ON FUNCTION public.trg_audit_discount_config() FROM PUBLIC, anon, authenticated;