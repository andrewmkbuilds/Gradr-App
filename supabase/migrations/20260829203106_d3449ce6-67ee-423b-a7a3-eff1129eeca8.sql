-- Saving/applying to a job upserts on (user_id, source, external_id). The existing
-- uniqueness was a PARTIAL index (WHERE external_id IS NOT NULL), which Postgres
-- cannot use for an ON CONFLICT column-list inference, so every save failed with
-- 42P10. Replace it with a plain unique index (NULL external_ids stay distinct
-- under btree semantics, so manually added jobs are unaffected).
DROP INDEX IF EXISTS public.idx_tracked_jobs_user_external;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tracked_jobs_user_external
  ON public.tracked_jobs (user_id, source, external_id);