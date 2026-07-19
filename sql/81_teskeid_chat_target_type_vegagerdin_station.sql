-- sql/81_teskeid_chat_target_type_vegagerdin_station.sql
-- Extends teskeid_chat_threads_target_type_check to include vegagerdin_station.
-- This migration ONLY changes the CHECK constraint — no grants, RLS, policies,
-- or table ownership are modified.
--
-- Prerequisite: sql/78_teskeid_chat_core.sql must have been run first.
--
-- Rollback: see bottom of file.

BEGIN;

ALTER TABLE public.teskeid_chat_threads
  DROP CONSTRAINT IF EXISTS teskeid_chat_threads_target_type_check;

ALTER TABLE public.teskeid_chat_threads
  ADD CONSTRAINT teskeid_chat_threads_target_type_check
    CHECK (target_type IN ('vedurstofan_station', 'vegagerdin_station'));

COMMIT;

-- ── Rollback ──────────────────────────────────────────────────────────────────
-- To undo this migration (run manually if needed):
--
-- WARNING: The rollback ADD CONSTRAINT will fail with a CHECK violation if
-- any rows in teskeid_chat_threads have target_type = vegagerdin_station.
-- Delete or migrate those rows before running the rollback.
--
-- BEGIN;
-- ALTER TABLE public.teskeid_chat_threads
--   DROP CONSTRAINT IF EXISTS teskeid_chat_threads_target_type_check;
-- ALTER TABLE public.teskeid_chat_threads
--   ADD CONSTRAINT teskeid_chat_threads_target_type_check
--     CHECK (target_type IN ('vedurstofan_station'));
-- COMMIT;
