-- 1. Pin search_path on the email queue helpers.
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pgmq;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pgmq;

-- 2. discovered_jobs: raw scraped payloads are server-side only.
DROP POLICY IF EXISTS "signed in can read jobs" ON public.discovered_jobs;
REVOKE ALL ON public.discovered_jobs FROM anon, authenticated;
GRANT ALL ON public.discovered_jobs TO service_role;

-- 3. affiliate_tiers: signed-in users only see the live tier ladder; admins see all.
DROP POLICY IF EXISTS "tiers readable by authenticated" ON public.affiliate_tiers;
CREATE POLICY "active tiers readable by members"
  ON public.affiliate_tiers
  FOR SELECT
  TO authenticated
  USING (active AND public.is_anonymous_session() = false);
CREATE POLICY "admins read all tiers"
  ON public.affiliate_tiers
  FOR SELECT
  TO authenticated
  USING (public.is_admin());