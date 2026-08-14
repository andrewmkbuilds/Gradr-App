-- =====================================================================
-- Verification hardening: domain proof, audit trail, fraud screening,
-- appeals.
-- =====================================================================

-- 1. Request columns + status vocabulary -------------------------------
ALTER TABLE public.verification_requests
  DROP CONSTRAINT IF EXISTS verification_requests_status_check;
ALTER TABLE public.verification_requests
  ADD CONSTRAINT verification_requests_status_check
  CHECK (status IN ('pending','approved','rejected','needs_more_information','appealed'));

ALTER TABLE public.verification_requests
  ADD COLUMN IF NOT EXISTS fraud_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fraud_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS domain_proof_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS appeal_count integer NOT NULL DEFAULT 0;

-- 2. Email ownership proof --------------------------------------------
ALTER TABLE public.academic_email_verifications
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'eligibility',
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'student';

-- A user may prove the same address more than once (student then educator),
-- so global "one address, one account" moves to a dedicated claims table.
DROP INDEX IF EXISTS public.idx_aev_email_claimed;
CREATE INDEX IF NOT EXISTS idx_aev_email_consumed
  ON public.academic_email_verifications (lower(email))
  WHERE consumed_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.verification_email_claims (
  email text PRIMARY KEY,
  user_id uuid NOT NULL,
  domain text NOT NULL,
  first_verified_at timestamptz NOT NULL DEFAULT now(),
  last_verified_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.verification_email_claims TO service_role;
ALTER TABLE public.verification_email_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages email claims"
  ON public.verification_email_claims FOR ALL TO service_role
  USING (true) WITH CHECK (true);
CREATE POLICY "Admins read email claims"
  ON public.verification_email_claims FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
GRANT SELECT ON public.verification_email_claims TO authenticated;

INSERT INTO public.verification_email_claims (email, user_id, domain, first_verified_at, last_verified_at)
SELECT DISTINCT ON (lower(email)) lower(email), user_id, domain, consumed_at, consumed_at
  FROM public.academic_email_verifications
 WHERE consumed_at IS NOT NULL
 ORDER BY lower(email), consumed_at ASC
ON CONFLICT (email) DO NOTHING;

CREATE OR REPLACE FUNCTION public.has_domain_proof(_user uuid, _email text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.academic_email_verifications
     WHERE user_id = _user
       AND lower(email) = lower(trim(coalesce(_email,'')))
       AND consumed_at IS NOT NULL
  );
$$;
REVOKE EXECUTE ON FUNCTION public.has_domain_proof(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_domain_proof(uuid,text) TO authenticated, service_role;

-- 3. Append-only audit trail ------------------------------------------
CREATE TABLE IF NOT EXISTS public.verification_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.verification_requests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  actor_id uuid,
  actor_role text NOT NULL DEFAULT 'system'
    CHECK (actor_role IN ('user','admin','system')),
  event text NOT NULL,
  from_status text,
  to_status text,
  notes text,
  visible_to_user boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vre_request ON public.verification_request_events (request_id, created_at);
CREATE INDEX IF NOT EXISTS idx_vre_user ON public.verification_request_events (user_id, created_at DESC);

GRANT SELECT ON public.verification_request_events TO authenticated;
GRANT ALL ON public.verification_request_events TO service_role;
ALTER TABLE public.verification_request_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own verification events"
  ON public.verification_request_events FOR SELECT TO authenticated
  USING (public.is_anonymous_session() = false AND user_id = auth.uid() AND visible_to_user);
CREATE POLICY "Admins read all verification events"
  ON public.verification_request_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.log_verification_event(
  _request_id uuid,
  _event text,
  _actor_role text DEFAULT 'system',
  _actor_id uuid DEFAULT NULL,
  _from_status text DEFAULT NULL,
  _to_status text DEFAULT NULL,
  _notes text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb,
  _visible boolean DEFAULT true
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  owner uuid;
  new_id uuid;
BEGIN
  SELECT user_id INTO owner FROM public.verification_requests WHERE id = _request_id;
  IF owner IS NULL THEN RETURN NULL; END IF;

  INSERT INTO public.verification_request_events
    (request_id, user_id, actor_id, actor_role, event, from_status, to_status, notes, metadata, visible_to_user)
  VALUES
    (_request_id, owner, _actor_id, coalesce(_actor_role,'system'), _event, _from_status, _to_status,
     nullif(trim(coalesce(_notes,'')),''), coalesce(_metadata,'{}'::jsonb), coalesce(_visible,true))
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.log_verification_event(uuid,text,text,uuid,text,text,text,jsonb,boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_verification_event(uuid,text,text,uuid,text,text,text,jsonb,boolean)
  TO service_role;

-- 4. Appeals -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.verification_appeals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.verification_requests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  message text NOT NULL,
  document_path text,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','reviewed')),
  reviewer_notes text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_verification_appeals_request
  ON public.verification_appeals (request_id, created_at DESC);

GRANT SELECT ON public.verification_appeals TO authenticated;
GRANT ALL ON public.verification_appeals TO service_role;
ALTER TABLE public.verification_appeals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own appeals"
  ON public.verification_appeals FOR SELECT TO authenticated
  USING (public.is_anonymous_session() = false AND user_id = auth.uid());
CREATE POLICY "Admins read all appeals"
  ON public.verification_appeals FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- 5. Server-side fraud screening --------------------------------------
CREATE OR REPLACE FUNCTION public.evaluate_verification_fraud(
  _user_id uuid,
  _category text,
  _full_name text,
  _email text,
  _personal_email text,
  _organization text,
  _website text,
  _domain_matched boolean,
  _proof boolean
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  flags jsonb := '[]'::jsonb;
  score integer := 0;
  addr text := lower(trim(coalesce(_email,'')));
  dom text := lower(split_part(lower(trim(coalesce(_email,''))), '@', 2));
  site_host text;
  local_part text := split_part(lower(trim(coalesce(_email,''))), '@', 1);
  name_tokens text[];
  tok text;
  name_hit boolean := false;
  hits integer;
  freemail text[] := ARRAY['gmail.com','googlemail.com','yahoo.com','ymail.com','hotmail.com',
                           'outlook.com','live.com','icloud.com','me.com','aol.com','proton.me',
                           'protonmail.com','gmx.com','mail.com','yandex.com','zoho.com'];
  disposable text[] := ARRAY['mailinator.com','guerrillamail.com','10minutemail.com','tempmail.com',
                             'temp-mail.org','trashmail.com','yopmail.com','sharklasers.com',
                             'getnada.com','dispostable.com','fakeinbox.com','maildrop.cc'];

  PROCEDURE_placeholder boolean;
BEGIN
  -- Duplicate: this exact address already used by a different account.
  SELECT count(*) INTO hits
    FROM public.verification_requests r
   WHERE lower(r.email) = addr AND r.user_id <> _user_id;
  IF hits > 0 THEN
    score := score + 30;
    flags := flags || jsonb_build_object(
      'code','duplicate_email','severity','high',
      'label','This work/school address was already used on another Gradr account.');
  END IF;

  IF EXISTS (SELECT 1 FROM public.verification_email_claims c
              WHERE c.email = addr AND c.user_id <> _user_id) THEN
    score := score + 30;
    flags := flags || jsonb_build_object(
      'code','claimed_by_other_account','severity','high',
      'label','This address is already verified on a different account.');
  END IF;

  -- Duplicate identity: same legal name on a different account.
  SELECT count(*) INTO hits
    FROM public.verification_requests r
   WHERE lower(trim(r.full_name)) = lower(trim(coalesce(_full_name,'')))
     AND r.user_id <> _user_id;
  IF hits > 0 THEN
    score := score + 20;
    flags := flags || jsonb_build_object(
      'code','duplicate_identity','severity','medium',
      'label','The same full name appears on another account''s request.');
  END IF;

  -- Personal mailbox reuse across accounts.
  IF coalesce(trim(_personal_email),'') <> '' AND EXISTS (
      SELECT 1 FROM public.verification_requests r
       WHERE lower(r.personal_email) = lower(trim(_personal_email)) AND r.user_id <> _user_id) THEN
    score := score + 20;
    flags := flags || jsonb_build_object(
      'code','duplicate_personal_email','severity','medium',
      'label','The personal email is shared with another account.');
  END IF;

  -- Mismatched fields: name vs mailbox.
  name_tokens := regexp_split_to_array(lower(regexp_replace(coalesce(_full_name,''), '[^a-zA-Z ]', '', 'g')), '\s+');
  FOREACH tok IN ARRAY coalesce(name_tokens, ARRAY[]::text[]) LOOP
    IF length(tok) >= 3 AND position(tok in local_part) > 0 THEN
      name_hit := true;
    END IF;
  END LOOP;
  IF NOT name_hit AND coalesce(trim(_full_name),'') <> '' THEN
    score := score + 10;
    flags := flags || jsonb_build_object(
      'code','name_email_mismatch','severity','low',
      'label','The mailbox name does not resemble the declared full name.');
  END IF;

  -- Mismatched fields: institution website vs email domain.
  IF coalesce(trim(_website),'') <> '' AND dom <> '' THEN
    site_host := lower(regexp_replace(regexp_replace(trim(_website), '^https?://', ''), '/.*$', ''));
    site_host := regexp_replace(site_host, '^www\.', '');
    IF site_host <> '' AND site_host <> dom
       AND right(dom, length(site_host) + 1) <> ('.' || site_host)
       AND right(site_host, length(dom) + 1) <> ('.' || dom) THEN
      score := score + 15;
      flags := flags || jsonb_build_object(
        'code','website_domain_mismatch','severity','medium',
        'label','Email domain (' || dom || ') does not match the stated website (' || site_host || ').');
    END IF;
  END IF;

  IF dom = ANY (disposable) THEN
    score := score + 35;
    flags := flags || jsonb_build_object(
      'code','disposable_domain','severity','high',
      'label','Disposable email provider.');
  ELSIF dom = ANY (freemail) AND _category <> 'nonprofit' THEN
    score := score + 15;
    flags := flags || jsonb_build_object(
      'code','freemail_domain','severity','medium',
      'label','A personal mailbox was used instead of an organisation address.');
  END IF;

  IF NOT coalesce(_domain_matched,false) THEN
    score := score + 10;
    flags := flags || jsonb_build_object(
      'code','unrecognised_domain','severity','low',
      'label','Domain is not on the approved institution list.');
  END IF;

  IF coalesce(_proof,false) THEN
    flags := flags || jsonb_build_object(
      'code','domain_proof_verified','severity','info',
      'label','Applicant proved they can receive mail at this address.');
  END IF;

  -- Behavioural signals.
  SELECT count(*) INTO hits FROM public.verification_requests r
   WHERE r.user_id = _user_id AND r.status = 'rejected';
  IF hits >= 2 THEN
    score := score + 20;
    flags := flags || jsonb_build_object(
      'code','repeat_rejections','severity','medium',
      'label',hits || ' previous requests from this account were rejected.');
  END IF;

  SELECT count(*) INTO hits FROM public.verification_requests r
   WHERE r.user_id = _user_id AND r.submitted_at > now() - interval '24 hours';
  IF hits >= 3 THEN
    score := score + 15;
    flags := flags || jsonb_build_object(
      'code','submission_burst','severity','medium',
      'label','Several requests submitted from this account in 24 hours.');
  END IF;

  score := LEAST(score, 100);

  RETURN jsonb_build_object(
    'score', score,
    'flags', flags,
    'requires_manual_review', score >= 40
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.evaluate_verification_fraud(uuid,text,text,text,text,text,text,boolean,boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_verification_fraud(uuid,text,text,text,text,text,text,boolean,boolean)
  TO service_role;

-- 6. Submission: require proof for institutional categories + screen ---
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
  proof boolean := false;
  open_count integer;
  screening jsonb;
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
   WHERE user_id = uid AND status IN ('pending','needs_more_information','appealed');
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

  proof := public.has_domain_proof(uid, _email);

  -- Institutional categories: the domain only counts once ownership of the
  -- mailbox has been proven with a one-time code.
  IF _category IN ('student','educator') AND NOT proof THEN
    RAISE EXCEPTION 'DOMAIN_PROOF_REQUIRED: Confirm you can receive mail at % before submitting this request.', lower(trim(_email));
  END IF;
  IF NOT proof THEN
    matched := false;
  END IF;

  screening := public.evaluate_verification_fraud(
    uid, _category, _full_name, _email, _personal_email, _organization, _website, matched, proof);

  INSERT INTO public.verification_requests (
    user_id, category, full_name, organization, website, email, personal_email,
    country, role_or_status, supporting_information, document_path,
    domain_matched, discount_percentage, domain_proof_verified, fraud_score, fraud_flags
  ) VALUES (
    uid, _category, trim(_full_name), nullif(trim(coalesce(_organization,'')),''),
    nullif(trim(coalesce(_website,'')),''), lower(trim(_email)),
    nullif(lower(trim(coalesce(_personal_email,''))),''),
    nullif(trim(coalesce(_country,'')),''), nullif(trim(coalesce(_role_or_status,'')),''),
    nullif(trim(coalesce(_supporting_information,'')),''),
    nullif(trim(coalesce(_document_path,'')),''),
    matched, coalesce(cat.default_discount_percent, 0), proof,
    (screening->>'score')::integer, screening->'flags'
  ) RETURNING id INTO new_id;

  INSERT INTO public.verification_request_events
    (request_id, user_id, actor_id, actor_role, event, to_status, notes, metadata)
  VALUES
    (new_id, uid, uid, 'user', 'submitted', 'pending',
     'Request submitted for ' || cat.label || ' verification.',
     jsonb_build_object('category', _category, 'domain', domain, 'domain_proof_verified', proof)),
    (new_id, uid, NULL, 'system', 'fraud_screened', 'pending',
     CASE WHEN (screening->>'requires_manual_review')::boolean
          THEN 'Automatic checks flagged this request for closer review.'
          ELSE 'Automatic checks found no blocking issues.' END,
     screening);

  IF (screening->>'requires_manual_review')::boolean THEN
    PERFORM public.notify_admins(
      'verification_fraud_flag', 'Verification flagged by fraud checks',
      cat.label || ' request scored ' || (screening->>'score') || '/100 on automatic checks.',
      '/admin/verifications', jsonb_build_object('request_id', new_id));
  END IF;

  RETURN new_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.submit_verification_request(text,text,text,text,text,text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_verification_request(text,text,text,text,text,text,text,text,text,text) TO authenticated;

-- 7. Appeal submission -------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_verification_appeal(
  _request_id uuid,
  _message text,
  _document_path text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  req RECORD;
  recent integer;
  new_id uuid;
BEGIN
  IF uid IS NULL OR public.is_anonymous_session() THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF length(trim(coalesce(_message,''))) < 20 THEN
    RAISE EXCEPTION 'Tell us a bit more — at least 20 characters of extra evidence.';
  END IF;
  IF length(_message) > 4000 THEN
    RAISE EXCEPTION 'Please keep your appeal under 4000 characters.';
  END IF;

  SELECT * INTO req FROM public.verification_requests
   WHERE id = _request_id AND user_id = uid FOR UPDATE;
  IF req IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF req.status NOT IN ('rejected','needs_more_information') THEN
    RAISE EXCEPTION 'Only rejected requests can be appealed.';
  END IF;

  SELECT count(*) INTO recent FROM public.verification_appeals
   WHERE request_id = _request_id AND created_at > now() - interval '24 hours';
  IF recent >= 2 THEN
    RAISE EXCEPTION 'You have already appealed this request today.';
  END IF;

  INSERT INTO public.verification_appeals (request_id, user_id, message, document_path)
  VALUES (_request_id, uid, trim(_message), nullif(trim(coalesce(_document_path,'')),''))
  RETURNING id INTO new_id;

  UPDATE public.verification_requests
     SET status = 'appealed',
         appeal_count = appeal_count + 1,
         document_path = coalesce(nullif(trim(coalesce(_document_path,'')),''), document_path)
   WHERE id = _request_id;

  INSERT INTO public.verification_request_events
    (request_id, user_id, actor_id, actor_role, event, from_status, to_status, notes, metadata)
  VALUES
    (_request_id, uid, uid, 'user', 'appeal_submitted', req.status, 'appealed',
     trim(_message), jsonb_build_object('appeal_id', new_id, 'has_document', _document_path IS NOT NULL));

  PERFORM public.notify_admins(
    'verification_appeal', 'Verification appeal submitted',
    'A rejected verification request was appealed with new evidence.',
    '/admin/verifications', jsonb_build_object('request_id', _request_id, 'appeal_id', new_id));

  RETURN new_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.submit_verification_appeal(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_verification_appeal(uuid,text,text) TO authenticated;

-- 8. Timelines ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_verification_timeline(_request_id uuid)
RETURNS TABLE (
  id uuid, event text, actor_role text, actor_name text,
  from_status text, to_status text, notes text, metadata jsonb, created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR public.is_anonymous_session() THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.verification_requests r
                  WHERE r.id = _request_id AND r.user_id = uid) THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  RETURN QUERY
  SELECT e.id, e.event, e.actor_role,
         CASE e.actor_role
           WHEN 'admin' THEN 'Gradr reviewer'
           WHEN 'system' THEN 'Automatic checks'
           ELSE 'You' END,
         e.from_status, e.to_status, e.notes,
         CASE WHEN e.actor_role = 'system'
              THEN jsonb_build_object('score', e.metadata->'score')
              ELSE e.metadata END,
         e.created_at
    FROM public.verification_request_events e
   WHERE e.request_id = _request_id AND e.visible_to_user
   ORDER BY e.created_at ASC;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.my_verification_timeline(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_verification_timeline(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_verification_timeline(_request_id uuid)
RETURNS TABLE (
  id uuid, event text, actor_role text, actor_name text,
  from_status text, to_status text, notes text, metadata jsonb, created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;

  RETURN QUERY
  SELECT e.id, e.event, e.actor_role,
         coalesce(p.full_name,
           CASE e.actor_role WHEN 'system' THEN 'Automatic checks' ELSE 'Unknown' END),
         e.from_status, e.to_status, e.notes, e.metadata, e.created_at
    FROM public.verification_request_events e
    LEFT JOIN public.profiles p ON p.id = e.actor_id
   WHERE e.request_id = _request_id
   ORDER BY e.created_at ASC;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_verification_timeline(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_verification_timeline(uuid) TO authenticated;

-- 9. Review RPC now records the audit trail ----------------------------
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

  UPDATE public.verification_appeals
     SET status = 'reviewed', reviewed_at = now(),
         reviewer_notes = nullif(trim(coalesce(_notes,'')),'')
   WHERE request_id = _request_id AND status = 'submitted';

  INSERT INTO public.verification_request_events
    (request_id, user_id, actor_id, actor_role, event, from_status, to_status, notes, metadata)
  VALUES
    (_request_id, req.user_id, actor, 'admin', 'decision_recorded', req.status, _decision,
     nullif(trim(coalesce(_notes,'')),''),
     jsonb_build_object('discount_percentage', CASE WHEN _decision = 'approved' THEN pct ELSE NULL END));

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
      coalesce(nullif(trim(coalesce(_notes,'')),''),
               'We could not confirm your eligibility. You can appeal with more evidence.'),
      '/settings#eligibility', jsonb_build_object('request_id', _request_id));
  ELSE
    PERFORM public.enqueue_notification(
      req.user_id, 'verification_needs_info', 'More information needed',
      coalesce(nullif(trim(coalesce(_notes,'')),''),
               'A reviewer needs a little more detail before deciding.'),
      '/settings#eligibility', jsonb_build_object('request_id', _request_id));
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_review_verification_request(uuid,text,text,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_verification_request(uuid,text,text,numeric) TO authenticated;

-- 10. Admin queue exposes risk + proof + appeal --------------------------
DROP FUNCTION IF EXISTS public.admin_verification_requests(text, integer);
CREATE OR REPLACE FUNCTION public.admin_verification_requests(_status text DEFAULT NULL, _limit integer DEFAULT 200)
RETURNS TABLE (
  id uuid, user_id uuid, applicant_name text, category text, category_label text,
  full_name text, organization text, website text, email text, personal_email text,
  country text, role_or_status text, supporting_information text, document_path text,
  domain_matched boolean, domain_proof_verified boolean, fraud_score integer, fraud_flags jsonb,
  appeal_count integer, latest_appeal text, status text, discount_percentage numeric,
  submitted_at timestamptz, reviewed_at timestamptz, reviewer_name text, reviewer_notes text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;

  RETURN QUERY
  SELECT r.id, r.user_id, p.full_name, r.category, coalesce(c.label, r.category),
         r.full_name, r.organization, r.website, r.email, r.personal_email,
         r.country, r.role_or_status, r.supporting_information, r.document_path,
         r.domain_matched, r.domain_proof_verified, r.fraud_score, r.fraud_flags,
         r.appeal_count,
         (SELECT a.message FROM public.verification_appeals a
           WHERE a.request_id = r.id ORDER BY a.created_at DESC LIMIT 1),
         r.status, r.discount_percentage, r.submitted_at, r.reviewed_at,
         rp.full_name, r.reviewer_notes
    FROM public.verification_requests r
    LEFT JOIN public.profiles p ON p.id = r.user_id
    LEFT JOIN public.profiles rp ON rp.id = r.reviewed_by
    LEFT JOIN public.eligibility_categories c ON c.key = r.category
   WHERE (_status IS NULL OR r.status = _status)
   ORDER BY r.submitted_at DESC
   LIMIT LEAST(coalesce(_limit, 200), 500);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_verification_requests(text,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_verification_requests(text,integer) TO authenticated;