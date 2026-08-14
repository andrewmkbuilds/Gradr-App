-- 1. analytics_events: bound the client-controlled metadata payload
DROP POLICY IF EXISTS "insert own analytics events" ON public.analytics_events;
CREATE POLICY "insert own analytics events"
ON public.analytics_events
FOR INSERT
TO anon, authenticated
WITH CHECK (
  ((user_id IS NULL) OR (user_id = auth.uid()))
  AND length(COALESCE(event_name, '')) BETWEEN 1 AND 128
  AND length(COALESCE(path, '')) <= 2048
  AND length(COALESCE(referrer, '')) <= 2048
  AND (
    metadata IS NULL
    OR (jsonb_typeof(metadata) = 'object' AND length(metadata::text) <= 4096)
  )
);

-- 2. oauth_flow_events: no spoofing another user's telemetry
DROP POLICY IF EXISTS "oauth_flow_events_insert_any_signin" ON public.oauth_flow_events;
CREATE POLICY "oauth_flow_events_insert_own_signin"
ON public.oauth_flow_events
FOR INSERT
TO anon, authenticated
WITH CHECK (
  (user_id IS NULL OR user_id = auth.uid())
  AND length(COALESCE(source_url, '')) <= 2048
  AND length(COALESCE(destination_url, '')) <= 2048
  AND length(COALESCE(final_url, '')) <= 2048
  AND length(COALESCE(note, '')) <= 1024
  AND (
    metadata IS NULL
    OR (jsonb_typeof(metadata) = 'object' AND length(metadata::text) <= 4096)
  )
);

-- 3. webhook_delivery_logs: admin-only, non-guest sessions
DROP POLICY IF EXISTS "Admins read webhook delivery logs" ON public.webhook_delivery_logs;
CREATE POLICY "Admins read webhook delivery logs"
ON public.webhook_delivery_logs
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND NOT public.is_anonymous_session()
  AND public.has_role(auth.uid(), 'admin'::app_role)
);

-- 4. pin search_path on the email-queue SECURITY DEFINER helpers
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pgmq;
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pgmq;

-- 5. drop unnecessary authenticated EXECUTE on a backend-only definer function
REVOKE EXECUTE ON FUNCTION public.has_domain_proof(uuid, text) FROM authenticated;