DROP POLICY IF EXISTS "Users manage their own integrations" ON public.user_integrations;

CREATE POLICY "Members read their own integrations"
ON public.user_integrations FOR SELECT TO authenticated
USING (auth.uid() = user_id AND public.is_anonymous_session() = false);

CREATE POLICY "Members insert their own integrations"
ON public.user_integrations FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND public.is_anonymous_session() = false);

CREATE POLICY "Members update their own integrations"
ON public.user_integrations FOR UPDATE TO authenticated
USING (auth.uid() = user_id AND public.is_anonymous_session() = false)
WITH CHECK (auth.uid() = user_id AND public.is_anonymous_session() = false);

CREATE POLICY "Members delete their own integrations"
ON public.user_integrations FOR DELETE TO authenticated
USING (auth.uid() = user_id AND public.is_anonymous_session() = false);