ALTER TABLE public.voice_provider_events
  ADD COLUMN IF NOT EXISTS provider_detail text,
  ADD COLUMN IF NOT EXISTS persona_id text;

CREATE INDEX IF NOT EXISTS voice_provider_events_request_idx
  ON public.voice_provider_events (request_id);