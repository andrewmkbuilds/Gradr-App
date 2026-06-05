-- 1) Lock down digest_send_logs writes to server-side only
DROP POLICY IF EXISTS "Users can create their own digest logs" ON public.digest_send_logs;

-- 2) Explicitly deny INSERT/UPDATE/DELETE on user_roles from clients
--    (no permissive policies = no access; service role still bypasses RLS)
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM anon, authenticated;

-- 3) Restrict SECURITY DEFINER functions
--    handle_new_user is a trigger only — no client should call it
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

--    has_role is used inside RLS policies; revoke from anon + public,
--    keep authenticated so policies that call it continue to work
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;

--    update_updated_at_column is a trigger helper only
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;