-- 1. Storage: verification-docs must exclude anonymous sessions
DROP POLICY IF EXISTS "Users read own verification docs" ON storage.objects;
DROP POLICY IF EXISTS "Users upload own verification docs" ON storage.objects;
DROP POLICY IF EXISTS "Users delete own verification docs" ON storage.objects;

CREATE POLICY "Users read own verification docs"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'verification-docs'
  AND coalesce(((auth.jwt() ->> 'is_anonymous'))::boolean, false) = false
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR public.is_admin()
  )
);

CREATE POLICY "Users upload own verification docs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'verification-docs'
  AND coalesce(((auth.jwt() ->> 'is_anonymous'))::boolean, false) = false
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users delete own verification docs"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'verification-docs'
  AND coalesce(((auth.jwt() ->> 'is_anonymous'))::boolean, false) = false
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- 2. discovered_jobs: read-only for signed-in users, writes are service role only
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.discovered_jobs FROM anon, authenticated;
REVOKE SELECT ON public.discovered_jobs FROM anon;
GRANT SELECT ON public.discovered_jobs TO authenticated;
GRANT ALL ON public.discovered_jobs TO service_role;

DROP POLICY IF EXISTS "Service role manages discovered jobs" ON public.discovered_jobs;
CREATE POLICY "Service role manages discovered jobs"
ON public.discovered_jobs FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- 3. affiliate_settings: drop redundant policy layering, remove anon reach
REVOKE ALL ON public.affiliate_settings FROM anon;
GRANT SELECT, UPDATE ON public.affiliate_settings TO authenticated;
GRANT ALL ON public.affiliate_settings TO service_role;

DROP POLICY IF EXISTS "Admins read affiliate settings" ON public.affiliate_settings;
DROP POLICY IF EXISTS "Admins can read affiliate settings" ON public.affiliate_settings;
DROP POLICY IF EXISTS "Admins view affiliate settings" ON public.affiliate_settings;
DROP POLICY IF EXISTS "Admins manage affiliate settings" ON public.affiliate_settings;
CREATE POLICY "Admins manage affiliate settings"
ON public.affiliate_settings FOR ALL TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 4. Admin-only SECURITY DEFINER functions are no longer callable from the browser.
REVOKE EXECUTE ON FUNCTION public.admin_audit_actors() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_create_payout(uuid, numeric, text, text, text, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_legal_document_stats() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_mark_payout_paid(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_publish_legal_document(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_review_verification(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_review_verification_request(uuid, text, text, numeric) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_set_commission_status(uuid[], public.affiliate_commission_status, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_verification_requests(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.approve_affiliate_application(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reject_affiliate_application(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_admin_access(text, text, integer, text, jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_audit_actors() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_payout(uuid, numeric, text, text, text, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_legal_document_stats() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_mark_payout_paid(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_publish_legal_document(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_review_verification(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_review_verification_request(uuid, text, text, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_commission_status(uuid[], public.affiliate_commission_status, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_verification_requests(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.approve_affiliate_application(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reject_affiliate_application(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.log_admin_access(text, text, integer, text, jsonb) TO service_role;