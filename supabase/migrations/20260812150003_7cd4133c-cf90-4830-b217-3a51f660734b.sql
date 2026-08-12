CREATE TABLE public.seo_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property TEXT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  clicks INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  ctr NUMERIC NOT NULL DEFAULT 0,
  avg_position NUMERIC,
  top_queries JSONB NOT NULL DEFAULT '[]'::jsonb,
  top_pages JSONB NOT NULL DEFAULT '[]'::jsonb,
  sitemaps JSONB NOT NULL DEFAULT '[]'::jsonb,
  inspections JSONB NOT NULL DEFAULT '[]'::jsonb,
  lighthouse JSONB NOT NULL DEFAULT '{}'::jsonb,
  alerts JSONB NOT NULL DEFAULT '[]'::jsonb,
  changes JSONB NOT NULL DEFAULT '[]'::jsonb
);

GRANT SELECT ON public.seo_snapshots TO authenticated;
GRANT ALL ON public.seo_snapshots TO service_role;

ALTER TABLE public.seo_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read SEO snapshots"
ON public.seo_snapshots
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX seo_snapshots_captured_at_idx ON public.seo_snapshots (captured_at DESC);