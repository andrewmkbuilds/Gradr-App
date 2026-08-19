-- 1. Append-only ledger of entitlement / credit movements.
CREATE TABLE public.entitlement_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  environment text NOT NULL DEFAULT 'sandbox',
  entry_type text NOT NULL,
  feature text NOT NULL,
  delta integer NOT NULL DEFAULT 0,
  balance_after integer,
  reason text,
  source text NOT NULL DEFAULT 'payments-webhook',
  provider_event_id text,
  transaction_id text,
  subscription_id text,
  amount numeric,
  currency text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.entitlement_ledger TO authenticated;
GRANT ALL ON public.entitlement_ledger TO service_role;

ALTER TABLE public.entitlement_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own entitlement ledger"
  ON public.entitlement_ledger FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins read all entitlement ledger"
  ON public.entitlement_ledger FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_entitlement_ledger_user ON public.entitlement_ledger(user_id, environment, created_at DESC);
CREATE UNIQUE INDEX idx_entitlement_ledger_event_feature
  ON public.entitlement_ledger(provider_event_id, feature, entry_type)
  WHERE provider_event_id IS NOT NULL;

-- 2. Per-user notification channel preferences for billing messaging.
CREATE TABLE public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  dunning_email boolean NOT NULL DEFAULT true,
  dunning_in_app boolean NOT NULL DEFAULT true,
  renewal_email boolean NOT NULL DEFAULT true,
  renewal_in_app boolean NOT NULL DEFAULT true,
  webhook_issue_email boolean NOT NULL DEFAULT false,
  webhook_issue_in_app boolean NOT NULL DEFAULT true,
  refund_email boolean NOT NULL DEFAULT true,
  refund_in_app boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own notification preferences"
  ON public.notification_preferences FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own notification preferences"
  ON public.notification_preferences FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own notification preferences"
  ON public.notification_preferences FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_notification_preferences_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Audit trail of test-environment payment simulations.
CREATE TABLE public.payment_simulations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL,
  scenario text NOT NULL,
  environment text NOT NULL DEFAULT 'sandbox',
  target_user_id uuid,
  ok boolean NOT NULL DEFAULT false,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.payment_simulations TO authenticated;
GRANT ALL ON public.payment_simulations TO service_role;

ALTER TABLE public.payment_simulations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read payment simulations"
  ON public.payment_simulations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_payment_simulations_created ON public.payment_simulations(created_at DESC);

-- 4. Channel resolver used by edge functions when messaging a user.
CREATE OR REPLACE FUNCTION public.notification_channels(_user_id uuid, _category text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE _category
    WHEN 'dunning' THEN jsonb_build_object('email', COALESCE(p.dunning_email, true), 'in_app', COALESCE(p.dunning_in_app, true))
    WHEN 'renewal' THEN jsonb_build_object('email', COALESCE(p.renewal_email, true), 'in_app', COALESCE(p.renewal_in_app, true))
    WHEN 'webhook_issue' THEN jsonb_build_object('email', COALESCE(p.webhook_issue_email, false), 'in_app', COALESCE(p.webhook_issue_in_app, true))
    WHEN 'refund' THEN jsonb_build_object('email', COALESCE(p.refund_email, true), 'in_app', COALESCE(p.refund_in_app, true))
    ELSE jsonb_build_object('email', true, 'in_app', true)
  END
  FROM (SELECT 1) AS one
  LEFT JOIN public.notification_preferences p ON p.user_id = _user_id;
$$;