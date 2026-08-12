-- 1. Paddle customer mirror --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.paddle_customers (
  customer_id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text NOT NULL,
  environment text NOT NULL DEFAULT 'sandbox',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.paddle_customers TO authenticated;
GRANT ALL ON public.paddle_customers TO service_role;
ALTER TABLE public.paddle_customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own paddle customer" ON public.paddle_customers;
CREATE POLICY "Users read own paddle customer"
  ON public.paddle_customers FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 2. Paddle subscription mirror ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.paddle_subscriptions (
  subscription_id text PRIMARY KEY,
  customer_id text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL,
  price_id text NOT NULL,
  product_id text NOT NULL,
  scheduled_change_action text,
  scheduled_change_at timestamptz,
  current_period_end timestamptz,
  environment text NOT NULL DEFAULT 'sandbox',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_paddle_subscriptions_user
  ON public.paddle_subscriptions(user_id, environment);
CREATE INDEX IF NOT EXISTS idx_paddle_subscriptions_customer
  ON public.paddle_subscriptions(customer_id);

GRANT SELECT ON public.paddle_subscriptions TO authenticated;
GRANT ALL ON public.paddle_subscriptions TO service_role;
ALTER TABLE public.paddle_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own paddle subscriptions" ON public.paddle_subscriptions;
CREATE POLICY "Users read own paddle subscriptions"
  ON public.paddle_subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP TRIGGER IF EXISTS trg_paddle_customers_updated ON public.paddle_customers;
CREATE TRIGGER trg_paddle_customers_updated
  BEFORE UPDATE ON public.paddle_customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_paddle_subscriptions_updated ON public.paddle_subscriptions;
CREATE TRIGGER trg_paddle_subscriptions_updated
  BEFORE UPDATE ON public.paddle_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Access helper -------------------------------------------------------------
-- active + trialing grant access. A pending scheduled cancellation/pause does
-- NOT revoke access; only a real 'canceled'/'paused' status (or a lapsed paid
-- period) does. past_due keeps access while Paddle retries (dunning).
CREATE OR REPLACE FUNCTION public.subscription_grants_access(
  _status text, _current_period_end timestamptz
) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN lower(_status) IN ('active', 'trialing', 'past_due') THEN true
    WHEN lower(_status) = 'canceled'
      THEN _current_period_end IS NOT NULL AND _current_period_end > now()
    ELSE false
  END;
$$;

REVOKE ALL ON FUNCTION public.subscription_grants_access(text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.subscription_grants_access(text, timestamptz) TO authenticated, service_role;

-- 4. Advanced tier gets unlimited monthly usage, like Pro ----------------------
CREATE OR REPLACE FUNCTION public.plan_allowance(_tier text, _feature text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE lower(_tier)
    WHEN 'advanced' THEN NULL::integer         -- unlimited
    WHEN 'pro' THEN NULL::integer              -- unlimited
    WHEN 'starter' THEN CASE _feature
      WHEN 'resume' THEN 20 WHEN 'application' THEN 10 WHEN 'interview' THEN 8 ELSE 20 END
    ELSE CASE _feature
      WHEN 'resume' THEN 3 WHEN 'application' THEN 1 WHEN 'interview' THEN 2 ELSE 3 END
  END;
$$;