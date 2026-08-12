BEGIN;

UPDATE legal_documents
SET content_key = 'bundled:terms_v1',
    updated_at = now()
WHERE doc_type = 'terms' AND status = 'published';

UPDATE legal_documents
SET content_key = 'bundled:privacy_v1',
    updated_at = now()
WHERE doc_type = 'privacy' AND status = 'published';

COMMIT;