-- 1) Richer career targeting preferences
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS industries text[],
  ADD COLUMN IF NOT EXISTS job_types text[],
  ADD COLUMN IF NOT EXISTS salary_max integer,
  ADD COLUMN IF NOT EXISTS target_roles text[],
  ADD COLUMN IF NOT EXISTS onboarded_at timestamptz;

-- 2) Per-application follow-up cadence
ALTER TABLE public.tracked_jobs
  ADD COLUMN IF NOT EXISTS follow_up_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS follow_up_days integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS last_touch_at timestamptz;

-- 3) Personalised next-3-days plans
CREATE TABLE IF NOT EXISTS public.career_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz NOT NULL DEFAULT (now() + interval '3 days'),
  summary text,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS career_plans_user_created_idx
  ON public.career_plans (user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.career_plans TO authenticated;
GRANT ALL ON public.career_plans TO service_role;

ALTER TABLE public.career_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "career_plans_owner_select" ON public.career_plans;
CREATE POLICY "career_plans_owner_select" ON public.career_plans
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE);

DROP POLICY IF EXISTS "career_plans_owner_insert" ON public.career_plans;
CREATE POLICY "career_plans_owner_insert" ON public.career_plans
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE);

DROP POLICY IF EXISTS "career_plans_owner_update" ON public.career_plans;
CREATE POLICY "career_plans_owner_update" ON public.career_plans
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE)
  WITH CHECK (auth.uid() = user_id AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE);

DROP POLICY IF EXISTS "career_plans_owner_delete" ON public.career_plans;
CREATE POLICY "career_plans_owner_delete" ON public.career_plans
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE);

CREATE TRIGGER career_plans_set_updated_at
  BEFORE UPDATE ON public.career_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();