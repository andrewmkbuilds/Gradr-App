ALTER TABLE public.webhook_deliveries
  ADD COLUMN IF NOT EXISTS payload jsonb,
  ADD COLUMN IF NOT EXISTS signature_verified boolean,
  ADD COLUMN IF NOT EXISTS replay_of uuid REFERENCES public.webhook_deliveries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS replays integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS processed_at timestamptz;

CREATE INDEX IF NOT EXISTS webhook_deliveries_created_idx
  ON public.webhook_deliveries (created_at DESC);

ALTER TABLE public.api_health_alerts
  ADD COLUMN IF NOT EXISTS notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS notify_error text;