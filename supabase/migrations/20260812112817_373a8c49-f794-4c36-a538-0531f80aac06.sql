-- 1) Scope affiliate_campaigns + notifications policies to the authenticated role
DROP POLICY IF EXISTS "Admins can view all campaigns" ON public.affiliate_campaigns;
CREATE POLICY "Admins can view all campaigns"
ON public.affiliate_campaigns
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Affiliates manage their own campaigns" ON public.affiliate_campaigns;
CREATE POLICY "Affiliates manage their own campaigns"
ON public.affiliate_campaigns
FOR ALL
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.affiliate_profiles p
  WHERE p.id = affiliate_campaigns.affiliate_profile_id
    AND p.user_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.affiliate_profiles p
  WHERE p.id = affiliate_campaigns.affiliate_profile_id
    AND p.user_id = auth.uid()
));

DROP POLICY IF EXISTS "Admins can view all notifications" ON public.notifications;
CREATE POLICY "Admins can view all notifications"
ON public.notifications
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications"
ON public.notifications
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications"
ON public.notifications
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- 2) user_roles: exclude anonymous (guest) sessions from reading role records.
-- Guest accounts hold the 'authenticated' role but must never resolve privileges.
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  AND COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
);

DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
CREATE POLICY "Admins can view all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  AND public.has_role(auth.uid(), 'admin'::app_role)
);

REVOKE ALL ON public.user_roles FROM anon;

-- 3) Server-only audit/log tables: back the policy gap with real privileges.
REVOKE INSERT, UPDATE, DELETE ON public.digest_send_logs FROM anon, authenticated;
REVOKE SELECT ON public.digest_send_logs FROM anon;
GRANT SELECT ON public.digest_send_logs TO authenticated;
GRANT ALL ON public.digest_send_logs TO service_role;

REVOKE INSERT, UPDATE, DELETE ON public.email_notification_log FROM anon, authenticated;
REVOKE SELECT ON public.email_notification_log FROM anon;
GRANT SELECT ON public.email_notification_log TO authenticated;
GRANT ALL ON public.email_notification_log TO service_role;

-- 4) Drop client EXECUTE on an unused SECURITY DEFINER helper.
REVOKE EXECUTE ON FUNCTION public.has_active_subscription(uuid, text) FROM PUBLIC, anon, authenticated;