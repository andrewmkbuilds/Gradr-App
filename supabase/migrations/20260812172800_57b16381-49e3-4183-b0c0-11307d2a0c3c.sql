-- 1. Institutions directory (recognised domains + user-submitted additions)
CREATE TABLE public.verification_institutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  website text,
  email_domain text NOT NULL,
  country text,
  category text REFERENCES public.eligibility_categories(key) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  notes text,
  requested_by uuid,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT verification_institutions_status_check CHECK (status IN ('pending','approved','rejected'))
);
CREATE UNIQUE INDEX verification_institutions_domain_key
  ON public.verification_institutions (lower(email_domain));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.verification_institutions TO authenticated;
GRANT ALL ON public.verification_institutions TO service_role;
ALTER TABLE public.verification_institutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users read approved institutions"
  ON public.verification_institutions FOR SELECT TO authenticated
  USING (public.is_anonymous_session() = false AND (status = 'approved' OR requested_by = auth.uid() OR public.has_role(auth.uid(),'admin')));
CREATE POLICY "Admins manage institutions insert"
  ON public.verification_institutions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage institutions update"
  ON public.verification_institutions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage institutions delete"
  ON public.verification_institutions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_verification_institutions_updated
  BEFORE UPDATE ON public.verification_institutions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Verification requests
CREATE TABLE public.verification_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  category text NOT NULL REFERENCES public.eligibility_categories(key) ON DELETE CASCADE,
  full_name text NOT NULL,
  organization text,
  website text,
  email text NOT NULL,
  personal_email text,
  country text,
  role_or_status text,
  supporting_information text,
  document_path text,
  domain_matched boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending',
  discount_percentage numeric NOT NULL DEFAULT 0,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  reviewer_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT verification_requests_status_check
    CHECK (status IN ('pending','approved','rejected','needs_more_information'))
);
CREATE INDEX idx_verification_requests_user ON public.verification_requests (user_id, submitted_at DESC);
CREATE INDEX idx_verification_requests_status ON public.verification_requests (status, submitted_at DESC);

GRANT SELECT ON public.verification_requests TO authenticated;
GRANT ALL ON public.verification_requests TO service_role;
ALTER TABLE public.verification_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own verification requests"
  ON public.verification_requests FOR SELECT TO authenticated
  USING (public.is_anonymous_session() = false AND user_id = auth.uid());
CREATE POLICY "Admins read all verification requests"
  ON public.verification_requests FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_verification_requests_updated
  BEFORE UPDATE ON public.verification_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Submission RPC (users may only create pending requests for themselves)
CREATE OR REPLACE FUNCTION public.submit_verification_request(
  _category text,
  _full_name text,
  _email text,
  _organization text DEFAULT NULL,
  _website text DEFAULT NULL,
  _personal_email text DEFAULT NULL,
  _country text DEFAULT NULL,
  _role_or_status text DEFAULT NULL,
  _supporting_information text DEFAULT NULL,
  _document_path text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  cat RECORD;
  domain text;
  matched boolean := false;
  open_count integer;
  new_id uuid;
BEGIN
  IF uid IS NULL OR public.is_anonymous_session() THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT key, label, default_discount_percent, active INTO cat
    FROM public.eligibility_categories WHERE key = _category;
  IF cat IS NULL OR NOT cat.active THEN
    RAISE EXCEPTION 'Unknown eligibility category';
  END IF;

  IF coalesce(trim(_full_name),'') = '' OR coalesce(trim(_email),'') = '' THEN
    RAISE EXCEPTION 'Full name and email are required';
  END IF;
  IF _email !~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' THEN
    RAISE EXCEPTION 'Enter a valid email address';
  END IF;
  IF _personal_email IS NOT NULL AND trim(_personal_email) <> ''
     AND _personal_email !~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' THEN
    RAISE EXCEPTION 'Enter a valid personal email address';
  END IF;

  SELECT count(*) INTO open_count FROM public.verification_requests
   WHERE user_id = uid AND status IN ('pending','needs_more_information');
  IF open_count >= 3 THEN
    RAISE EXCEPTION 'You already have verification requests awaiting review';
  END IF;

  domain := lower(split_part(_email, '@', 2));
  SELECT EXISTS (
    SELECT 1 FROM public.verification_institutions vi
     WHERE vi.status = 'approved'
       AND lower(vi.email_domain) = domain
       AND (vi.category IS NULL OR vi.category = _category)
  ) INTO matched;

  INSERT INTO public.verification_requests (
    user_id, category, full_name, organization, website, email, personal_email,
    country, role_or_status, supporting_information, document_path,
    domain_matched, discount_percentage
  ) VALUES (
    uid, _category, trim(_full_name), nullif(trim(coalesce(_organization,'')),''),
    nullif(trim(coalesce(_website,'')),''), lower(trim(_email)),
    nullif(lower(trim(coalesce(_personal_email,''))),''),
    nullif(trim(coalesce(_country,'')),''), nullif(trim(coalesce(_role_or_status,'')),''),
    nullif(trim(coalesce(_supporting_information,'')),''),
    nullif(trim(coalesce(_document_path,'')),''),
    matched, cat.default_discount_percent
  ) RETURNING id INTO new_id;

  PERFORM public.notify_admins(
    'verification_request',
    'New verification request',
    cat.label || ' verification submitted for review',
    '/admin/verifications',
    jsonb_build_object('request_id', new_id, 'category', _category)
  );

  RETURN new_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.submit_verification_request(text,text,text,text,text,text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_verification_request(text,text,text,text,text,text,text,text,text,text) TO authenticated;

-- 4. Institution add request (users may propose, admins approve)
CREATE OR REPLACE FUNCTION public.request_institution(
  _name text,
  _email_domain text,
  _website text DEFAULT NULL,
  _country text DEFAULT NULL,
  _category text DEFAULT NULL,
  _notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  domain text;
  existing RECORD;
  new_id uuid;
BEGIN
  IF uid IS NULL OR public.is_anonymous_session() THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF coalesce(trim(_name),'') = '' OR coalesce(trim(_email_domain),'') = '' THEN
    RAISE EXCEPTION 'Institution name and email domain are required';
  END IF;

  domain := lower(regexp_replace(trim(_email_domain), '^.*@', ''));
  IF domain !~* '^[a-z0-9.-]+\.[a-z]{2,}$' THEN
    RAISE EXCEPTION 'Enter a valid email domain, for example university.edu';
  END IF;

  SELECT id, status INTO existing FROM public.verification_institutions
   WHERE lower(email_domain) = domain;
  IF existing.id IS NOT NULL THEN
    RETURN existing.id;
  END IF;

  INSERT INTO public.verification_institutions
    (name, website, email_domain, country, category, status, notes, requested_by)
  VALUES (trim(_name), nullif(trim(coalesce(_website,'')),''), domain,
          nullif(trim(coalesce(_country,'')),''), _category, 'pending',
          nullif(trim(coalesce(_notes,'')),''), uid)
  RETURNING id INTO new_id;

  PERFORM public.notify_admins(
    'institution_request',
    'Institution add request',
    trim(_name) || ' (' || domain || ')',
    '/admin/verifications',
    jsonb_build_object('institution_id', new_id)
  );

  RETURN new_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.request_institution(text,text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_institution(text,text,text,text,text,text) TO authenticated;

-- 5. Admin review
CREATE OR REPLACE FUNCTION public.admin_review_verification_request(
  _request_id uuid,
  _decision text,
  _notes text DEFAULT NULL,
  _discount_percentage numeric DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor uuid := auth.uid();
  req RECORD;
  cat RECORD;
  pct numeric;
  validity integer;
BEGIN
  IF NOT public.has_role(actor, 'admin') THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;
  PERFORM public.assert_admin_write_rate_limit(actor, 100);

  IF _decision NOT IN ('approved','rejected','needs_more_information') THEN
    RAISE EXCEPTION 'Invalid decision';
  END IF;

  SELECT * INTO req FROM public.verification_requests WHERE id = _request_id FOR UPDATE;
  IF req IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;

  SELECT label, default_discount_percent, verification_validity_days
    INTO cat FROM public.eligibility_categories WHERE key = req.category;

  pct := GREATEST(LEAST(coalesce(_discount_percentage, cat.default_discount_percent, 0), 100), 0);
  validity := coalesce(cat.verification_validity_days, 365);

  UPDATE public.verification_requests
     SET status = _decision,
         reviewer_notes = nullif(trim(coalesce(_notes,'')),''),
         reviewed_by = actor,
         reviewed_at = now(),
         discount_percentage = CASE WHEN _decision = 'approved' THEN pct ELSE discount_percentage END
   WHERE id = _request_id;

  IF _decision = 'approved' THEN
    INSERT INTO public.eligibility_verifications
      (user_id, eligibility_type, provider, provider_reference_id, status,
       verified_at, expires_at, last_checked_at, failure_reason, reviewed_by, metadata)
    VALUES (req.user_id, req.category, 'gradr_review', _request_id::text, 'verified',
            now(), now() + make_interval(days => validity), now(), NULL, actor,
            jsonb_build_object('request_id', _request_id, 'discount_percentage', pct))
    ON CONFLICT (user_id, eligibility_type) DO UPDATE
      SET provider = 'gradr_review',
          provider_reference_id = _request_id::text,
          status = 'verified',
          verified_at = now(),
          expires_at = now() + make_interval(days => validity),
          last_checked_at = now(),
          failure_reason = NULL,
          reviewed_by = actor,
          metadata = jsonb_build_object('request_id', _request_id, 'discount_percentage', pct);

    PERFORM public.enqueue_notification(
      req.user_id, 'verification_approved', 'Verification approved',
      CASE WHEN pct > 0
        THEN cat.label || ' verified — ' || trim(to_char(pct,'FM999990.99')) || '% off is now applied at checkout.'
        ELSE cat.label || ' verified.' END,
      '/settings#eligibility', jsonb_build_object('request_id', _request_id));

  ELSIF _decision = 'rejected' THEN
    UPDATE public.eligibility_verifications
       SET status = 'failed', failure_reason = nullif(trim(coalesce(_notes,'')),''),
           verified_at = NULL, expires_at = NULL, reviewed_by = actor, last_checked_at = now()
     WHERE user_id = req.user_id AND eligibility_type = req.category;

    PERFORM public.enqueue_notification(
      req.user_id, 'verification_rejected', 'Verification not approved',
      coalesce(nullif(trim(coalesce(_notes,'')),''), 'We could not confirm your eligibility from the details provided.'),
      '/settings#eligibility', jsonb_build_object('request_id', _request_id));
  ELSE
    PERFORM public.enqueue_notification(
      req.user_id, 'verification_more_info', 'More information needed',
      coalesce(nullif(trim(coalesce(_notes,'')),''), 'We need a bit more information to review your verification.'),
      '/settings#eligibility', jsonb_build_object('request_id', _request_id));
  END IF;

  PERFORM public.log_admin_access('review_verification_request', 'verification_requests', 1,
                                  _request_id::text,
                                  jsonb_build_object('decision', _decision, 'percentage', pct));
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_review_verification_request(uuid,text,text,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_verification_request(uuid,text,text,numeric) TO authenticated;

-- 6. Admin queue with reviewer display names
CREATE OR REPLACE FUNCTION public.admin_verification_requests(_status text DEFAULT NULL, _limit integer DEFAULT 200)
RETURNS TABLE (
  id uuid, user_id uuid, applicant_name text, category text, category_label text,
  full_name text, organization text, website text, email text, personal_email text,
  country text, role_or_status text, supporting_information text, document_path text,
  domain_matched boolean, status text, discount_percentage numeric,
  submitted_at timestamptz, reviewed_at timestamptz, reviewer_name text, reviewer_notes text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;
  RETURN QUERY
  SELECT vr.id, vr.user_id, p.display_name, vr.category, ec.label,
         vr.full_name, vr.organization, vr.website, vr.email, vr.personal_email,
         vr.country, vr.role_or_status, vr.supporting_information, vr.document_path,
         vr.domain_matched, vr.status, vr.discount_percentage,
         vr.submitted_at, vr.reviewed_at, rp.display_name, vr.reviewer_notes
    FROM public.verification_requests vr
    JOIN public.eligibility_categories ec ON ec.key = vr.category
    LEFT JOIN public.profiles p ON p.user_id = vr.user_id
    LEFT JOIN public.profiles rp ON rp.user_id = vr.reviewed_by
   WHERE (_status IS NULL OR vr.status = _status)
   ORDER BY vr.submitted_at DESC
   LIMIT LEAST(coalesce(_limit,200), 500);
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_verification_requests(text,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_verification_requests(text,integer) TO authenticated;

-- 7. Access rules for the private verification documents bucket
CREATE POLICY "Users upload own verification docs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'verification-docs' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users read own verification docs"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'verification-docs'
         AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(),'admin')));
CREATE POLICY "Users delete own verification docs"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'verification-docs' AND auth.uid()::text = (storage.foldername(name))[1]);