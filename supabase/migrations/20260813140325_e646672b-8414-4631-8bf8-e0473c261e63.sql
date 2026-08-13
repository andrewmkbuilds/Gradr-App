CREATE OR REPLACE FUNCTION public.accept_legal_document(_document_id uuid, _user_agent text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  doc RECORD;
  rec_id uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF public.is_anonymous_session() THEN
    RAISE EXCEPTION 'Guest sessions cannot accept legal documents' USING ERRCODE = '42501';
  END IF;

  SELECT id, doc_type, version, status INTO doc
  FROM public.legal_documents WHERE id = _document_id;

  IF NOT FOUND OR doc.status <> 'published' THEN
    RAISE EXCEPTION 'Legal document is not available for acceptance';
  END IF;

  INSERT INTO public.legal_acceptances (user_id, document_id, doc_type, version, user_agent)
  VALUES (uid, doc.id, doc.doc_type, doc.version, left(COALESCE(_user_agent, ''), 300))
  ON CONFLICT (user_id, document_id) DO NOTHING
  RETURNING id INTO rec_id;

  IF rec_id IS NULL THEN
    SELECT id INTO rec_id FROM public.legal_acceptances
     WHERE user_id = uid AND document_id = doc.id;
  END IF;

  RETURN rec_id;
END $function$;

CREATE OR REPLACE FUNCTION public.attribute_signup_referral(_code text, _click_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid UUID := auth.uid();
  prof RECORD;
  existing UUID;
  ref_id UUID;
BEGIN
  IF uid IS NULL OR _code IS NULL OR length(_code) = 0 THEN RETURN NULL; END IF;
  IF public.is_anonymous_session() THEN RETURN NULL; END IF;

  SELECT id, user_id, status INTO prof FROM public.affiliate_profiles WHERE affiliate_code = _code;
  IF NOT FOUND OR prof.status <> 'active' THEN RETURN NULL; END IF;
  IF prof.user_id = uid THEN RETURN NULL; END IF;

  SELECT id INTO existing FROM public.affiliate_referrals WHERE referred_user_id = uid;
  IF existing IS NOT NULL THEN RETURN existing; END IF;

  INSERT INTO public.affiliate_referrals
    (affiliate_profile_id, referred_user_id, affiliate_click_id, referral_code,
     conversion_type, conversion_date, attribution_status)
  VALUES
    (prof.id, uid, _click_id, _code, 'signup', now(), 'confirmed')
  RETURNING id INTO ref_id;

  RETURN ref_id;
END $function$;

REVOKE EXECUTE ON FUNCTION public.accept_legal_document(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_legal_document(uuid, text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.attribute_signup_referral(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attribute_signup_referral(text, uuid) TO authenticated, service_role;