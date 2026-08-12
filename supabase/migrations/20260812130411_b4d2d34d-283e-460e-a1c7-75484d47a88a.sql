-- ============ legal_documents ============
CREATE TABLE public.legal_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type text NOT NULL CHECK (doc_type IN ('terms','privacy')),
  version integer NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  title text NOT NULL,
  -- Either inline content (admin authored) or a bundled content key resolved by the app (v1 seed).
  content text,
  content_key text,
  summary_of_changes text,
  requires_acceptance boolean NOT NULL DEFAULT false,
  effective_date date NOT NULL DEFAULT current_date,
  published_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT legal_documents_version_unique UNIQUE (doc_type, version),
  CONSTRAINT legal_documents_body_present CHECK (
    (content IS NOT NULL AND length(btrim(content)) > 0) OR (content_key IS NOT NULL)
  )
);

CREATE UNIQUE INDEX legal_documents_one_published_per_type
  ON public.legal_documents (doc_type) WHERE status = 'published';

GRANT SELECT ON public.legal_documents TO anon;
GRANT SELECT, INSERT, UPDATE ON public.legal_documents TO authenticated;
GRANT ALL ON public.legal_documents TO service_role;

ALTER TABLE public.legal_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published legal documents are public"
  ON public.legal_documents FOR SELECT TO anon, authenticated
  USING (status = 'published');

CREATE POLICY "Admins read every legal document"
  ON public.legal_documents FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins create legal documents"
  ON public.legal_documents FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND status = 'draft');

CREATE POLICY "Admins edit draft legal documents"
  ON public.legal_documents FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND status = 'draft')
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND status = 'draft');

CREATE TRIGGER trg_legal_documents_updated
  BEFORE UPDATE ON public.legal_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ legal_acceptances ============
CREATE TABLE public.legal_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  document_id uuid NOT NULL REFERENCES public.legal_documents(id) ON DELETE RESTRICT,
  doc_type text NOT NULL,
  version integer NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ip_hash text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT legal_acceptances_unique UNIQUE (user_id, document_id)
);

CREATE INDEX legal_acceptances_document_idx ON public.legal_acceptances (document_id);

GRANT SELECT ON public.legal_acceptances TO authenticated;
GRANT ALL ON public.legal_acceptances TO service_role;

ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own acceptances"
  ON public.legal_acceptances FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins read all acceptances"
  ON public.legal_acceptances FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
-- No INSERT/UPDATE/DELETE policies: writes go through accept_legal_document() only.

-- ============ functions ============
CREATE OR REPLACE FUNCTION public.accept_legal_document(_document_id uuid, _user_agent text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  doc RECORD;
  rec_id uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
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
END $$;

REVOKE EXECUTE ON FUNCTION public.accept_legal_document(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_legal_document(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pending_legal_acceptances()
RETURNS TABLE(document_id uuid, doc_type text, version integer, title text, summary_of_changes text, effective_date date)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT d.id, d.doc_type, d.version, d.title, d.summary_of_changes, d.effective_date
  FROM public.legal_documents d
  WHERE d.status = 'published'
    AND d.requires_acceptance
    AND auth.uid() IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.legal_acceptances a
      WHERE a.document_id = d.id AND a.user_id = auth.uid()
    )
  ORDER BY d.doc_type;
$$;

REVOKE EXECUTE ON FUNCTION public.pending_legal_acceptances() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pending_legal_acceptances() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_publish_legal_document(_document_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE doc RECORD;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can publish legal documents';
  END IF;

  PERFORM public.assert_admin_write_rate_limit(auth.uid(), 50);

  SELECT * INTO doc FROM public.legal_documents WHERE id = _document_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Legal document not found'; END IF;
  IF doc.status = 'published' THEN RAISE EXCEPTION 'This version is already published'; END IF;
  IF doc.status = 'archived' THEN RAISE EXCEPTION 'Archived versions cannot be republished'; END IF;

  UPDATE public.legal_documents
     SET status = 'archived'
   WHERE doc_type = doc.doc_type AND status = 'published';

  UPDATE public.legal_documents
     SET status = 'published',
         published_at = now()
   WHERE id = _document_id;

  INSERT INTO public.admin_audit_log (actor_id, action, resource_type, resource_id, record_count, details)
  VALUES (auth.uid(), 'update', 'legal_documents', _document_id::text, 1,
          jsonb_build_object('doc_type', doc.doc_type, 'version', doc.version,
                             'requires_acceptance', doc.requires_acceptance,
                             'effective_date', doc.effective_date,
                             'action', 'publish'));

  RETURN _document_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_publish_legal_document(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_publish_legal_document(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_legal_document_stats()
RETURNS TABLE(document_id uuid, doc_type text, version integer, status text, accepted_count bigint, total_users bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can read legal document statistics';
  END IF;

  RETURN QUERY
  SELECT d.id, d.doc_type, d.version, d.status,
         (SELECT count(*) FROM public.legal_acceptances a WHERE a.document_id = d.id),
         (SELECT count(*) FROM public.profiles)
  FROM public.legal_documents d
  ORDER BY d.doc_type, d.version DESC;
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_legal_document_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_legal_document_stats() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_legal_pending_users(_document_id uuid, _limit integer DEFAULT 100)
RETURNS TABLE(user_id uuid, display_name text, joined_at timestamptz)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can read pending acceptance lists';
  END IF;

  RETURN QUERY
  SELECT p.user_id, p.display_name, p.created_at
  FROM public.profiles p
  WHERE NOT EXISTS (
    SELECT 1 FROM public.legal_acceptances a
    WHERE a.document_id = _document_id AND a.user_id = p.user_id
  )
  ORDER BY p.created_at DESC
  LIMIT GREATEST(LEAST(COALESCE(_limit, 100), 500), 1);
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_legal_pending_users(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_legal_pending_users(uuid, integer) TO authenticated, service_role;

-- ============ seed v1 (bundled content) ============
INSERT INTO public.legal_documents
  (doc_type, version, status, title, content_key, summary_of_changes, requires_acceptance, effective_date, published_at)
VALUES
  ('terms', 1, 'published', 'Terms & Conditions', 'bundled:terms_v1',
   'Initial published version of the Gradr Terms & Conditions.', false, DATE '2026-08-12', now()),
  ('privacy', 1, 'published', 'Privacy Notice', 'bundled:privacy_v1',
   'Initial published version of the Gradr Privacy Notice.', false, DATE '2026-08-12', now());