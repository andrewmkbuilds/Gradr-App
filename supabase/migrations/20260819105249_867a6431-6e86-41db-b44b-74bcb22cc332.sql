select vault.create_secret('8bf9400aaa8b78074d6ab6af2411b25749f33bf608238898', 'billing_watchdog_cron_secret', 'Secret used by pg_cron to call the payments-watchdog function');

select cron.schedule(
  'payments-watchdog',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://zdlajleqgmmbfsdnelch.supabase.co/functions/v1/payments-watchdog',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'billing_watchdog_cron_secret' LIMIT 1)
    ),
    body := '{}'::jsonb
  )
  $$
);