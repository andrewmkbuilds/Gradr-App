-- Create profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  target_job_title TEXT,
  target_salary TEXT,
  target_industry TEXT,
  skills TEXT[],
  career_stage TEXT DEFAULT 'mid-career',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- Create resumes table
CREATE TABLE public.resumes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  ats_score INTEGER,
  keyword_match INTEGER,
  formatting_score INTEGER,
  impact_score INTEGER,
  readability_score INTEGER,
  ai_suggestions JSONB,
  parsed_text TEXT,
  version_label TEXT DEFAULT 'Default',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.resumes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own resumes" ON public.resumes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own resumes" ON public.resumes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own resumes" ON public.resumes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own resumes" ON public.resumes FOR DELETE USING (auth.uid() = user_id);

-- Create job_matches table
CREATE TABLE public.job_matches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_title TEXT NOT NULL,
  company TEXT,
  location TEXT,
  salary_range TEXT,
  match_score INTEGER,
  missing_skills TEXT[],
  matched_skills TEXT[],
  description TEXT,
  ai_strategy TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.job_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own job matches" ON public.job_matches FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own job matches" ON public.job_matches FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own job matches" ON public.job_matches FOR DELETE USING (auth.uid() = user_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_resumes_updated_at BEFORE UPDATE ON public.resumes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create storage bucket for resumes (bucket created via storage_create_bucket tool)

CREATE POLICY "Users can upload their own resumes" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'resumes' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can view their own resumes" ON storage.objects FOR SELECT USING (bucket_id = 'resumes' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete their own resumes" ON storage.objects FOR DELETE USING (bucket_id = 'resumes' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Add UPDATE RLS policy for job_matches so users can only update their own rows
CREATE POLICY "Users can update their own job matches"
ON public.job_matches
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Add UPDATE policy on storage.objects for resumes bucket so users can only overwrite their own files
CREATE POLICY "Users can update their own resumes"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'resumes' AND (auth.uid())::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'resumes' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- Restrict existing resume policies to authenticated users only (fix anonymous access warning)
DROP POLICY IF EXISTS "Users can view their own resumes" ON storage.objects;
CREATE POLICY "Users can view their own resumes"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'resumes' AND (auth.uid())::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users can delete their own resumes" ON storage.objects;
CREATE POLICY "Users can delete their own resumes"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'resumes' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- Also tighten upload policy to authenticated + folder-scoped
DROP POLICY IF EXISTS "Users can upload their own resumes" ON storage.objects;
CREATE POLICY "Users can upload their own resumes"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'resumes' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- Re-create all policies on public.job_matches, profiles, resumes with TO authenticated
-- job_matches
DROP POLICY IF EXISTS "Users can view their own job matches" ON public.job_matches;
DROP POLICY IF EXISTS "Users can insert their own job matches" ON public.job_matches;
DROP POLICY IF EXISTS "Users can delete their own job matches" ON public.job_matches;

CREATE POLICY "Users can view their own job matches"
ON public.job_matches FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own job matches"
ON public.job_matches FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own job matches"
ON public.job_matches FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- profiles
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;

CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

-- resumes
DROP POLICY IF EXISTS "Users can view their own resumes" ON public.resumes;
DROP POLICY IF EXISTS "Users can insert their own resumes" ON public.resumes;
DROP POLICY IF EXISTS "Users can update their own resumes" ON public.resumes;
DROP POLICY IF EXISTS "Users can delete their own resumes" ON public.resumes;

CREATE POLICY "Users can view their own resumes"
ON public.resumes FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own resumes"
ON public.resumes FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own resumes"
ON public.resumes FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own resumes"
ON public.resumes FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- user_preferences
CREATE TABLE public.user_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  target_role TEXT,
  locations TEXT[] DEFAULT '{}',
  remote_preference TEXT DEFAULT 'any',
  salary_min INTEGER,
  experience_level TEXT,
  keywords TEXT[] DEFAULT '{}',
  country TEXT DEFAULT 'us',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own prefs select" ON public.user_preferences FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own prefs insert" ON public.user_preferences FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own prefs update" ON public.user_preferences FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own prefs delete" ON public.user_preferences FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER trg_user_prefs_updated BEFORE UPDATE ON public.user_preferences FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- tracked_jobs
CREATE TABLE public.tracked_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  external_id TEXT,
  source TEXT DEFAULT 'manual',
  title TEXT NOT NULL,
  company TEXT,
  location TEXT,
  remote BOOLEAN DEFAULT false,
  url TEXT,
  salary_min INTEGER,
  salary_max INTEGER,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'saved',
  match_score INTEGER,
  notes TEXT,
  applied_at TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tracked_jobs_user_status ON public.tracked_jobs(user_id, status);
CREATE UNIQUE INDEX idx_tracked_jobs_user_external ON public.tracked_jobs(user_id, source, external_id) WHERE external_id IS NOT NULL;
ALTER TABLE public.tracked_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own jobs select" ON public.tracked_jobs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own jobs insert" ON public.tracked_jobs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own jobs update" ON public.tracked_jobs FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own jobs delete" ON public.tracked_jobs FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER trg_tracked_jobs_updated BEFORE UPDATE ON public.tracked_jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- job_reminders
CREATE TABLE public.job_reminders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  tracked_job_id UUID NOT NULL REFERENCES public.tracked_jobs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  done BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_reminders_user_due ON public.job_reminders(user_id, due_at) WHERE done = false;
ALTER TABLE public.job_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own reminders select" ON public.job_reminders FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own reminders insert" ON public.job_reminders FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own reminders update" ON public.job_reminders FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own reminders delete" ON public.job_reminders FOR DELETE TO authenticated USING (auth.uid() = user_id);

ALTER TABLE public.tracked_jobs ADD COLUMN IF NOT EXISTS application_pack jsonb;
ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS onboarded boolean NOT NULL DEFAULT false;
ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS digest_enabled boolean NOT NULL DEFAULT true;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

ALTER POLICY "Users can delete their own job matches" ON public.job_matches TO authenticated;
ALTER POLICY "Users can update their own job matches" ON public.job_matches TO authenticated;
ALTER POLICY "Users can view their own job matches" ON public.job_matches TO authenticated;

ALTER POLICY "own reminders delete" ON public.job_reminders TO authenticated;
ALTER POLICY "own reminders select" ON public.job_reminders TO authenticated;
ALTER POLICY "own reminders update" ON public.job_reminders TO authenticated;

ALTER POLICY "Users can update their own profile" ON public.profiles TO authenticated;
ALTER POLICY "Users can view their own profile" ON public.profiles TO authenticated;

ALTER POLICY "Users can delete their own resumes" ON public.resumes TO authenticated;
ALTER POLICY "Users can update their own resumes" ON public.resumes TO authenticated;
ALTER POLICY "Users can view their own resumes" ON public.resumes TO authenticated;

ALTER POLICY "own jobs delete" ON public.tracked_jobs TO authenticated;
ALTER POLICY "own jobs select" ON public.tracked_jobs TO authenticated;
ALTER POLICY "own jobs update" ON public.tracked_jobs TO authenticated;

ALTER POLICY "own prefs delete" ON public.user_preferences TO authenticated;
ALTER POLICY "own prefs select" ON public.user_preferences TO authenticated;
ALTER POLICY "own prefs update" ON public.user_preferences TO authenticated;

ALTER POLICY "Users can delete their own resumes" ON storage.objects TO authenticated;
ALTER POLICY "Users can update their own resumes" ON storage.objects TO authenticated;
ALTER POLICY "Users can view their own resumes" ON storage.objects TO authenticated;

DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'user');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
CREATE POLICY "Admins can view all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS digest_send_time time NOT NULL DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS digest_timezone text NOT NULL DEFAULT 'America/New_York';

CREATE TABLE IF NOT EXISTS public.digest_send_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'prepared',
  sent_at timestamptz NOT NULL DEFAULT now(),
  jobs_count integer NOT NULL DEFAULT 0,
  reminders_count integer NOT NULL DEFAULT 0,
  error_message text,
  preview jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.digest_send_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own digest logs" ON public.digest_send_logs;
CREATE POLICY "Users can view their own digest logs"
ON public.digest_send_logs
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own digest logs" ON public.digest_send_logs;
CREATE POLICY "Users can create their own digest logs"
ON public.digest_send_logs
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all digest logs" ON public.digest_send_logs;
CREATE POLICY "Admins can view all digest logs"
ON public.digest_send_logs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_digest_send_logs_user_sent ON public.digest_send_logs(user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_preferences_digest_time ON public.user_preferences(digest_enabled, digest_send_time);

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 1) Lock down digest_send_logs writes to server-side only
DROP POLICY IF EXISTS "Users can create their own digest logs" ON public.digest_send_logs;

-- 2) Explicitly deny INSERT/UPDATE/DELETE on user_roles from clients
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM anon, authenticated;

-- 3) Restrict SECURITY DEFINER functions
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

CREATE TYPE public.affiliate_application_status AS ENUM ('pending','approved','rejected','suspended');
CREATE TYPE public.affiliate_profile_status     AS ENUM ('active','suspended','revoked');
CREATE TYPE public.affiliate_commission_type    AS ENUM ('percentage','flat');
CREATE TYPE public.affiliate_commission_status  AS ENUM ('pending','approved','paid','reversed','canceled');
CREATE TYPE public.affiliate_payout_status      AS ENUM ('pending','paid','failed','canceled');
CREATE TYPE public.affiliate_referral_status    AS ENUM ('pending','confirmed','rejected');
CREATE TYPE public.affiliate_conversion_type    AS ENUM ('signup','paid_upgrade','custom');

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

CREATE TRIGGER affiliate_settings_updated     BEFORE UPDATE ON public.affiliate_settings     FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER affiliate_applications_updated BEFORE UPDATE ON public.affiliate_applications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER affiliate_profiles_updated     BEFORE UPDATE ON public.affiliate_profiles     FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER affiliate_referrals_updated    BEFORE UPDATE ON public.affiliate_referrals    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER affiliate_commissions_updated  BEFORE UPDATE ON public.affiliate_commissions  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER affiliate_payouts_updated      BEFORE UPDATE ON public.affiliate_payouts      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

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

CREATE OR REPLACE FUNCTION public.lookup_affiliate_by_code(_code TEXT)
RETURNS TABLE (profile_id UUID, code TEXT, is_active BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, affiliate_code, (status = 'active')
  FROM public.affiliate_profiles
  WHERE affiliate_code = _code
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.lookup_affiliate_by_code(TEXT) TO anon, authenticated;

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
  IF prof.user_id = uid THEN RETURN NULL; END IF;

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

CREATE TABLE public.affiliate_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  affiliate_profile_id UUID NOT NULL REFERENCES public.affiliate_profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  landing_path TEXT NOT NULL DEFAULT '/',
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  notes TEXT,
  click_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.affiliate_campaigns TO authenticated;
GRANT ALL ON public.affiliate_campaigns TO service_role;
ALTER TABLE public.affiliate_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Affiliates manage their own campaigns"
  ON public.affiliate_campaigns FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.affiliate_profiles p
             WHERE p.id = affiliate_profile_id AND p.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.affiliate_profiles p
             WHERE p.id = affiliate_profile_id AND p.user_id = auth.uid())
  );

CREATE POLICY "Admins can view all campaigns"
  ON public.affiliate_campaigns FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_affiliate_campaigns_updated_at
  BEFORE UPDATE ON public.affiliate_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_affiliate_campaigns_profile ON public.affiliate_campaigns(affiliate_profile_id);

CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
  ON public.notifications FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "Users can update their own notifications"
  ON public.notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins can view all notifications"
  ON public.notifications FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX idx_notifications_user_all ON public.notifications(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.enqueue_notification(
  _user_id UUID, _type TEXT, _title TEXT, _body TEXT DEFAULT NULL,
  _link TEXT DEFAULT NULL, _metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE nid UUID;
BEGIN
  INSERT INTO public.notifications (user_id, type, title, body, link, metadata)
  VALUES (_user_id, _type, _title, _body, _link, COALESCE(_metadata, '{}'::jsonb))
  RETURNING id INTO nid;
  RETURN nid;
END $$;

CREATE OR REPLACE FUNCTION public.notify_admins(
  _type TEXT, _title TEXT, _body TEXT DEFAULT NULL,
  _link TEXT DEFAULT NULL, _metadata JSONB DEFAULT '{}'::jsonb
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n INTEGER := 0;
BEGIN
  INSERT INTO public.notifications (user_id, type, title, body, link, metadata)
  SELECT ur.user_id, _type, _title, _body, _link, COALESCE(_metadata, '{}'::jsonb)
  FROM public.user_roles ur
  WHERE ur.role = 'admin';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.trg_notify_new_application()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.notify_admins(
    'affiliate_application_new',
    'New affiliate application',
    COALESCE(NEW.full_name, NEW.email) || ' applied to the affiliate program',
    '/admin/affiliates',
    jsonb_build_object('application_id', NEW.id, 'user_id', NEW.user_id)
  );
  RETURN NEW;
END $$;
CREATE TRIGGER notify_new_affiliate_application
  AFTER INSERT ON public.affiliate_applications
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_new_application();

CREATE OR REPLACE FUNCTION public.approve_affiliate_application(_application_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
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

  PERFORM public.enqueue_notification(
    app.user_id, 'affiliate_application_approved',
    'You''re in! Affiliate application approved',
    'Head to your affiliate dashboard to grab your referral link.',
    '/affiliate/dashboard',
    jsonb_build_object('application_id', _application_id, 'profile_id', new_profile_id)
  );

  RETURN new_profile_id;
END $function$;

CREATE OR REPLACE FUNCTION public.reject_affiliate_application(_application_id uuid, _reason text DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE app RECORD;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Only admins can reject applications';
  END IF;
  SELECT * INTO app FROM public.affiliate_applications WHERE id = _application_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found'; END IF;

  UPDATE public.affiliate_applications
    SET status='rejected', reviewed_by=auth.uid(), reviewed_date=now(),
        rejection_reason = COALESCE(_reason, rejection_reason)
    WHERE id = _application_id;

  PERFORM public.enqueue_notification(
    app.user_id, 'affiliate_application_rejected',
    'Affiliate application update',
    COALESCE(_reason, 'Your affiliate application was not approved at this time.'),
    '/affiliate',
    jsonb_build_object('application_id', _application_id)
  );
END $$;

CREATE OR REPLACE FUNCTION public.admin_create_payout(
  _affiliate_profile_id UUID,
  _amount NUMERIC,
  _payout_method TEXT,
  _reference TEXT DEFAULT NULL,
  _notes TEXT DEFAULT NULL,
  _commission_ids UUID[] DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE payout_id UUID;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Only admins can create payouts';
  END IF;

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

  RETURN payout_id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_mark_payout_paid(
  _payout_id UUID,
  _reference TEXT DEFAULT NULL,
  _payout_method TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p RECORD; affiliate_user UUID;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Only admins can mark payouts paid';
  END IF;

  SELECT * INTO p FROM public.affiliate_payouts WHERE id = _payout_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payout not found'; END IF;

  UPDATE public.affiliate_payouts
    SET status='paid',
        payout_date = COALESCE(payout_date, now()),
        reference = COALESCE(_reference, reference),
        payout_method = COALESCE(_payout_method, payout_method)
    WHERE id = _payout_id;

  UPDATE public.affiliate_commissions
    SET status='paid', paid_date = now()
    WHERE affiliate_payout_id = _payout_id;

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
END $$;

ALTER TABLE public.affiliate_payouts
  ADD COLUMN IF NOT EXISTS reference TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID;

ALTER TABLE public.affiliate_applications
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;