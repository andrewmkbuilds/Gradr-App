CREATE TABLE IF NOT EXISTS public.company_research (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key text NOT NULL UNIQUE,
  company text NOT NULL,
  role text,
  payload jsonb NOT NULL,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  provider text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.company_research TO authenticated;
GRANT ALL ON public.company_research TO service_role;

ALTER TABLE public.company_research ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read cached research" ON public.company_research;
CREATE POLICY "Authenticated users can read cached research"
ON public.company_research FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS company_research_created_idx ON public.company_research (created_at DESC);

ALTER TABLE public.tracked_jobs ADD COLUMN IF NOT EXISTS details jsonb;