-- =============================================================================
-- sql/37_loan_email_template_v3.sql
-- Feature: Email template v3 — no links, no URLs, plain-text body included.
--
-- Changes:
--   1. Widens the email_template_version check constraint on loan_invitations
--      to allow both 'v2' and 'v3'. Existing 'v2' rows are unaffected.
--
--   2. reserve_invitation_send: new reservations now receive
--      email_template_version = 'v3'. Retries of existing reserved attempts
--      are unaffected — the version column is not updated on retry, so
--      a reserved 'v2' attempt continues to retry as 'v2'.
--
-- Idempotency safety:
--   - DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT run in the same transaction:
--     the old constraint is removed first, then the new one is added.
--     Re-running the migration is safe — no partial state is possible.
--   - CREATE OR REPLACE: does not touch data.
--
-- Rollout order:
--   Deploy this app version (which accepts both v2 and v3 in EmailContext)
--   BEFORE running sql/37. The app already accepts v2 and v3 post-sql/36.
--   Running sql/37 only changes new reservations from v2 to v3; existing
--   reserved v2 attempts continue to be sent with the v2 payload.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. Widen email_template_version check constraint to allow v2 and v3
-- =============================================================================

ALTER TABLE public.loan_invitations
  DROP CONSTRAINT IF EXISTS loan_invitations_email_template_version_check;

ALTER TABLE public.loan_invitations
  ADD CONSTRAINT loan_invitations_email_template_version_check
    CHECK (email_template_version IS NULL OR email_template_version IN ('v2', 'v3'));

-- =============================================================================
-- 2. reserve_invitation_send (modified)
-- Sets email_template_version = 'v3' for new reservations.
-- Retry of an existing reserved attempt: version column is NOT updated,
-- so a reserved 'v2' attempt continues to use 'v2'.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.reserve_invitation_send(
  p_actor_id      uuid,
  p_invitation_id uuid
)
RETURNS TABLE (
  attempt_number  int,
  can_send        boolean,
  reason          text,
  recipient_email text
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_inv        public.loan_invitations;
  v_new_number int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = p_actor_id) THEN
    RETURN QUERY SELECT 0, false, 'unauthenticated'::text, NULL::text; RETURN;
  END IF;

  SELECT * INTO v_inv
  FROM public.loan_invitations
  WHERE id = p_invitation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 0, false, 'not_found'::text, NULL::text; RETURN;
  END IF;

  IF v_inv.invited_by IS DISTINCT FROM p_actor_id THEN
    RETURN QUERY SELECT 0, false, 'forbidden'::text, NULL::text; RETURN;
  END IF;

  IF v_inv.status != 'pending' THEN
    RETURN QUERY SELECT 0, false, 'not_pending'::text, NULL::text; RETURN;
  END IF;

  IF v_inv.expires_at <= now() THEN
    UPDATE public.loan_invitations
    SET status = 'expired', updated_at = now()
    WHERE id = p_invitation_id;
    RETURN QUERY SELECT 0, false, 'expired'::text, NULL::text; RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.auth_mvp_allowlist
    WHERE email = v_inv.recipient_email_normalized
  ) THEN
    RETURN QUERY SELECT 0, false, 'recipient_unavailable'::text, NULL::text; RETURN;
  END IF;

  -- Existing reserved attempt
  IF v_inv.attempt_status = 'reserved' THEN
    IF v_inv.attempt_at >= now() - INTERVAL '24 hours' THEN
      -- Block retry of unknown-version attempts to prevent Resend payload mismatch.
      -- email_template_version IS NULL means the attempt was reserved before sql/36.
      -- Creator must cancel and recreate the invitation to recover.
      IF v_inv.email_template_version IS NULL THEN
        RETURN QUERY SELECT v_inv.attempt_number, false, 'unknown_version'::text, NULL::text;
        RETURN;
      END IF;
      -- Known version (v2 or v3): return same attempt for idempotent retry.
      -- email_template_version is NOT updated here — retry uses the original version.
      RETURN QUERY SELECT
        v_inv.attempt_number, true, 'ok'::text,
        v_inv.recipient_email_normalized;
      RETURN;
    ELSE
      RETURN QUERY SELECT
        v_inv.attempt_number, false, 'key_expired'::text, NULL::text;
      RETURN;
    END IF;
  END IF;

  IF v_inv.attempt_status = 'sent' THEN
    RETURN QUERY SELECT 0, false, 'already_sent'::text, NULL::text; RETURN;
  END IF;

  IF v_inv.attempt_status = 'failed' THEN
    IF v_inv.attempt_at > now() - INTERVAL '5 minutes' THEN
      RETURN QUERY SELECT 0, false, 'cooldown'::text, NULL::text; RETURN;
    END IF;
  END IF;

  IF v_inv.attempt_number >= 3 THEN
    RETURN QUERY SELECT 0, false, 'max_sends'::text, NULL::text; RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(1003, pg_catalog.hashtext(p_actor_id::text));

  IF (
    SELECT COUNT(*) FROM public.loan_invitations
    WHERE invited_by = p_actor_id
      AND attempt_at > now() - INTERVAL '24 hours'
  ) >= 10 THEN
    RETURN QUERY SELECT 0, false, 'rate_limited'::text, NULL::text; RETURN;
  END IF;

  v_new_number := v_inv.attempt_number + 1;

  -- email_template_version is set to 'v3' for new reservations (increment path only).
  -- It is never updated on retry of the same attempt_number, ensuring the payload
  -- version remains stable across all retries of a given idempotency key.
  UPDATE public.loan_invitations
  SET attempt_number         = v_new_number,
      attempt_status         = 'reserved',
      attempt_at             = now(),
      email_template_version = 'v3',
      updated_at             = now()
  WHERE id = p_invitation_id;

  RETURN QUERY SELECT
    v_new_number, true, 'ok'::text,
    v_inv.recipient_email_normalized;
END;
$$;

-- =============================================================================
-- Grants (idempotent REVOKE + GRANT)
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.reserve_invitation_send(uuid,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.reserve_invitation_send(uuid,uuid)
  TO service_role;

COMMIT;
