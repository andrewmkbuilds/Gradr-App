
-- =====================================================================
-- ENUMS
-- =====================================================================
CREATE TYPE public.affiliate_application_status AS ENUM ('pending','approved','rejected','suspended');
CREATE TYPE public.affiliate_profile_status     AS ENUM ('active','suspended','revoked');
CREATE TYPE public.affiliate_commission_type    AS ENUM ('percentage','flat');
CREATE TYPE public.affiliate_commission_status  AS ENUM ('pending','approved','paid','reversed','canceled');
CREATE TYPE public.affiliate_payout_status      AS ENUM ('pending','paid','failed','canceled');
CREATE TYPE public.affiliate_referral_status    AS ENUM ('pending','confirmed','rejected');
CREATE TYPE public.affiliate_conversion_type    AS ENUM ('signup','paid_upgrade','custom');

-- =====================================================================
-- SETTINGS (single row)
-- =====================================================================
CREATE TABLE public.affiliate_settings (
  id INT PRIMARY KEY DEFAULT 1,
  program_enabled BOOLEAN NOT NULL DEFAULT true,
  auto_approve BOOLEAN NOT NULL DEFAULT false,
  cookie_duration_days INT NOT NULL DEFAULT 90,
  default_commission_type public.affiliate_commission_type NOT NULL DEFAULT 'percentage',
  default_commission_rate NUMERIC(10,2) NOT NULL DEFAULT 20.00,
  minimum_payout_threshold NUMERIC(10,2) NOT NULL DEFAULT 50.00,
  payout_instructions TEXT NOT NULL DEFAULT 'Payouts are processed monthly via PayPal once your balance exceeds the minimum threshold.',
  affiliate_terms TEXT NOT NULL DEFAULT 'Standard affiliate terms apply. No self-referrals, spam, or misleading promotion. CareerFlow OS may revoke affiliate status at any time for policy violations.',
  last_touch_attribution_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT affiliate_settings_singleton CHECK (id = 1)
);

GRANT SELECT ON public.affiliate_settings TO authenticated;
GRANT ALL ON public.affiliate_settings TO service_role;
ALTER TABLE public.affiliate_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "settings readable by authenticated" ON public.affiliate_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "settings writable by admins" ON public.affiliate_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.affiliate_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- =====================================================================
-- APPLICATIONS
-- =====================================================================
CREATE TABLE public.affiliate_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  brand_name TEXT,
  website TEXT,
  social_links JSONB NOT NULL DEFAULT '{}'::jsonb,
  audience_type TEXT,
  audience_size TEXT,
  promotion_plan TEXT,
  why_join TEXT,
  payout_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  agreed_to_terms BOOLEAN NOT NULL DEFAULT false,
  status public.affiliate_application_status NOT NULL DEFAULT 'pending',
  admin_notes TEXT,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX affiliate_applications_one_active_per_user
  ON public.affiliate_applications(user_id)
  WHERE status IN ('pending','approved');

GRANT SELECT, INSERT, UPDATE ON public.affiliate_applications TO authenticated;
GRANT ALL ON public.affiliate_applications TO service_role;
ALTER TABLE public.affiliate_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own application" ON public.affiliate_applications
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "users create own application" ON public.affiliate_applications
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND agreed_to_terms = true);
CREATE POLICY "admins update applications" ON public.affiliate_applications
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- =====================================================================
-- PROFILES
-- =====================================================================
CREATE TABLE public.affiliate_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  affiliate_code TEXT NOT NULL UNIQUE,
  status public.affiliate_profile_status NOT NULL DEFAULT 'active',
  approval_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  default_commission_type public.affiliate_commission_type,
  custom_commission_rate NUMERIC(10,2),
  payout_email TEXT,
  payout_method TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX affiliate_profiles_code_idx ON public.affiliate_profiles(affiliate_code);

GRANT SELECT ON public.affiliate_profiles TO authenticated;
GRANT ALL ON public.affiliate_profiles TO service_role;
ALTER TABLE public.affiliate_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own profile" ON public.affiliate_profiles
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins write profiles" ON public.affiliate_profiles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- =====================================================================
-- CLICKS
-- =====================================================================
CREATE TABLE public.affiliate_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_profile_id UUID REFERENCES public.affiliate_profiles(id) ON DELETE SET NULL,
  affiliate_code TEXT NOT NULL,
  landing_page TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  session_id TEXT,
  visitor_key TEXT,
  ip_hash TEXT,
  user_agent TEXT,
  clicked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX affiliate_clicks_profile_idx ON public.affiliate_clicks(affiliate_profile_id, clicked_at DESC);
CREATE INDEX affiliate_clicks_code_idx ON public.affiliate_clicks(affiliate_code);

-- Anyone (including anon visitors) may insert a click so tracking works pre-signup.
GRANT INSERT ON public.affiliate_clicks TO anon, authenticated;
GRANT SELECT ON public.affiliate_clicks TO authenticated;
GRANT ALL ON public.affiliate_clicks TO service_role;
ALTER TABLE public.affiliate_clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can insert clicks" ON public.affiliate_clicks
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "owner or admin reads clicks" ON public.affiliate_clicks
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(),'admin')
    OR affiliate_profile_id IN (SELECT id FROM public.affiliate_profiles WHERE user_id = auth.uid())
  );

-- =====================================================================
-- REFERRALS
-- =====================================================================
CREATE TABLE public.affiliate_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_profile_id UUID NOT NULL REFERENCES public.affiliate_profiles(id) ON DELETE CASCADE,
  referred_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  affiliate_click_id UUID REFERENCES public.affiliate_clicks(id) ON DELETE SET NULL,
  referral_code TEXT NOT NULL,
  signup_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  conversion_date TIMESTAMPTZ,
  conversion_type public.affiliate_conversion_type,
  source_record_id TEXT,
  attribution_status public.affiliate_referral_status NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (referred_user_id)
);

GRANT SELECT ON public.affiliate_referrals TO authenticated;
GRANT ALL ON public.affiliate_referrals TO service_role;
ALTER TABLE public.affiliate_referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner or admin reads referrals" ON public.affiliate_referrals
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(),'admin')
    OR affiliate_profile_id IN (SELECT id FROM public.affiliate_profiles WHERE user_id = auth.uid())
  );
CREATE POLICY "admins write referrals" ON public.affiliate_referrals
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- =====================================================================
-- COMMISSIONS
-- =====================================================================
CREATE TABLE public.affiliate_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_profile_id UUID NOT NULL REFERENCES public.affiliate_profiles(id) ON DELETE CASCADE,
  affiliate_referral_id UUID REFERENCES public.affiliate_referrals(id) ON DELETE SET NULL,
  commission_type public.affiliate_commission_type NOT NULL,
  commission_rate NUMERIC(10,2) NOT NULL,
  commission_amount NUMERIC(10,2) NOT NULL,
  source_amount NUMERIC(10,2),
  status public.affiliate_commission_status NOT NULL DEFAULT 'pending',
  created_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_date TIMESTAMPTZ,
  paid_date TIMESTAMPTZ,
  reversed_date TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX affiliate_commissions_profile_idx ON public.affiliate_commissions(affiliate_profile_id, status);

GRANT SELECT ON public.affiliate_commissions TO authenticated;
GRANT ALL ON public.affiliate_commissions TO service_role;
ALTER TABLE public.affiliate_commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner or admin reads commissions" ON public.affiliate_commissions
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(),'admin')
    OR affiliate_profile_id IN (SELECT id FROM public.affiliate_profiles WHERE user_id = auth.uid())
  );
CREATE POLICY "admins write commissions" ON public.affiliate_commissions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- =====================================================================
-- PAYOUTS (table only in phase 1)
-- =====================================================================
CREATE TABLE public.affiliate_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_profile_id UUID NOT NULL REFERENCES public.affiliate_profiles(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  status public.affiliate_payout_status NOT NULL DEFAULT 'pending',
  payout_method TEXT,
  payout_reference TEXT,
  payout_date TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX affiliate_payouts_profile_idx ON public.affiliate_payouts(affiliate_profile_id);

GRANT SELECT ON public.affiliate_payouts TO authenticated;
GRANT ALL ON public.affiliate_payouts TO service_role;
ALTER TABLE public.affiliate_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner or admin reads payouts" ON public.affiliate_payouts
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(),'admin')
    OR affiliate_profile_id IN (SELECT id FROM public.affiliate_profiles WHERE user_id = auth.uid())
  );
CREATE POLICY "admins write payouts" ON public.affiliate_payouts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- =====================================================================
-- updated_at triggers
-- =====================================================================
CREATE TRIGGER affiliate_settings_updated     BEFORE UPDATE ON public.affiliate_settings     FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER affiliate_applications_updated BEFORE UPDATE ON public.affiliate_applications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER affiliate_profiles_updated     BEFORE UPDATE ON public.affiliate_profiles     FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER affiliate_referrals_updated    BEFORE UPDATE ON public.affiliate_referrals    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER affiliate_commissions_updated  BEFORE UPDATE ON public.affiliate_commissions  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER affiliate_payouts_updated      BEFORE UPDATE ON public.affiliate_payouts      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================================
-- HELPER FUNCTIONS
-- =====================================================================

-- Unique 8-char code generator
CREATE OR REPLACE FUNCTION public.generate_affiliate_code()
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  alphabet TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code TEXT;
  exists_already BOOLEAN;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..8 LOOP
      code := code || substr(alphabet, 1 + floor(random()*length(alphabet))::int, 1);
    END LOOP;
    SELECT EXISTS(SELECT 1 FROM public.affiliate_profiles WHERE affiliate_code = code) INTO exists_already;
    EXIT WHEN NOT exists_already;
  END LOOP;
  RETURN code;
END $$;

-- Public lookup: validate a ?ref code without exposing other affiliate data
CREATE OR REPLACE FUNCTION public.lookup_affiliate_by_code(_code TEXT)
RETURNS TABLE (profile_id UUID, code TEXT, is_active BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, affiliate_code, (status = 'active')
  FROM public.affiliate_profiles
  WHERE affiliate_code = _code
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.lookup_affiliate_by_code(TEXT) TO anon, authenticated;

-- Admin approve application -> creates profile
CREATE OR REPLACE FUNCTION public.approve_affiliate_application(_application_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  app RECORD;
  new_profile_id UUID;
  generated_code TEXT;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Only admins can approve applications';
  END IF;

  SELECT * INTO app FROM public.affiliate_applications WHERE id = _application_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found'; END IF;

  UPDATE public.affiliate_applications
    SET status='approved', reviewed_by=auth.uid(), reviewed_date=now()
    WHERE id = _application_id;

  SELECT id INTO new_profile_id FROM public.affiliate_profiles WHERE user_id = app.user_id;
  IF new_profile_id IS NULL THEN
    generated_code := public.generate_affiliate_code();
    INSERT INTO public.affiliate_profiles (user_id, affiliate_code, payout_email, payout_method)
    VALUES (app.user_id, generated_code, app.email, COALESCE(app.payout_details->>'method','paypal'))
    RETURNING id INTO new_profile_id;
  END IF;

  RETURN new_profile_id;
END $$;
GRANT EXECUTE ON FUNCTION public.approve_affiliate_application(UUID) TO authenticated;

-- Signup attribution: called right after signup with cookie code
CREATE OR REPLACE FUNCTION public.attribute_signup_referral(_code TEXT, _click_id UUID DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid UUID := auth.uid();
  prof RECORD;
  existing UUID;
  ref_id UUID;
BEGIN
  IF uid IS NULL OR _code IS NULL OR length(_code) = 0 THEN RETURN NULL; END IF;

  SELECT id, user_id, status INTO prof FROM public.affiliate_profiles WHERE affiliate_code = _code;
  IF NOT FOUND OR prof.status <> 'active' THEN RETURN NULL; END IF;
  IF prof.user_id = uid THEN RETURN NULL; END IF; -- self-referral

  SELECT id INTO existing FROM public.affiliate_referrals WHERE referred_user_id = uid;
  IF existing IS NOT NULL THEN RETURN existing; END IF;

  INSERT INTO public.affiliate_referrals
    (affiliate_profile_id, referred_user_id, affiliate_click_id, referral_code,
     conversion_type, conversion_date, attribution_status)
  VALUES
    (prof.id, uid, _click_id, _code, 'signup', now(), 'confirmed')
  RETURNING id INTO ref_id;

  RETURN ref_id;
END $$;
GRANT EXECUTE ON FUNCTION public.attribute_signup_referral(TEXT, UUID) TO authenticated;

-- Conversion: create a commission for a referred user
CREATE OR REPLACE FUNCTION public.record_conversion_commission(
  _referred_user_id UUID,
  _source_amount NUMERIC,
  _conversion_type public.affiliate_conversion_type DEFAULT 'paid_upgrade',
  _source_record_id TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ref RECORD;
  prof RECORD;
  settings RECORD;
  use_type public.affiliate_commission_type;
  use_rate NUMERIC;
  amount NUMERIC;
  commission_id UUID;
BEGIN
  SELECT * INTO ref FROM public.affiliate_referrals WHERE referred_user_id = _referred_user_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO prof FROM public.affiliate_profiles WHERE id = ref.affiliate_profile_id;
  IF NOT FOUND OR prof.status <> 'active' THEN RETURN NULL; END IF;

  -- Duplicate guard: same source record cannot pay twice
  IF _source_record_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.affiliate_commissions
        WHERE affiliate_referral_id = ref.id AND notes = _source_record_id
     ) THEN
    RETURN NULL;
  END IF;

  SELECT * INTO settings FROM public.affiliate_settings WHERE id = 1;

  use_type := COALESCE(prof.default_commission_type, settings.default_commission_type);
  use_rate := COALESCE(prof.custom_commission_rate, settings.default_commission_rate);

  IF use_type = 'percentage' THEN
    amount := round((COALESCE(_source_amount,0) * use_rate / 100.0)::numeric, 2);
  ELSE
    amount := use_rate;
  END IF;

  INSERT INTO public.affiliate_commissions
    (affiliate_profile_id, affiliate_referral_id, commission_type, commission_rate,
     commission_amount, source_amount, status, notes)
  VALUES
    (prof.id, ref.id, use_type, use_rate, amount, _source_amount, 'pending', _source_record_id)
  RETURNING id INTO commission_id;

  UPDATE public.affiliate_referrals
    SET conversion_date = COALESCE(conversion_date, now()),
        conversion_type = _conversion_type,
        attribution_status = 'confirmed'
    WHERE id = ref.id;

  RETURN commission_id;
END $$;
GRANT EXECUTE ON FUNCTION public.record_conversion_commission(UUID, NUMERIC, public.affiliate_conversion_type, TEXT) TO authenticated, service_role;
