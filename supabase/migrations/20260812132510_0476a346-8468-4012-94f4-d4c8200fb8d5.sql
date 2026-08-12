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
-- Uses the row's primary key generically: eligibility_categories is keyed by
-- `key`, the other config tables by `id`.
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
  -- Seed / service-role writes have no admin actor; skip audit noise.
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