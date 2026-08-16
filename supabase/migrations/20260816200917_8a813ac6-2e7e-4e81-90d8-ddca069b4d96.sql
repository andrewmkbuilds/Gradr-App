SELECT vault.create_secret('aoiiPlL70IB3LkT-PSuUjpkUaUIQP1RozCwP8rxf8h0', 'email_queue_cron_secret');

SELECT cron.schedule(
  'process-email-queue',
  '10 seconds',
  $cron$
  SELECT net.http_post(
    url := 'https://zdlajleqgmmbfsdnelch.supabase.co/functions/v1/process-email-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_cron_secret' LIMIT 1)
    ),
    body := '{}'::jsonb
  )
  WHERE NOT EXISTS (
    SELECT 1 FROM public.email_send_state
    WHERE retry_after_until IS NOT NULL AND retry_after_until > now()
  );
  $cron$
);