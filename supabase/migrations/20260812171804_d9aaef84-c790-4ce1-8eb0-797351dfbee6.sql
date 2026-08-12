-- 1. job_reminders: verify the referenced tracked job belongs to the caller
DROP POLICY IF EXISTS "own reminders insert" ON public.job_reminders;
CREATE POLICY "own reminders insert"
ON public.job_reminders
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.tracked_jobs tj
    WHERE tj.id = job_reminders.tracked_job_id
      AND tj.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "own reminders update" ON public.job_reminders;
CREATE POLICY "own reminders update"
ON public.job_reminders
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.tracked_jobs tj
    WHERE tj.id = job_reminders.tracked_job_id
      AND tj.user_id = auth.uid()
  )
);

-- 2. user_integrations: inline the anonymous-session check so it is statically verifiable
DROP POLICY IF EXISTS "Members read their own integrations" ON public.user_integrations;
CREATE POLICY "Members read their own integrations"
ON public.user_integrations
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  AND coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
);

DROP POLICY IF EXISTS "Members insert their own integrations" ON public.user_integrations;
CREATE POLICY "Members insert their own integrations"
ON public.user_integrations
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
);

DROP POLICY IF EXISTS "Members update their own integrations" ON public.user_integrations;
CREATE POLICY "Members update their own integrations"
ON public.user_integrations
FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id
  AND coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
)
WITH CHECK (
  auth.uid() = user_id
  AND coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
);

DROP POLICY IF EXISTS "Members delete their own integrations" ON public.user_integrations;
CREATE POLICY "Members delete their own integrations"
ON public.user_integrations
FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
  AND coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
);

-- 3. Revoke direct client EXECUTE on SECURITY DEFINER helpers that only ever run
--    inside RLS policies / other definer functions.
REVOKE ALL ON FUNCTION public.affiliate_click_is_valid(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_anonymous_session() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.log_admin_access_denied(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.log_user_preferences_read(text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.attribute_signup_referral(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lookup_affiliate_by_code(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_affiliate_public_settings() FROM PUBLIC;