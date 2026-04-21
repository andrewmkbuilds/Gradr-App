ALTER TABLE public.tracked_jobs ADD COLUMN IF NOT EXISTS application_pack jsonb;
ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS onboarded boolean NOT NULL DEFAULT false;
ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS digest_enabled boolean NOT NULL DEFAULT true;