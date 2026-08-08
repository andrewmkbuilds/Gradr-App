CREATE TABLE public.interview_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_role TEXT,
  duration_sec INTEGER NOT NULL DEFAULT 0,
  overall_score INTEGER,
  report JSONB NOT NULL,
  integrity JSONB,
  transcript JSONB,
  practice_plan JSONB,
  focus_areas TEXT[],
  pdf_path TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.interview_sessions TO authenticated;
GRANT ALL ON public.interview_sessions TO service_role;

ALTER TABLE public.interview_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own interview sessions"
ON public.interview_sessions FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_interview_sessions_user_created ON public.interview_sessions(user_id, created_at DESC);