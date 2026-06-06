-- =============================================================================
-- sql/36_loan_optional_recipient.sql
-- Feature: Optional recipient email at loan creation + add-party flow.
--
-- Changes:
--   1. Three new nullable columns on loan_invitations:
--        item_name_snapshot           — copy of loan_items.item_name at INSERT
--        creator_display_name_snapshot — copy of profiles.display_name at INSERT
--        email_template_version        — set at first attempt reservation ('v2')
--      Existing rows get NULL; behaviour for each state documented in comments.
--
--   2. create_loan: p_recipient_email is now optional (NULL = no invitation).
--      Signature unchanged: (uuid,text,text,date,date,text,text,uuid).
--
--   3. reserve_invitation_send: sets email_template_version = 'v2' when a new
--      attempt is reserved (increment path only, never on retry of same attempt).
--      Blocks retry of reserved attempts with unknown (NULL) template version
--      to prevent Resend idempotency key payload mismatches.
--
--   4. add_loan_invitation: new function. Lock order matches claim_loan_invitation
--      (invitation-if-exists -> loan) to prevent deadlocks. All decisions and
--      mutations happen after both locks are held and all invariants are
--      re-validated. Unique violation is caught with GET STACKED DIAGNOSTICS
--      and handled deterministically.
--
-- Pre-sql/36 reserved attempts with email_template_version IS NULL:
--   - unknown_version: blocked (can_send = false). Creator must cancel the
--     invitation (cancel_invitation) and recreate via add_loan_invitation.
--     After 24 h the existing key_expired path takes over.
--   - attempt_status IS NULL / 'failed' / 'sent': unaffected. Next reservation
--     (if applicable) will set email_template_version = 'v2' correctly.
--
-- Safety:
--   - All changes in one transaction.
--   - ADD COLUMN IF NOT EXISTS: safe to re-run.
--   - CREATE OR REPLACE: does not touch data.
--   - No INSERT, DELETE, or ALTER TABLE ... ALTER COLUMN on existing data.
--
-- DEPLOYMENT ORDER — REQUIRED:
--
--   The new performInvitationSend runs a PREFLIGHT query on loan_invitations
--   BEFORE calling reserve_invitation_send. If the sql/36 columns are absent,
--   the preflight fails, the function returns uncertain, and reserve is NEVER
--   called — no DB mutation occurs. This prevents creating reserved attempts
--   with email_template_version = NULL, which would be permanently stuck as
--   unknown_version once sql/36 is deployed.
--
--   RECOMMENDED PRODUCTION ROLLOUT (safest):
--     a. Set LOANS_ENABLED=false (or equivalent feature flag) to pause loan
--        email sends while the migration window is open.
--     b. Deploy the updated app code to production.
--     c. Run sql/36 on Supabase.
--     d. Verify migration and app health.
--     e. Set LOANS_ENABLED=true to resume sends.
--   Do NOT perform these steps now — documented only.
--
--   APP-FIRST (acceptable if feature flag is unavailable):
--     1. Deploy the updated app code FIRST.
--        Effect: all loan email sends return uncertain (preflight fails,
--        columns missing). No reserved attempts are created. Safe suspension.
--     2. Run sql/36 AFTER the app is deployed.
--        Effect: columns exist; new reserves get email_template_version = 'v2';
--        sends resume with consistent payload. Attempts reserved before sql/36
--        (email_template_version = NULL) are blocked by unknown_version;
--        creators must cancel and recreate.
--
--   WHY SQL-FIRST IS PROHIBITED: Old app code does NOT run the preflight.
--   It calls reserve_invitation_send directly, which (under sql/36) sets
--   email_template_version = 'v2'. If the old app sends with the pre-sql/36
--   payload and returns uncertain (e.g. network timeout), the new app retries
--   with a different v2 payload for the same Resend idempotency key →
--   invalid_idempotent_request (409 → failed).
-- =============================================================================

BEGIN;

-- =============================================================================
-- Schema additions
-- =============================================================================

ALTER TABLE public.loan_invitations
  ADD COLUMN IF NOT EXISTS item_name_snapshot text
    CHECK (item_name_snapshot IS NULL OR char_length(item_name_snapshot) <= 200),
  ADD COLUMN IF NOT EXISTS creator_display_name_snapshot text
    CHECK (creator_display_name_snapshot IS NULL OR char_length(creator_display_name_snapshot) <= 200),
  ADD COLUMN IF NOT EXISTS email_template_version text
    CHECK (email_template_version IS NULL OR email_template_version IN ('v2'));

-- =============================================================================
-- 1. create_loan (modified)
-- p_recipient_email is now optional: NULL means create loan_items only.
-- When provided, creates invitation with snapshots.
-- Signature unchanged: (uuid,text,text,date,date,text,text,uuid)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_loan(
  p_actor_id        uuid,
  p_item_name       text,
  p_note            text,
  p_loaned_at       date,
  p_due_at          date,
  p_creator_role    text,   -- 'lender' | 'borrower'
  p_recipient_email text,   -- NULL = no invitation
  p_request_id      uuid
)
RETURNS TABLE (loan_id uuid, invitation_id uuid)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_actor_email    text;
  v_actor_norm     text;
  v_recipient_norm text;
  v_loan_id        uuid;
  v_invitation_id  uuid;
BEGIN
  -- Validate actor
  SELECT au.email INTO v_actor_email FROM auth.users au WHERE au.id = p_actor_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'unauthenticated'; END IF;

  v_actor_norm := lower(trim(v_actor_email));

  -- Advisory lock: actor rate limit / idempotency serializer
  PERFORM pg_catalog.pg_advisory_xact_lock(1001, pg_catalog.hashtext(p_actor_id::text));

  -- Idempotency fast path: return existing result without touching rate limits
  SELECT li.id, inv.id
  INTO v_loan_id, v_invitation_id
  FROM public.loan_items li
  LEFT JOIN public.loan_invitations inv ON inv.loan_id = li.id
  WHERE li.created_by = p_actor_id AND li.request_id = p_request_id
  LIMIT 1;

  IF v_loan_id IS NOT NULL THEN
    RETURN QUERY SELECT v_loan_id, v_invitation_id;
    RETURN;
  END IF;

  -- Actor on allowlist (defense-in-depth vs server action layer)
  IF NOT EXISTS (
    SELECT 1 FROM public.auth_mvp_allowlist WHERE email = v_actor_norm
  ) THEN RAISE EXCEPTION 'recipient_unavailable'; END IF;

  -- Recipient validation (only when email is provided)
  IF p_recipient_email IS NOT NULL THEN
    v_recipient_norm := lower(trim(p_recipient_email));

    IF v_recipient_norm = v_actor_norm THEN
      RAISE EXCEPTION 'recipient_unavailable';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.auth_mvp_allowlist WHERE email = v_recipient_norm
    ) THEN RAISE EXCEPTION 'recipient_unavailable'; END IF;
  END IF;

  -- Role validation
  IF p_creator_role NOT IN ('lender', 'borrower') THEN
    RAISE EXCEPTION 'invalid_role';
  END IF;

  -- Item name validation
  IF char_length(trim(p_item_name)) = 0 OR char_length(p_item_name) > 200 THEN
    RAISE EXCEPTION 'invalid_item_name';
  END IF;

  -- Rate limits (only when creating invitation)
  IF p_recipient_email IS NOT NULL THEN
    IF (
      SELECT COUNT(*) FROM public.loan_invitations
      WHERE invited_by = p_actor_id
        AND created_at > now() - INTERVAL '24 hours'
    ) >= 10 THEN
      RAISE EXCEPTION 'rate_limited';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(1002, pg_catalog.hashtext(p_actor_id::text || ':' || v_recipient_norm));

    IF (
      SELECT COUNT(*) FROM public.loan_invitations
      WHERE invited_by = p_actor_id
        AND recipient_email_normalized = v_recipient_norm
        AND created_at > now() - INTERVAL '24 hours'
    ) >= 3 THEN
      RAISE EXCEPTION 'rate_limited';
    END IF;
  END IF;

  -- Insert loan
  IF p_creator_role = 'lender' THEN
    INSERT INTO public.loan_items (
      item_name, note, loaned_at, due_at,
      lender_user_id, created_by, request_id
    ) VALUES (
      p_item_name, p_note, p_loaned_at, p_due_at,
      p_actor_id, p_actor_id, p_request_id
    )
    ON CONFLICT (created_by, request_id) DO NOTHING
    RETURNING id INTO v_loan_id;
  ELSE
    INSERT INTO public.loan_items (
      item_name, note, loaned_at, due_at,
      borrower_user_id, created_by, request_id
    ) VALUES (
      p_item_name, p_note, p_loaned_at, p_due_at,
      p_actor_id, p_actor_id, p_request_id
    )
    ON CONFLICT (created_by, request_id) DO NOTHING
    RETURNING id INTO v_loan_id;
  END IF;

  -- Conflict path: another concurrent insert won
  IF v_loan_id IS NULL THEN
    SELECT li.id, inv.id
    INTO v_loan_id, v_invitation_id
    FROM public.loan_items li
    LEFT JOIN public.loan_invitations inv ON inv.loan_id = li.id
    WHERE li.created_by = p_actor_id AND li.request_id = p_request_id
    LIMIT 1;

    IF v_loan_id IS NULL THEN
      RAISE EXCEPTION 'create_loan: idempotency conflict but existing row not found';
    END IF;

    RETURN QUERY SELECT v_loan_id, v_invitation_id;
    RETURN;
  END IF;

  -- Insert invitation with snapshots (only when email provided)
  IF p_recipient_email IS NOT NULL THEN
    INSERT INTO public.loan_invitations (
      loan_id,
      recipient_role,
      recipient_email_normalized,
      invited_by,
      item_name_snapshot,
      creator_display_name_snapshot
    ) VALUES (
      v_loan_id,
      CASE WHEN p_creator_role = 'lender' THEN 'borrower' ELSE 'lender' END,
      v_recipient_norm,
      p_actor_id,
      p_item_name,
      (SELECT p.display_name FROM public.profiles p WHERE p.id = p_actor_id)
    ) RETURNING id INTO v_invitation_id;
  END IF;

  RETURN QUERY SELECT v_loan_id, v_invitation_id;
END;
$$;

-- =============================================================================
-- 2. reserve_invitation_send (modified)
-- Adds unknown_version guard for pre-sql/36 reserved attempts.
-- Sets email_template_version = 'v2' simultaneously with attempt_number
-- increment. Never changed on retry of the same attempt_number.
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
      -- Known version: return same attempt for idempotent retry
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

  -- email_template_version is set here, simultaneously with attempt_number increment.
  -- It is never updated on retry of the same attempt_number, ensuring the payload
  -- version remains stable across all retries of a given idempotency key.
  UPDATE public.loan_invitations
  SET attempt_number         = v_new_number,
      attempt_status         = 'reserved',
      attempt_at             = now(),
      email_template_version = 'v2',
      updated_at             = now()
  WHERE id = p_invitation_id;

  RETURN QUERY SELECT
    v_new_number, true, 'ok'::text,
    v_inv.recipient_email_normalized;
END;
$$;

-- =============================================================================
-- 3. add_loan_invitation (new)
-- Adds a recipient to a loan that was created without one, or to a loan whose
-- previous invitation expired, was cancelled, or was declined.
--
-- Lock order: invitation (if exists) -> loan — matches claim_loan_invitation
-- to prevent deadlocks. No decisions or mutations before step 5 (re-validate).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.add_loan_invitation(
  p_actor_id        uuid,
  p_loan_id         uuid,
  p_recipient_email text
)
RETURNS TABLE (invitation_id uuid)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_actor_email    text;
  v_actor_norm     text;
  v_recipient_norm text;
  v_loan_prelim    public.loan_items;    -- preliminary read, no lock
  v_loan           public.loan_items;    -- locked read
  v_expected_role  text;                 -- role from preliminary read (invitation lock only)
  v_recipient_role text;                 -- role re-confirmed under both locks
  v_inv            public.loan_invitations;
  v_invitation_id  uuid;
  v_constraint     text;
  v_winning_id     uuid;
  v_winning_email  text;
  v_winning_status text;
BEGIN
  -- Validate actor
  SELECT au.email INTO v_actor_email FROM auth.users au WHERE au.id = p_actor_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'unauthenticated'; END IF;

  v_actor_norm     := lower(trim(v_actor_email));
  v_recipient_norm := lower(trim(p_recipient_email));

  -- ── Step 1: Advisory actor lock ──────────────────────────────────────────
  PERFORM pg_catalog.pg_advisory_xact_lock(1001, pg_catalog.hashtext(p_actor_id::text));

  -- ── Step 2: Preliminary loan read (no lock) ───────────────────────────────
  -- Used only to derive v_expected_role for the invitation lock in step 3.
  -- Authorization and role are fully re-verified under both locks in step 5.
  SELECT * INTO v_loan_prelim FROM public.loan_items WHERE id = p_loan_id;

  IF NOT FOUND OR v_loan_prelim.created_by IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  IF v_loan_prelim.lender_user_id = p_actor_id THEN
    v_expected_role := 'borrower';
  ELSIF v_loan_prelim.borrower_user_id = p_actor_id THEN
    v_expected_role := 'lender';
  ELSE
    RAISE EXCEPTION 'not_found';
  END IF;

  -- ── Step 3: Lock active invitation for expected role (if exists) ──────────
  -- Lock only. No decisions or mutations here.
  SELECT * INTO v_inv
  FROM public.loan_invitations
  WHERE loan_id        = p_loan_id
    AND recipient_role = v_expected_role
    AND status         IN ('pending', 'accepted')
  FOR UPDATE;

  -- ── Step 4: Lock loan row ─────────────────────────────────────────────────
  SELECT * INTO v_loan FROM public.loan_items WHERE id = p_loan_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

  -- ── Step 5: Re-validate all invariants under both locks ───────────────────
  IF v_loan.created_by IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  -- Recompute role under lock (state may differ from preliminary read)
  IF v_loan.lender_user_id = p_actor_id THEN
    v_recipient_role := 'borrower';
  ELSIF v_loan.borrower_user_id = p_actor_id THEN
    v_recipient_role := 'lender';
  ELSE
    RAISE EXCEPTION 'not_found';
  END IF;

  -- Confirm target slot is still empty
  IF (v_recipient_role = 'borrower' AND v_loan.borrower_user_id IS NOT NULL)
  OR (v_recipient_role = 'lender'   AND v_loan.lender_user_id   IS NOT NULL)
  THEN
    RAISE EXCEPTION 'already_has_party';
  END IF;

  -- ── Step 6: Handle locked invitation state ────────────────────────────────
  -- All decisions and mutations on the existing invitation occur here,
  -- after both locks are held and all invariants have been re-validated.
  IF v_inv.id IS NOT NULL THEN
    IF v_inv.status = 'accepted' THEN
      -- Defense-in-depth: slot check above should have caught this.
      RAISE EXCEPTION 'already_has_party';
    END IF;

    -- status must be 'pending' (the lock query filters on pending/accepted)
    IF v_inv.expires_at <= now() THEN
      -- Expired under lock: transition to expired, then fall through to INSERT.
      UPDATE public.loan_invitations
      SET status = 'expired', updated_at = now()
      WHERE id = v_inv.id;

    ELSIF v_inv.recipient_email_normalized = v_recipient_norm THEN
      -- Pending, same email: idempotent — return existing invitation_id.
      -- Caller will call performInvitationSend; reserve handles already_sent.
      RETURN QUERY SELECT v_inv.id;
      RETURN;

    ELSE
      -- Pending, different email: active invitation for another recipient.
      RAISE EXCEPTION 'already_has_invitation';
    END IF;
  END IF;

  -- ── Step 7: Allowlist and rate limit checks ───────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM public.auth_mvp_allowlist WHERE email = v_actor_norm
  ) THEN RAISE EXCEPTION 'recipient_unavailable'; END IF;

  IF v_recipient_norm = v_actor_norm THEN
    RAISE EXCEPTION 'recipient_unavailable';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.auth_mvp_allowlist WHERE email = v_recipient_norm
  ) THEN RAISE EXCEPTION 'recipient_unavailable'; END IF;

  IF (
    SELECT COUNT(*) FROM public.loan_invitations
    WHERE invited_by = p_actor_id
      AND created_at > now() - INTERVAL '24 hours'
  ) >= 10 THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(1002, pg_catalog.hashtext(p_actor_id::text || ':' || v_recipient_norm));

  IF (
    SELECT COUNT(*) FROM public.loan_invitations
    WHERE invited_by = p_actor_id
      AND recipient_email_normalized = v_recipient_norm
      AND created_at > now() - INTERVAL '24 hours'
  ) >= 3 THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  -- ── Step 8: INSERT with unique-violation handling ─────────────────────────
  -- loan_invitations_active_idx (loan_id, recipient_role) WHERE status IN
  -- ('pending','accepted') is the final concurrency guard for concurrent
  -- add_loan_invitation calls from different actors on the same loan.
  BEGIN
    INSERT INTO public.loan_invitations (
      loan_id,
      recipient_role,
      recipient_email_normalized,
      invited_by,
      item_name_snapshot,
      creator_display_name_snapshot
    ) VALUES (
      p_loan_id,
      v_recipient_role,
      v_recipient_norm,
      p_actor_id,
      v_loan.item_name,
      (SELECT p.display_name FROM public.profiles p WHERE p.id = p_actor_id)
    ) RETURNING id INTO v_invitation_id;

  EXCEPTION
    WHEN unique_violation THEN
      -- Only handle the expected active-invitation constraint; re-raise others.
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint != 'loan_invitations_active_idx' THEN
        RAISE;
      END IF;

      -- Find the invitation that won the concurrent INSERT race.
      SELECT id, recipient_email_normalized, status
      INTO   v_winning_id, v_winning_email, v_winning_status
      FROM   public.loan_invitations
      WHERE  loan_id        = p_loan_id
        AND  recipient_role = v_recipient_role
        AND  status         IN ('pending', 'accepted');

      IF NOT FOUND THEN
        -- Should not happen: unique violation implies a matching row exists.
        RAISE EXCEPTION 'add_loan_invitation: unique violation but winner not found';
      END IF;

      IF v_winning_status = 'accepted' THEN
        RAISE EXCEPTION 'already_has_party';
      END IF;

      IF v_winning_email = v_recipient_norm THEN
        -- Same email: treat as idempotent
        v_invitation_id := v_winning_id;
      ELSE
        -- Different email: concurrent insert for another recipient won
        RAISE EXCEPTION 'already_has_invitation';
      END IF;
  END;

  RETURN QUERY SELECT v_invitation_id;
END;
$$;

-- =============================================================================
-- Grants (idempotent REVOKE + GRANT for all modified/new functions)
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.create_loan(uuid,text,text,date,date,text,text,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.create_loan(uuid,text,text,date,date,text,text,uuid)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.reserve_invitation_send(uuid,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.reserve_invitation_send(uuid,uuid)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.add_loan_invitation(uuid,uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.add_loan_invitation(uuid,uuid,text)
  TO service_role;

COMMIT;
