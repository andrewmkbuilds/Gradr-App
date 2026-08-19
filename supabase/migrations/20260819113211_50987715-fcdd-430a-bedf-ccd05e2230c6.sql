CREATE TABLE IF NOT EXISTS public.scheduled_plan_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  environment text NOT NULL DEFAULT 'sandbox',
  subscription_id text NOT NULL,
  target_price_id text NOT NULL,
  target_tier text NOT NULL,
  target_interval text NOT NULL,
  effective_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  applied_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sched_plan_pending
  ON public.scheduled_plan_changes(subscription_id, environment)
  WHERE status = 'pending';

GRANT SELECT ON public.scheduled_plan_changes TO authenticated;
GRANT ALL ON public.scheduled_plan_changes TO service_role;

ALTER TABLE public.scheduled_plan_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own scheduled plan changes readable"
  ON public.scheduled_plan_changes FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_scheduled_plan_changes_updated
  BEFORE UPDATE ON public.scheduled_plan_changes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();