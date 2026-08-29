-- 1) Career plan generation upserts on user_id but no uniqueness existed (42P10).
CREATE UNIQUE INDEX IF NOT EXISTS career_plans_user_key ON public.career_plans (user_id);

-- 2) Entitlement ledger idempotency key was a PARTIAL unique index, which
--    Postgres cannot use for ON CONFLICT inference, so every ledger write from
--    the payments webhook failed. NULL provider_event_id rows stay distinct.
DROP INDEX IF EXISTS public.idx_entitlement_ledger_event_feature;
CREATE UNIQUE INDEX IF NOT EXISTS idx_entitlement_ledger_event_feature
  ON public.entitlement_ledger (provider_event_id, feature, entry_type);

-- 3) Table referenced by verify-academic-email but never created: without it the
--    "one school address unlocks one account" guard silently passed.
CREATE TABLE IF NOT EXISTS public.verification_email_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  user_id uuid NOT NULL,
  domain text,
  last_verified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.verification_email_claims TO service_role;
ALTER TABLE public.verification_email_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read their own academic email claim"
  ON public.verification_email_claims FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
GRANT SELECT ON public.verification_email_claims TO authenticated;

-- 4) Table referenced by the security-findings admin function but never created.
CREATE TABLE IF NOT EXISTS public.security_finding_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  internal_id text NOT NULL,
  repo text NOT NULL,
  run_id uuid,
  issue_number integer,
  issue_url text,
  commit_sha text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (repo, internal_id)
);
GRANT ALL ON public.security_finding_issues TO service_role;
ALTER TABLE public.security_finding_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read security finding issues"
  ON public.security_finding_issues FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
GRANT SELECT ON public.security_finding_issues TO authenticated;