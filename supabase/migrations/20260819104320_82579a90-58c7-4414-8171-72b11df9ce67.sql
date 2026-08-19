
DROP INDEX IF EXISTS public.billing_events_dedupe;
CREATE UNIQUE INDEX billing_events_dedupe
  ON public.billing_events(user_id, environment, event_type, transaction_id, subscription_id, occurred_at)
  NULLS NOT DISTINCT;
