-- Migration 75: weather_fetch_runs run lifecycle and trigger attribution columns.
--
-- Adds columns to support:
--   - in-progress run detection (status = 'running')
--   - cron vs manual trigger attribution
--   - expected and actual Veðurstofan forecast cycle tracking
--
-- Unique partial index prevents two simultaneous 'running' rows for the same
-- source + fetch_type + expected_atime combination. This gives a DB-level
-- safety net against concurrent manual refreshes for the same cycle.
--
-- Defaults preserve backward-compatibility with existing rows:
--   status = 'succeeded' (all past rows are completed runs)
--   triggered_by = 'cron' (all past rows were from the cron job)
--
-- Access: service_role only (RLS already enabled, no policies).
--
-- Rollback:
--   DROP INDEX IF EXISTS public.weather_fetch_runs_one_running_vedurstofan_forec_idx;
--   ALTER TABLE public.weather_fetch_runs
--     DROP COLUMN IF EXISTS result_atime,
--     DROP COLUMN IF EXISTS expected_atime,
--     DROP COLUMN IF EXISTS trigger_reason,
--     DROP COLUMN IF EXISTS triggered_by_user_id,
--     DROP COLUMN IF EXISTS triggered_by,
--     DROP COLUMN IF EXISTS status;

BEGIN;

ALTER TABLE public.weather_fetch_runs
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'succeeded'
    CHECK (status IN ('running', 'succeeded', 'failed', 'skipped')),
  ADD COLUMN IF NOT EXISTS triggered_by text NOT NULL DEFAULT 'cron'
    CHECK (triggered_by IN ('cron', 'manual', 'admin')),
  -- Nullable — only set for manual/admin triggered runs. No FK: operational log, not auth.
  ADD COLUMN IF NOT EXISTS triggered_by_user_id uuid,
  -- Short label for why this run was triggered, e.g. 'stale_cycle_refresh'.
  ADD COLUMN IF NOT EXISTS trigger_reason text,
  -- The Veðurstofan forecast cycle (atime) this run was expected to warm.
  ADD COLUMN IF NOT EXISTS expected_atime timestamptz,
  -- The actual cycle atime delivered after the run (may be older than expected if provider is behind).
  ADD COLUMN IF NOT EXISTS result_atime timestamptz;

-- Prevent two concurrent 'running' rows for the same cycle.
-- A second manual refresh for the same expected_atime will fail on INSERT
-- if the first is still in progress (status='running', finished_at IS NULL).
CREATE UNIQUE INDEX IF NOT EXISTS weather_fetch_runs_one_running_vedurstofan_forec_idx
  ON public.weather_fetch_runs (source, fetch_type, expected_atime)
  WHERE status = 'running' AND finished_at IS NULL;

COMMIT;
