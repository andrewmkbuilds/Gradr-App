-- 1. Interview session metrics
CREATE TABLE public.interview_session_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_id uuid,
  provider text NOT NULL DEFAULT 'gemini_live',
  target_role text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_sec integer NOT NULL DEFAULT 0,
  minutes_used numeric NOT NULL DEFAULT 0,
  barge_in_count integer NOT NULL DEFAULT 0,
  interruption_count integer NOT NULL DEFAULT 0,
  dropout_count integer NOT NULL DEFAULT 0,
  reconnect_count integer NOT NULL DEFAULT 0,
  turn_count integer NOT NULL DEFAULT 0,
  first_token_latency_ms integer,
  avg_latency_ms integer,
  p95_latency_ms integer,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  end_reason text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interview_session_metrics TO authenticated;
GRANT ALL ON public.interview_session_metrics TO service_role;
ALTER TABLE public.interview_session_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own metrics select" ON public.interview_session_metrics FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own metrics insert" ON public.interview_session_metrics FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own metrics update" ON public.interview_session_metrics FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own metrics delete" ON public.interview_session_metrics FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX idx_ism_user_started ON public.interview_session_metrics(user_id, started_at DESC);
CREATE TRIGGER trg_ism_updated BEFORE UPDATE ON public.interview_session_metrics
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Resumable live session state
CREATE TABLE public.interview_session_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_key text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  persona text,
  difficulty text,
  target_role text,
  turn_index integer NOT NULL DEFAULT 0,
  interviewer_state text NOT NULL DEFAULT 'idle',
  transcript jsonb NOT NULL DEFAULT '[]'::jsonb,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  elapsed_sec integer NOT NULL DEFAULT 0,
  last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, session_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interview_session_state TO authenticated;
GRANT ALL ON public.interview_session_state TO service_role;
ALTER TABLE public.interview_session_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own state select" ON public.interview_session_state FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own state insert" ON public.interview_session_state FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own state update" ON public.interview_session_state FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own state delete" ON public.interview_session_state FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER trg_iss_updated BEFORE UPDATE ON public.interview_session_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Scheduled interviews (manual + Google Calendar imports)
CREATE TABLE public.scheduled_interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  kind text NOT NULL DEFAULT 'mock',
  target_role text,
  company text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  timezone text,
  location text,
  notes text,
  source text NOT NULL DEFAULT 'manual',
  external_event_id text,
  calendar_id text,
  html_link text,
  reminder_sent_at timestamptz,
  followup_sent_at timestamptz,
  status text NOT NULL DEFAULT 'scheduled',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source, external_event_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduled_interviews TO authenticated;
GRANT ALL ON public.scheduled_interviews TO service_role;
ALTER TABLE public.scheduled_interviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sched select" ON public.scheduled_interviews FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own sched insert" ON public.scheduled_interviews FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own sched update" ON public.scheduled_interviews FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own sched delete" ON public.scheduled_interviews FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX idx_sched_user_start ON public.scheduled_interviews(user_id, starts_at);
CREATE TRIGGER trg_sched_updated BEFORE UPDATE ON public.scheduled_interviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Email notification log
CREATE TABLE public.email_notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  template text NOT NULL,
  recipient text NOT NULL,
  subject text NOT NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'sent',
  provider_message_id text,
  error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key)
);
GRANT SELECT ON public.email_notification_log TO authenticated;
GRANT ALL ON public.email_notification_log TO service_role;
ALTER TABLE public.email_notification_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own email log select" ON public.email_notification_log FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 5. Deduplicated discovered jobs cache
CREATE TABLE public.discovered_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key text NOT NULL,
  source text NOT NULL,
  external_id text,
  title text NOT NULL,
  company text,
  location text,
  remote boolean,
  url text NOT NULL,
  salary_min integer,
  salary_max integer,
  currency text,
  description text,
  posted_at timestamptz,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dedupe_key)
);
GRANT SELECT ON public.discovered_jobs TO authenticated;
GRANT ALL ON public.discovered_jobs TO service_role;
ALTER TABLE public.discovered_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signed in can read jobs" ON public.discovered_jobs FOR SELECT TO authenticated USING (true);
CREATE INDEX idx_discovered_last_seen ON public.discovered_jobs(last_seen_at DESC);
CREATE INDEX idx_discovered_source ON public.discovered_jobs(source);