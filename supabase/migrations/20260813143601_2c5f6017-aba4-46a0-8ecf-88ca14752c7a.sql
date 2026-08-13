
CREATE TABLE IF NOT EXISTS public.security_scan_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scanned_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'manual',
  finding_count integer NOT NULL DEFAULT 0,
  internal_ids text[] NOT NULL DEFAULT '{}',
  counts_by_level jsonb NOT NULL DEFAULT '{}'::jsonb,
  findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  commit_sha text,
  commit_url text,
  branch text,
  pr_number integer,
  pr_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS security_scan_runs_scanned_at_idx ON public.security_scan_runs (scanned_at DESC);

GRANT SELECT ON public.security_scan_runs TO authenticated;
GRANT ALL ON public.security_scan_runs TO service_role;
ALTER TABLE public.security_scan_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read security scan runs"
  ON public.security_scan_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.permission_denied_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route text NOT NULL,
  authenticated boolean NOT NULL DEFAULT false,
  code text,
  relation text,
  message text,
  mentions_has_role boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS permission_denied_signals_created_idx
  ON public.permission_denied_signals (created_at DESC);

GRANT SELECT ON public.permission_denied_signals TO authenticated;
GRANT ALL ON public.permission_denied_signals TO service_role;
ALTER TABLE public.permission_denied_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read permission denied signals"
  ON public.permission_denied_signals FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
