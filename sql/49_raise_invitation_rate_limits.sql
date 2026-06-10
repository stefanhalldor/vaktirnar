-- =============================================================================
-- sql/49_raise_invitation_rate_limits.sql
-- Raise invitation rate limits:
--   per-actor/24h:          10 → 50
--   per-actor+recipient/24h: 3 → 20
--   email-send attempts/24h: 10 → 50
-- Affected functions: create_loan, add_loan_invitation, reserve_invitation_send
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. create_loan — updated rate limits only
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_loan(
  p_actor_id        uuid,
  p_item_name       text,
  p_note            text,
  p_loaned_at       date,
  p_due_at          date,
  p_creator_role    text,
  p_recipient_email text,
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

  -- Recipient validation (only when email is provided)
  IF p_recipient_email IS NOT NULL THEN
    v_recipient_norm := lower(trim(p_recipient_email));

    IF v_recipient_norm = v_actor_norm THEN
      RAISE EXCEPTION 'recipient_unavailable';
    END IF;
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
    ) >= 50 THEN
      RAISE EXCEPTION 'rate_limited';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(1002, pg_catalog.hashtext(p_actor_id::text || ':' || v_recipient_norm));

    IF (
      SELECT COUNT(*) FROM public.loan_invitations
      WHERE invited_by = p_actor_id
        AND recipient_email_normalized = v_recipient_norm
        AND created_at > now() - INTERVAL '24 hours'
    ) >= 20 THEN
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
-- 2. add_loan_invitation — updated rate limits only
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
  v_loan_prelim    public.loan_items;
  v_loan           public.loan_items;
  v_expected_role  text;
  v_recipient_role text;
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

  -- Step 1: Advisory actor lock
  PERFORM pg_catalog.pg_advisory_xact_lock(1001, pg_catalog.hashtext(p_actor_id::text));

  -- Step 2: Preliminary loan read (no lock)
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

  -- Step 3: Lock active invitation for expected role (if exists)
  SELECT * INTO v_inv
  FROM public.loan_invitations
  WHERE loan_id        = p_loan_id
    AND recipient_role = v_expected_role
    AND status         IN ('pending', 'accepted')
  FOR UPDATE;

  -- Step 4: Lock loan row
  SELECT * INTO v_loan FROM public.loan_items WHERE id = p_loan_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

  -- Step 5: Re-validate all invariants under both locks
  IF v_loan.created_by IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  IF v_loan.lender_user_id = p_actor_id THEN
    v_recipient_role := 'borrower';
  ELSIF v_loan.borrower_user_id = p_actor_id THEN
    v_recipient_role := 'lender';
  ELSE
    RAISE EXCEPTION 'not_found';
  END IF;

  IF (v_recipient_role = 'borrower' AND v_loan.borrower_user_id IS NOT NULL)
  OR (v_recipient_role = 'lender'   AND v_loan.lender_user_id   IS NOT NULL)
  THEN
    RAISE EXCEPTION 'already_has_party';
  END IF;

  -- Step 6: Handle locked invitation state
  IF v_inv.id IS NOT NULL THEN
    IF v_inv.status = 'accepted' THEN
      RAISE EXCEPTION 'already_has_party';
    END IF;

    IF v_inv.expires_at <= now() THEN
      UPDATE public.loan_invitations
      SET status = 'expired', updated_at = now()
      WHERE id = v_inv.id;

    ELSIF v_inv.recipient_email_normalized = v_recipient_norm THEN
      RETURN QUERY SELECT v_inv.id;
      RETURN;

    ELSE
      RAISE EXCEPTION 'already_has_invitation';
    END IF;
  END IF;

  -- Step 7: Self-email and rate limit checks
  IF v_recipient_norm = v_actor_norm THEN
    RAISE EXCEPTION 'recipient_unavailable';
  END IF;

  IF (
    SELECT COUNT(*) FROM public.loan_invitations
    WHERE invited_by = p_actor_id
      AND created_at > now() - INTERVAL '24 hours'
  ) >= 50 THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(1002, pg_catalog.hashtext(p_actor_id::text || ':' || v_recipient_norm));

  IF (
    SELECT COUNT(*) FROM public.loan_invitations
    WHERE invited_by = p_actor_id
      AND recipient_email_normalized = v_recipient_norm
      AND created_at > now() - INTERVAL '24 hours'
  ) >= 20 THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  -- Step 8: INSERT with unique-violation handling
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
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint != 'loan_invitations_active_idx' THEN
        RAISE;
      END IF;

      SELECT id, recipient_email_normalized, status
      INTO   v_winning_id, v_winning_email, v_winning_status
      FROM   public.loan_invitations
      WHERE  loan_id        = p_loan_id
        AND  recipient_role = v_recipient_role
        AND  status         IN ('pending', 'accepted');

      IF NOT FOUND THEN
        RAISE EXCEPTION 'add_loan_invitation: unique violation but winner not found';
      END IF;

      IF v_winning_status = 'accepted' THEN
        RAISE EXCEPTION 'already_has_party';
      END IF;

      IF v_winning_email = v_recipient_norm THEN
        v_invitation_id := v_winning_id;
      ELSE
        RAISE EXCEPTION 'already_has_invitation';
      END IF;
  END;

  RETURN QUERY SELECT v_invitation_id;
END;
$$;

-- =============================================================================
-- 3. reserve_invitation_send — updated email-send rate limit only
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

  -- Existing reserved attempt
  IF v_inv.attempt_status = 'reserved' THEN
    IF v_inv.attempt_at >= now() - INTERVAL '24 hours' THEN
      IF v_inv.email_template_version IS NULL THEN
        RETURN QUERY SELECT v_inv.attempt_number, false, 'unknown_version'::text, NULL::text;
        RETURN;
      END IF;
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
  ) >= 50 THEN
    RETURN QUERY SELECT 0, false, 'rate_limited'::text, NULL::text; RETURN;
  END IF;

  v_new_number := v_inv.attempt_number + 1;

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
-- Grants (idempotent)
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.create_loan(uuid,text,text,date,date,text,text,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.create_loan(uuid,text,text,date,date,text,text,uuid)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.add_loan_invitation(uuid,uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.add_loan_invitation(uuid,uuid,text)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.reserve_invitation_send(uuid,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.reserve_invitation_send(uuid,uuid)
  TO service_role;

COMMIT;
