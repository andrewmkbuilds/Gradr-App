-- RLS helper functions must be executable by the roles whose policies call them.
-- These are SECURITY DEFINER helpers that only answer yes/no about the current
-- session; they expose no data and are the standard Supabase RLS pattern.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_anonymous_session() TO authenticated;
GRANT EXECUTE ON FUNCTION public.affiliate_click_is_valid(uuid, text) TO anon, authenticated;