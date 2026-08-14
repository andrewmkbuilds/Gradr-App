CREATE TABLE IF NOT EXISTS public.voice_provider_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  model_id text NOT NULL DEFAULT 'eleven_turbo_v2_5',
  output_format text NOT NULL DEFAULT 'mp3_44100_128',
  voice_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.voice_provider_config TO authenticated;
GRANT ALL ON public.voice_provider_config TO service_role;
ALTER TABLE public.voice_provider_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read voice config"
ON public.voice_provider_config FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.voice_provider_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.voice_provider_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  outcome text NOT NULL CHECK (outcome IN ('ok','failure')),
  code text,
  provider_reason text,
  upstream_status integer,
  request_id text,
  context text NOT NULL DEFAULT 'interview',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS voice_provider_events_user_created_idx
  ON public.voice_provider_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS voice_provider_events_created_idx
  ON public.voice_provider_events (created_at DESC);

GRANT SELECT ON public.voice_provider_events TO authenticated;
GRANT ALL ON public.voice_provider_events TO service_role;
ALTER TABLE public.voice_provider_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own voice events"
ON public.voice_provider_events FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins read all voice events"
ON public.voice_provider_events FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));