-- Affiliate clicks are written only by the trusted server-side tracker
-- (the `affiliate-track-click` edge function, running as service_role).
-- Browser clients must never insert directly: the row carries the attribution
-- that later becomes commission, so the affiliate it credits has to be resolved
-- from the referral code by the server, never supplied by the visitor.

-- 1. Attribution is mandatory: an unattributed click is not a click we can pay on.
ALTER TABLE public.affiliate_clicks
  ALTER COLUMN affiliate_profile_id SET NOT NULL;

-- 2. Row ownership check, enforced for every writer including service_role:
--    the code on the row must be the code that belongs to the credited profile,
--    and that profile must still be an active affiliate.
CREATE OR REPLACE FUNCTION public.affiliate_clicks_enforce_ownership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code   text;
  v_status affiliate_profile_status;
BEGIN
  SELECT affiliate_code, status
    INTO v_code, v_status
    FROM public.affiliate_profiles
   WHERE id = NEW.affiliate_profile_id;

  IF v_code IS NULL THEN
    RAISE EXCEPTION 'affiliate_clicks: unknown affiliate_profile_id %', NEW.affiliate_profile_id
      USING ERRCODE = '23503';
  END IF;

  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'affiliate_clicks: affiliate % is not active', NEW.affiliate_profile_id
      USING ERRCODE = '23514';
  END IF;

  -- Normalise rather than trust the caller's casing, then require an exact match.
  NEW.affiliate_code := upper(btrim(NEW.affiliate_code));
  IF NEW.affiliate_code IS DISTINCT FROM upper(btrim(v_code)) THEN
    RAISE EXCEPTION 'affiliate_clicks: code % does not belong to affiliate %',
      NEW.affiliate_code, NEW.affiliate_profile_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.affiliate_clicks_enforce_ownership() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS affiliate_clicks_enforce_ownership ON public.affiliate_clicks;
CREATE TRIGGER affiliate_clicks_enforce_ownership
  BEFORE INSERT OR UPDATE ON public.affiliate_clicks
  FOR EACH ROW EXECUTE FUNCTION public.affiliate_clicks_enforce_ownership();

-- 3. Make the server-only write path explicit at the privilege layer, so the
--    absence of an INSERT policy is a deliberate posture rather than an omission.
REVOKE INSERT, UPDATE, DELETE ON public.affiliate_clicks FROM anon, authenticated;
GRANT SELECT ON public.affiliate_clicks TO authenticated;
GRANT ALL ON public.affiliate_clicks TO service_role;

-- 4. Restate the deny for INSERT at the policy layer. A client INSERT is already
--    refused by the missing grant; this policy makes the intent readable in
--    pg_policies and keeps the finding guard able to assert on it.
DROP POLICY IF EXISTS "clicks are inserted server-side only" ON public.affiliate_clicks;
CREATE POLICY "clicks are inserted server-side only"
  ON public.affiliate_clicks
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

COMMENT ON TABLE public.affiliate_clicks IS
  'Referral click log. Written only by the affiliate-track-click edge function (service_role); '
  'the affiliate is resolved server-side from the referral code and verified by '
  'affiliate_clicks_enforce_ownership(). Clients may read their own rows only.';