-- =============================================================================
-- sql/72_auth_email_code_request_idempotency.sql
-- Feature: Idempotent OTP code creation for auth_email_codes
--
-- Adds RPC create_user_otp_code_if_allowed, which atomically:
--   1. Acquires a per-email advisory transaction lock (serialises concurrency)
--   2. Skips insertion if a recent active code exists (dedupe window)
--   3. Enforces per-email hourly rate limit
--   4. Inserts a new code row if allowed
--   5. Returns a JSON status object (no sensitive values)
--
-- Root cause fixed:
--   Multiple concurrent/retry /api/auth-mvp/request-code requests each
--   inserted a new row, invalidating in-flight emails. The verify RPC always
--   selects the newest row; delayed emails carrying older codes then failed.
--
-- Deployment order:
--   1. Run this migration BEFORE deploying the updated application code.
--      The updated TypeScript calls create_user_otp_code_if_allowed.
--      Until this migration is applied the RPC does not exist and code
--      creation will fail (RPC error -> null -> 500).
--
-- Rollback:
--   1. Redeploy previous TypeScript code first (reverts to old multi-step flow).
--   2. DROP FUNCTION IF EXISTS
--        public.create_user_otp_code_if_allowed(text, text, timestamptz, int, int);
--
-- Safety:
--   CREATE OR REPLACE: safely re-runnable; no existing data is modified.
--   GRANT / REVOKE: idempotent.
--   No DROP TABLE, ALTER TABLE on existing tables.
--   The INSERT inside the function body only runs when status = 'inserted'.
-- =============================================================================

BEGIN;

-- =============================================================================
-- create_user_otp_code_if_allowed
--
-- Parameters:
--   p_email        -- claimant email (normalised internally; never returned)
--   p_code_hash    -- HMAC-SHA256 hex digest from the application layer
--                     using AUTH_CODE_SECRET; never a plaintext OTP
--   p_expires_at   -- expiry timestamp for the new code row
--   p_dedupe_secs  -- seconds in which a recent active code suppresses a new one
--   p_max_per_hour -- max code insertions per email per rolling hour
--
-- Returns JSON with one of:
--   {"status":"inserted"}
--   {"status":"recent_active"}
--   {"status":"rate_limited","retry_after":"<ISO 8601 timestamp>"}
--   {"status":"error"}   -- malformed/empty input only
--
-- Atomicity:
--   pg_advisory_xact_lock serialises concurrent requests for the same email.
--   hashtext(text) returns int4; cast to bigint for the lock key.
--   Lock releases automatically at COMMIT or ROLLBACK.
--   Two simultaneous requests for the same email will queue at the lock line;
--   the second to proceed will then see the first's inserted row and return
--   recent_active instead of inserting a duplicate.
--
-- Privacy:
--   The function does not return p_code_hash, plaintext OTP, or p_email.
--   No sensitive values appear in the returned JSON.
--
-- SECURITY INVOKER: executes with the caller's privileges (service_role).
-- SET search_path = '': prevents schema-search-path injection.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_user_otp_code_if_allowed(
  p_email        text,
  p_code_hash    text,
  p_expires_at   timestamptz,
  p_dedupe_secs  int,
  p_max_per_hour int
)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_email        text;
  v_recent_count int;
  v_hour_count   int;
  v_oldest_at    timestamptz;
  v_retry_after  timestamptz;
BEGIN
  -- Normalise email; reject empty input
  v_email := lower(btrim(p_email));
  IF v_email IS NULL OR v_email = '' THEN
    RETURN json_build_object('status', 'error');
  END IF;

  -- Per-email advisory transaction lock.
  -- Serialises concurrent requests for the same email address so that two
  -- simultaneous request-code calls cannot both pass the dedupe check and
  -- both insert a new row.
  -- hashtext(text) -> int4; cast to bigint for pg_advisory_xact_lock(bigint).
  -- Lock is released automatically when this transaction commits or rolls back.
  PERFORM pg_advisory_xact_lock(hashtext(v_email)::bigint);

  -- Bounded cleanup: remove at most 100 stale rows (created > 24h ago).
  -- Bounded to avoid long-running deletes on the hot request path.
  DELETE FROM public.auth_email_codes
  WHERE ctid IN (
    SELECT ctid
    FROM   public.auth_email_codes
    WHERE  created_at < now() - INTERVAL '24 hours'
    LIMIT  100
  );

  -- Dedupe check: if a recent, active (unused, unexpired) code already exists,
  -- return recent_active so the caller does not create or send a new code.
  -- This is the primary fix for in-flight email invalidation.
  SELECT COUNT(*) INTO v_recent_count
  FROM   public.auth_email_codes
  WHERE  email      = v_email
    AND  used_at    IS NULL
    AND  expires_at >  now()
    AND  created_at >= now() - make_interval(secs => p_dedupe_secs);

  IF v_recent_count > 0 THEN
    RETURN json_build_object('status', 'recent_active');
  END IF;

  -- Per-email hourly rate limit check.
  -- Fetch oldest created_at in the window so the caller can tell the user
  -- exactly when the window clears (retry_after = oldest + 1 hour).
  SELECT COUNT(*), MIN(created_at)
  INTO   v_hour_count, v_oldest_at
  FROM   public.auth_email_codes
  WHERE  email      = v_email
    AND  created_at >= now() - INTERVAL '1 hour';

  IF v_hour_count >= p_max_per_hour THEN
    v_retry_after := COALESCE(v_oldest_at, now()) + INTERVAL '1 hour';
    RETURN json_build_object(
      'status',      'rate_limited',
      'retry_after', to_json(v_retry_after)
    );
  END IF;

  -- All checks passed: insert the new code row.
  INSERT INTO public.auth_email_codes (email, code_hash, expires_at)
  VALUES (v_email, p_code_hash, p_expires_at);

  RETURN json_build_object('status', 'inserted');
END;
$$;

-- =============================================================================
-- Permissions: service_role only
-- Matches the pattern in sql/38 and sql/42.
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.create_user_otp_code_if_allowed(text, text, timestamptz, int, int)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_user_otp_code_if_allowed(text, text, timestamptz, int, int)
  TO service_role;

COMMIT;
