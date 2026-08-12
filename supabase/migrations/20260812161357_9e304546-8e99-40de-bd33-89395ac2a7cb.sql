DROP POLICY IF EXISTS "own prefs select" ON public.user_preferences;
DROP POLICY IF EXISTS "own prefs insert" ON public.user_preferences;
DROP POLICY IF EXISTS "own prefs update" ON public.user_preferences;
DROP POLICY IF EXISTS "own prefs delete" ON public.user_preferences;

CREATE POLICY "own prefs select" ON public.user_preferences
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id AND coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

CREATE POLICY "own prefs insert" ON public.user_preferences
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

CREATE POLICY "own prefs update" ON public.user_preferences
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false)
  WITH CHECK (auth.uid() = user_id AND coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

CREATE POLICY "own prefs delete" ON public.user_preferences
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);