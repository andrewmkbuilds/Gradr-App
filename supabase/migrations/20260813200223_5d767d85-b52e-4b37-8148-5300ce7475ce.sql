ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS followup_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS followup_days integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS followup_stages text[] NOT NULL DEFAULT ARRAY['applied','interview']::text[];