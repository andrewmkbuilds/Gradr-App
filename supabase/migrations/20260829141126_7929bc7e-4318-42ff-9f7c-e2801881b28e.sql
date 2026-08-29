CREATE TABLE IF NOT EXISTS public.voice_provider_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  outcome text NOT NULL CHECK (outcome IN ('ok','failure')),
  code text,
  provider_reason text,
  upstream_status integer,
  request_id text,
  persona_id text,
  provider_detail text,
  context text NOT NULL DEFAULT 'interview',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS voice_provider_events_created_at_idx ON public.voice_provider_events (created_at DESC);
CREATE INDEX IF NOT EXISTS voice_provider_events_request_id_idx ON public.voice_provider_events (request_id);

GRANT ALL ON public.voice_provider_events TO service_role;
ALTER TABLE public.voice_provider_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read voice events" ON public.voice_provider_events;
CREATE POLICY "Admins read voice events" ON public.voice_provider_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.voice_provider_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  model_id text NOT NULL DEFAULT 'eleven_turbo_v2_5',
  output_format text NOT NULL DEFAULT 'mp3_22050_32',
  voice_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  deepgram_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.voice_provider_config TO service_role;
ALTER TABLE public.voice_provider_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read voice config" ON public.voice_provider_config;
CREATE POLICY "Admins read voice config" ON public.voice_provider_config
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));