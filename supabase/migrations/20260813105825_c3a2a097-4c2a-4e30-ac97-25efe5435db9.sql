DO $$
DECLARE
  key text;
BEGIN
  SELECT decrypted_secret INTO key
  FROM vault.decrypted_secrets
  WHERE name = 'email_queue_service_role_key'
  LIMIT 1;

  IF key IS NULL THEN
    RAISE NOTICE 'email_queue_service_role_key not in vault; anomaly cron not scheduled';
    RETURN;
  END IF;

  PERFORM cron.unschedule('email-anomaly-detection')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'email-anomaly-detection');

  PERFORM cron.schedule(
    'email-anomaly-detection',
    '5 * * * *',
    format(
      $job$
      SELECT net.http_post(
        url := 'https://gradr.me/api/public/email-anomaly',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer %s'),
        body := '{}'::jsonb,
        timeout_milliseconds := 20000
      );
      $job$,
      key
    )
  );
END
$$;