-- =============================================================================
-- sql/38_atomic_otp_verification.sql
-- Feature: Atomic OTP verification for auth_email_codes and admin_login_codes
--
-- Replaces the non-atomic multi-step verify flow (SELECT → check → UPDATE
-- attempts → compare → UPDATE used_at) with two single-transaction RPCs that
-- lock the target row, increment attempts, and conditionally mark the code
-- used — all within the same Postgres transaction.
--
-- Deployment order:
--   1. Run this migration BEFORE deploying the updated application code.
--      The new TypeScript calls verify_user_otp_code / verify_admin_otp_code.
--      Until this migration is applied those RPC names do not exist and all
--      OTP verifications will fail with an RPC error.
--
-- Rollback order:
--   1. Roll back (redeploy) the previous TypeScript code FIRST so that the
--      old multi-step SELECT/UPDATE pattern is active again.
--   2. Only then drop the functions if desired:
--        DROP FUNCTION IF EXISTS public.verify_user_otp_code(text, text);
--        DROP FUNCTION IF EXISTS public.verify_admin_otp_code(text, text);
--      WARNING: dropping these functions while the new TypeScript is live
--      causes all OTP verifications to fail immediately.
--
-- Safety:
--   - CREATE OR REPLACE: safely re-runnable; no data is modified.
--   - GRANT / REVOKE: idempotent; no error if already in target state.
--   - No INSERT, UPDATE, DELETE, DROP TABLE, or ALTER TABLE statement.
--   - No mutation of existing rows in auth_email_codes or admin_login_codes.
-- =============================================================================

BEGIN;

-- =============================================================================
-- Table grants (idempotent)
-- auth_email_codes (migration 27) and admin_login_codes (migration 21) already
-- REVOKE ALL from anon/authenticated. Explicit GRANT to service_role follows
-- the pattern in 34_loan_permissions_and_rpc_fix.sql to prevent 42501 errors
-- should the default privilege inheritance ever differ from expectations.
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.auth_email_codes  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_login_codes TO service_role;

REVOKE ALL ON public.auth_email_codes  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.admin_login_codes FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- 1. verify_user_otp_code
--
-- Atomically verifies a submitted OTP hash against public.auth_email_codes.
--
-- Parameters:
--   p_email          — the claimant's email address (normalised internally)
--   p_submitted_hash — HMAC-SHA256 hex digest computed in the application
--                      layer using AUTH_CODE_SECRET; never a plaintext OTP
--
-- Returns TRUE if and only if all of the following hold in one transaction:
--   - p_submitted_hash is exactly 64 lowercase hex characters
--   - the latest row for the normalised email exists
--   - that row has used_at IS NULL (not yet consumed)
--   - that row has expires_at > now() (not expired)
--   - that row has fewer than 5 prior attempts
--   - the submitted hash matches the stored code_hash
--   - this transaction is the FIRST to successfully consume the code
--
-- Fallback-prevention design:
--   The SELECT has no used_at or expires_at filter. It always locks the single
--   latest row for the email. State checks (used, expired, exhausted) happen
--   after the lock is held. This guarantees that requesting code B after code A
--   means only B can ever verify: once B exists it is always selected, and
--   consuming B never causes the query to fall back to A.
--
-- Atomicity guarantee:
--   SELECT … FOR UPDATE acquires an exclusive row-level lock on the single
--   row chosen by ORDER BY created_at DESC, id DESC LIMIT 1. Concurrent
--   transactions block at that SELECT until this transaction commits. The
--   second concurrent correct submission acquires the lock after the first
--   commits, then finds v_used_at IS NOT NULL and returns FALSE.
--   Concurrent wrong submissions serialise through the same lock and each
--   increments the attempt counter; no concurrent group can exceed the
--   five-attempt allowance.
--
-- SECURITY INVOKER: executes with the caller's privileges (service_role).
--   Not SECURITY DEFINER — the function does not need elevated privileges
--   beyond those already held by the service_role caller.
-- SET search_path = '': prevents schema-search-path injection attacks.
--
-- Timing note (Valkostur B — HMAC pre-image protection):
--   The final comparison uses SQL = (not a constant-time comparator).
--   This is acceptable because the stored code_hash is an HMAC-SHA256
--   digest: an attacker observing comparison timing cannot recover the
--   plaintext OTP or AUTH_CODE_SECRET without breaking HMAC pre-image
--   resistance. The 5-attempt limit further constrains any brute-force
--   approach. A timing oracle is therefore not a viable attack path.
--
-- Secret rotation:
--   Rotating AUTH_CODE_SECRET invalidates all active codes within their
--   10-minute TTL window. Stored hashes are HMAC(email:code, old_secret);
--   the new secret produces a different digest for the same inputs.
--   After rotation, users mid-flow must request a new code.
--   AUTH_CODE_SECRET must be at least 32 bytes (enforced in hashCode()).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.verify_user_otp_code(
  p_email          text,
  p_submitted_hash text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_email      text;
  v_id         uuid;
  v_code_hash  text;
  v_attempts   int;
  v_used_at    timestamptz;
  v_expires_at timestamptz;
BEGIN
  -- Normalise email; reject null or empty
  v_email := lower(btrim(p_email));
  IF v_email IS NULL OR v_email = '' THEN
    RETURN false;
  END IF;

  -- Validate submitted hash: must be exactly 64 lowercase hex characters.
  -- Malformed input is rejected without touching any row.
  IF p_submitted_hash IS NULL OR p_submitted_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN false;
  END IF;

  -- Lock the single latest code row for this email, regardless of state.
  -- No used_at/expires_at filter in the WHERE clause: the latest row is always
  -- selected so that an older code can never become the target after a newer one
  -- has been issued, consumed, or expired.
  SELECT id, code_hash, attempts, used_at, expires_at
  INTO   v_id, v_code_hash, v_attempts, v_used_at, v_expires_at
  FROM   public.auth_email_codes
  WHERE  email = v_email
  ORDER BY created_at DESC, id DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- State guards (evaluated after the row is locked, preventing TOCTOU).
  -- No mutation occurs for any of these failure paths.
  IF v_used_at IS NOT NULL THEN RETURN false; END IF;
  IF v_expires_at <= now()  THEN RETURN false; END IF;

  -- Exhausted: do not increment attempts further; return false immediately.
  IF v_attempts >= 5 THEN
    RETURN false;
  END IF;

  -- Atomic write: increment attempts exactly once AND conditionally mark
  -- the code consumed — both in the same transaction, under the row lock.
  -- ELSE used_at preserves the existing column value (NULL) rather than
  -- writing NULL explicitly, which is semantically correct and future-proof
  -- should the column gain a NOT NULL constraint.
  UPDATE public.auth_email_codes
  SET
    attempts = attempts + 1,
    used_at  = CASE
                 WHEN code_hash = p_submitted_hash THEN now()
                 ELSE used_at
               END
  WHERE id = v_id;

  RETURN (v_code_hash = p_submitted_hash);
END;
$$;

-- =============================================================================
-- 2. verify_admin_otp_code
--
-- Identical logic against public.admin_login_codes.
-- Kept as a separate function from verify_user_otp_code for independent
-- audit surface and to allow divergent changes without coupling the flows.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.verify_admin_otp_code(
  p_email          text,
  p_submitted_hash text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_email      text;
  v_id         uuid;
  v_code_hash  text;
  v_attempts   int;
  v_used_at    timestamptz;
  v_expires_at timestamptz;
BEGIN
  v_email := lower(btrim(p_email));
  IF v_email IS NULL OR v_email = '' THEN
    RETURN false;
  END IF;

  IF p_submitted_hash IS NULL OR p_submitted_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN false;
  END IF;

  SELECT id, code_hash, attempts, used_at, expires_at
  INTO   v_id, v_code_hash, v_attempts, v_used_at, v_expires_at
  FROM   public.admin_login_codes
  WHERE  email = v_email
  ORDER BY created_at DESC, id DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_used_at IS NOT NULL THEN RETURN false; END IF;
  IF v_expires_at <= now()  THEN RETURN false; END IF;

  IF v_attempts >= 5 THEN
    RETURN false;
  END IF;

  UPDATE public.admin_login_codes
  SET
    attempts = attempts + 1,
    used_at  = CASE
                 WHEN code_hash = p_submitted_hash THEN now()
                 ELSE used_at
               END
  WHERE id = v_id;

  RETURN (v_code_hash = p_submitted_hash);
END;
$$;

-- =============================================================================
-- Grants: REVOKE from PUBLIC/anon/authenticated; GRANT EXECUTE to service_role
-- REVOKE is idempotent: no error if the privilege was already absent.
-- These functions must not be callable by unauthenticated or authenticated
-- Supabase clients — only the server-side service_role client may call them.
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.verify_user_otp_code(text, text)  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.verify_admin_otp_code(text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.verify_user_otp_code(text, text)   TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_admin_otp_code(text, text)  TO service_role;

COMMIT;
