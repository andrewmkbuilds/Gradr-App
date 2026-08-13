CREATE TABLE public.fingerprint_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at timestamptz NOT NULL DEFAULT now(),
  origin text NOT NULL DEFAULT 'https://gradr.me',
  source text NOT NULL DEFAULT 'ci',
  commit_sha text,
  branch text,
  run_id text,
  run_url text,
  artifact_url text,
  signal_count integer NOT NULL DEFAULT 0,
  severity text NOT NULL DEFAULT 'info',
  added jsonb NOT NULL DEFAULT '[]'::jsonb,
  removed jsonb NOT NULL DEFAULT '[]'::jsonb,
  changed jsonb NOT NULL DEFAULT '[]'::jsonb,
  signals jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fingerprint_snapshots_captured_idx ON public.fingerprint_snapshots (captured_at DESC);

GRANT SELECT ON public.fingerprint_snapshots TO authenticated;
GRANT ALL ON public.fingerprint_snapshots TO service_role;
ALTER TABLE public.fingerprint_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read fingerprint snapshots"
  ON public.fingerprint_snapshots FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.security_digest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  triggered_by text NOT NULL DEFAULT 'cron',
  channels text[] NOT NULL DEFAULT '{}',
  dry_run boolean NOT NULL DEFAULT false,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  delivery_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX security_digest_runs_created_idx ON public.security_digest_runs (created_at DESC);

GRANT SELECT ON public.security_digest_runs TO authenticated;
GRANT ALL ON public.security_digest_runs TO service_role;
ALTER TABLE public.security_digest_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read security digest runs"
  ON public.security_digest_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));