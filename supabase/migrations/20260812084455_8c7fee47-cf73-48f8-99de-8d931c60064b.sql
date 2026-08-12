-- 1) Subscription lookup: only self or admin
CREATE OR REPLACE FUNCTION public.has_active_subscription(_user_id uuid, _env text DEFAULT 'live'::text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF auth.uid() <> _user_id AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized to read another user''s subscription';
  END IF;
  RETURN public.current_plan_tier(_user_id, _env) IN ('starter','pro');
END $$;

REVOKE ALL ON FUNCTION public.has_active_subscription(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_active_subscription(uuid, text) TO authenticated, service_role;

-- 2) Ensure no SECURITY DEFINER helper is callable by PUBLIC; keep only the
--    intentionally public affiliate lookups reachable by anon.
REVOKE ALL ON FUNCTION public.admin_audit_actors() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_create_payout(uuid, numeric, text, text, text, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_mark_payout_paid(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approve_affiliate_application(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_affiliate_application(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.attribute_signup_referral(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.entitlement_snapshot(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.log_admin_access(text, text, integer, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assert_admin_write_rate_limit(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_entitlement(uuid, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_entitlement(uuid, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.current_plan_tier(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_notification(uuid, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_admins(text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_conversion_commission(uuid, numeric, public.affiliate_conversion_type, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_affiliate_code() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_audit_actors() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_payout(uuid, numeric, text, text, text, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_payout_paid(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_affiliate_application(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_affiliate_application(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.attribute_signup_referral(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.entitlement_snapshot(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_admin_access(text, text, integer, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- 3) Storage: exclude anonymous (guest) sessions from private buckets
DROP POLICY IF EXISTS "Users can view their own resumes" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own resumes" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own resumes" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own resumes" ON storage.objects;
DROP POLICY IF EXISTS "Users read own interview report files" ON storage.objects;
DROP POLICY IF EXISTS "Users update own interview report files" ON storage.objects;
DROP POLICY IF EXISTS "Users delete own interview report files" ON storage.objects;
DROP POLICY IF EXISTS "Users upload own interview report files" ON storage.objects;

CREATE POLICY "Users can view their own resumes" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'resumes'
    AND (auth.uid())::text = (storage.foldername(name))[1]
    AND COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

CREATE POLICY "Users can upload their own resumes" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'resumes'
    AND (auth.uid())::text = (storage.foldername(name))[1]
    AND COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

CREATE POLICY "Users can update their own resumes" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'resumes'
    AND (auth.uid())::text = (storage.foldername(name))[1]
    AND COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

CREATE POLICY "Users can delete their own resumes" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'resumes'
    AND (auth.uid())::text = (storage.foldername(name))[1]
    AND COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

CREATE POLICY "Users read own interview report files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'interview-reports'
    AND (storage.foldername(name))[1] = (auth.uid())::text
    AND COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

CREATE POLICY "Users upload own interview report files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'interview-reports'
    AND (storage.foldername(name))[1] = (auth.uid())::text
    AND COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

CREATE POLICY "Users update own interview report files" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'interview-reports'
    AND (storage.foldername(name))[1] = (auth.uid())::text
    AND COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

CREATE POLICY "Users delete own interview report files" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'interview-reports'
    AND (storage.foldername(name))[1] = (auth.uid())::text
    AND COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);