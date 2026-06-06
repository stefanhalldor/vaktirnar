-- Feature: Lánað og skilað — loan_items table (two-party redesign)
-- Dependency: teskeid_set_updated_at() must exist (04_teskeid_schema.sql).
-- NOTE: sql/29_spaces.sql is NOT a dependency.
--
-- PREFLIGHT: Run this read-only check on the target Supabase before executing:
--   SELECT EXISTS (
--     SELECT 1 FROM pg_tables
--     WHERE schemaname = 'public' AND tablename = 'loan_items'
--   );
-- If it returns true, inspect the table columns to determine whether it is the
-- old space-based schema or the new two-party schema. If it is the old schema,
-- manually drop the table (after verifying there are no records to preserve)
-- before running this script.

-- ============================================================
-- PREFLIGHT GUARD
-- Stops the migration with a clear error if loan_items exists.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'loan_items'
  ) THEN
    RAISE EXCEPTION
      'loan_items already exists in schema ''public''. '
      'This migration cannot run safely while the table exists. '
      'Inspect the existing schema and data, then prepare a separate, '
      'carefully reviewed migration for this environment. '
      'No table or data will be dropped automatically.';
  END IF;
END;
$$;

-- ============================================================
-- TABLE
-- ============================================================

CREATE TABLE public.loan_items (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name        text        NOT NULL
                     CHECK (
                       char_length(trim(item_name)) > 0
                       AND char_length(item_name) <= 200
                     ),
  note             text
                     CHECK (note IS NULL OR char_length(note) <= 1000),
  loaned_at        date        NOT NULL DEFAULT current_date,
  due_at           date
                     CHECK (due_at IS NULL OR due_at >= loaned_at),
  lender_user_id   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  borrower_user_id uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  request_id       uuid        NOT NULL,
  returned_at      timestamptz,
  returned_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================

-- Idempotency: one loan per (creator, request_id)
CREATE UNIQUE INDEX loan_items_request_idx
  ON public.loan_items (created_by, request_id);

CREATE INDEX loan_items_lender_open_idx
  ON public.loan_items (lender_user_id, loaned_at DESC)
  WHERE returned_at IS NULL;

CREATE INDEX loan_items_borrower_open_idx
  ON public.loan_items (borrower_user_id, loaned_at DESC)
  WHERE returned_at IS NULL;

-- ============================================================
-- TRIGGER: updated_at
-- ============================================================

CREATE TRIGGER loan_items_updated_at
  BEFORE UPDATE ON public.loan_items
  FOR EACH ROW EXECUTE FUNCTION public.teskeid_set_updated_at();

-- ============================================================
-- RLS AND GRANTS
-- All mutations and reads go through service_role RPCs.
-- No direct authenticated access.
-- ============================================================

ALTER TABLE public.loan_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.loan_items FROM PUBLIC, anon, authenticated;
-- service_role requires explicit table privileges even though it bypasses RLS.
-- BYPASSRLS skips policy evaluation but does not substitute for GRANT.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_items TO service_role;
