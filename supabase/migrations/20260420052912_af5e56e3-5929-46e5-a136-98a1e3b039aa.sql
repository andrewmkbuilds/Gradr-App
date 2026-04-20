-- user_preferences
CREATE TABLE public.user_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  target_role TEXT,
  locations TEXT[] DEFAULT '{}',
  remote_preference TEXT DEFAULT 'any', -- any | remote | hybrid | onsite
  salary_min INTEGER,
  experience_level TEXT, -- entry | mid | senior | lead
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
  source TEXT DEFAULT 'manual', -- adzuna | linkedin | manual
  title TEXT NOT NULL,
  company TEXT,
  location TEXT,
  remote BOOLEAN DEFAULT false,
  url TEXT,
  salary_min INTEGER,
  salary_max INTEGER,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'saved', -- saved | applied | interview | offer | rejected
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