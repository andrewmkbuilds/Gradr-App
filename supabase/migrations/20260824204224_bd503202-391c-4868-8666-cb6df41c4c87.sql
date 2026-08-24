CREATE TABLE public.billing_retention_records (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_ref text NOT NULL,
  provider text NOT NULL DEFAULT 'paddle',
  record_kind text NOT NULL DEFAULT 'purchase',
  provider_reference text,
  amount_total numeric,
  currency text,
  environment text,
  occurred_at timestamptz,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.billing_retention_records IS 'Minimal, pseudonymised billing facts kept after account deletion so tax/accounting retention duties can be met. user_ref is a one-way hash of the deleted auth user id; contains no name, email or address.';

GRANT SELECT ON public.billing_retention_records TO authenticated;
GRANT ALL ON public.billing_retention_records TO service_role;

ALTER TABLE public.billing_retention_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read billing retention records"
ON public.billing_retention_records
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_billing_retention_user_ref ON public.billing_retention_records (user_ref);