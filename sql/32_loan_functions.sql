-- Feature: Lánað og skilað — service_role-only RPC functions
-- Dependencies: 30_loan_items.sql, 31_loan_invitations.sql
--
-- Security model:
--   - All functions: REVOKE EXECUTE FROM PUBLIC, anon, authenticated
--   - All functions: GRANT EXECUTE TO service_role only
--   - No SECURITY DEFINER (service_role already has full table access)
--   - SET search_path = '' on every function
--   - p_actor_id validated against auth.users inside each function
--
-- Email note: EMAIL_FROM must be a Resend-verified sender before production.
-- The fallback domain (mail.gottvibe.is) must also be verified if EMAIL_FROM is unset.

-- ============================================================
-- 1. create_loan
-- Atomic idempotency: INSERT ON CONFLICT DO NOTHING.
-- If conflict (duplicate request_id for same creator), returns existing ids.
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_loan(
  p_actor_id        uuid,
  p_item_name       text,
  p_note            text,
  p_loaned_at       date,
  p_due_at          date,
  p_creator_role    text,   -- 'lender' | 'borrower'
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

  v_actor_norm     := lower(trim(v_actor_email));
  v_recipient_norm := lower(trim(p_recipient_email));

  -- Advisory lock: taken FIRST so that concurrent requests with the same
  -- request_id cannot both miss the idempotency check before either inserts.
  -- Lock class 1001 = loan_create actor rate limit; hashtext returns int4.
  PERFORM pg_catalog.pg_advisory_xact_lock(1001, pg_catalog.hashtext(p_actor_id::text));

  -- Idempotency fast path: if this (actor, request_id) was already processed,
  -- return the existing result without touching rate limits.
  -- Runs under advisory lock 1001 so concurrent same-request_id calls are serialised.
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

  -- Actor on allowlist (defense in depth vs. server action layer)
  IF NOT EXISTS (
    SELECT 1 FROM public.auth_mvp_allowlist WHERE email = v_actor_norm
  ) THEN RAISE EXCEPTION 'recipient_unavailable'; END IF;

  -- Self-invite
  IF v_recipient_norm = v_actor_norm THEN
    RAISE EXCEPTION 'recipient_unavailable';
  END IF;

  -- Recipient on allowlist
  IF NOT EXISTS (
    SELECT 1 FROM public.auth_mvp_allowlist WHERE email = v_recipient_norm
  ) THEN RAISE EXCEPTION 'recipient_unavailable'; END IF;

  -- Role
  IF p_creator_role NOT IN ('lender', 'borrower') THEN
    RAISE EXCEPTION 'invalid_role';
  END IF;

  -- Item name
  IF char_length(trim(p_item_name)) = 0 OR char_length(p_item_name) > 200 THEN
    RAISE EXCEPTION 'invalid_item_name';
  END IF;

  -- Rate limit: max 10 invitations created by this actor in the last 24 hours
  -- (advisory lock 1001 already held above)
  IF (
    SELECT COUNT(*) FROM public.loan_invitations
    WHERE invited_by = p_actor_id
      AND created_at > now() - INTERVAL '24 hours'
  ) >= 10 THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  -- Advisory lock: serialises count + INSERT for this actor/recipient pair.
  -- Lock class 1002 = loan_create per-actor/recipient rate limit.
  PERFORM pg_catalog.pg_advisory_xact_lock(1002, pg_catalog.hashtext(p_actor_id::text || ':' || v_recipient_norm));

  -- Rate limit: max 3 invitations from this actor to the same recipient in 24 hours.
  -- Per-actor/per-recipient prevents one user from spamming a single recipient
  -- without blocking other users from inviting the same recipient.
  IF (
    SELECT COUNT(*) FROM public.loan_invitations
    WHERE invited_by = p_actor_id
      AND recipient_email_normalized = v_recipient_norm
      AND created_at > now() - INTERVAL '24 hours'
  ) >= 3 THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  -- Atomic INSERT with idempotency: ON CONFLICT DO NOTHING returns NULL id on conflict
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

  -- Conflict path: v_loan_id is NULL — return existing loan and invitation
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

  -- New loan: insert invitation for the other role
  INSERT INTO public.loan_invitations (
    loan_id,
    recipient_role,
    recipient_email_normalized,
    invited_by
  ) VALUES (
    v_loan_id,
    CASE WHEN p_creator_role = 'lender' THEN 'borrower' ELSE 'lender' END,
    v_recipient_norm,
    p_actor_id
  ) RETURNING id INTO v_invitation_id;

  RETURN QUERY SELECT v_loan_id, v_invitation_id;
END;
$$;

-- ============================================================
-- 2. update_loan
-- Pre-acceptance edit by creator only.
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_loan(
  p_actor_id   uuid,
  p_loan_id    uuid,
  p_item_name  text,
  p_note       text,
  p_loaned_at  date,
  p_due_at     date
)
RETURNS text
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_loan public.loan_items;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = p_actor_id) THEN
    RETURN 'unauthenticated';
  END IF;

  SELECT * INTO v_loan
  FROM public.loan_items
  WHERE id = p_loan_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF v_loan.created_by IS DISTINCT FROM p_actor_id THEN RETURN 'not_found'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.loan_invitations
    WHERE loan_id = p_loan_id AND status = 'accepted'
  ) THEN RETURN 'not_editable'; END IF;

  IF char_length(trim(p_item_name)) = 0 OR char_length(p_item_name) > 200 THEN
    RETURN 'invalid_item_name';
  END IF;
  IF p_due_at IS NOT NULL AND p_due_at < p_loaned_at THEN
    RETURN 'invalid_due_date';
  END IF;

  UPDATE public.loan_items
  SET item_name  = p_item_name,
      note       = p_note,
      loaned_at  = p_loaned_at,
      due_at     = p_due_at,
      updated_at = now()
  WHERE id = p_loan_id;

  RETURN 'ok';
END;
$$;

-- ============================================================
-- 3. get_my_loans
-- Returns all loans where p_actor_id is lender or borrower.
-- Includes can_send_invitation (computed) and invitation_attempt_status.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_my_loans(p_actor_id uuid)
RETURNS TABLE (
  id                        uuid,
  item_name                 text,
  note                      text,
  loaned_at                 date,
  due_at                    date,
  returned_at               timestamptz,
  my_role                   text,
  other_display_name        text,
  invitation_id             uuid,
  invitation_status         text,
  invitation_attempt_status text,
  can_send_invitation       boolean,
  is_creator                boolean
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = p_actor_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    li.id,
    li.item_name,
    li.note,
    li.loaned_at,
    li.due_at,
    li.returned_at,
    CASE WHEN li.lender_user_id = p_actor_id THEN 'lender'::text ELSE 'borrower'::text END,
    CASE
      WHEN li.lender_user_id = p_actor_id THEN p_borrower.display_name
      ELSE p_lender.display_name
    END,
    inv.id,
    -- Effective status: treat pending-but-expired as 'expired' without writing to DB.
    -- The real status transition still happens under row lock in reserve/claim.
    CASE
      WHEN inv.status = 'pending' AND inv.expires_at <= now() THEN 'expired'::text
      ELSE inv.status
    END,
    inv.attempt_status,
    -- can_send_invitation: uses effective status so an expired-but-pending row
    -- correctly shows can_send = false without requiring a DB write here.
    (
      inv.id IS NOT NULL
      AND inv.status = 'pending'
      AND inv.expires_at > now()
      AND inv.invited_by = p_actor_id
      AND inv.attempt_number < 3
      AND (
        inv.attempt_status IS NULL
        OR (inv.attempt_status = 'failed'
            AND inv.attempt_at < now() - INTERVAL '5 minutes')
        OR (inv.attempt_status = 'reserved'
            AND inv.attempt_at >= now() - INTERVAL '24 hours')
      )
    ),
    (li.created_by = p_actor_id)
  FROM public.loan_items li
  LEFT JOIN public.profiles p_lender   ON p_lender.id  = li.lender_user_id
  LEFT JOIN public.profiles p_borrower ON p_borrower.id = li.borrower_user_id
  LEFT JOIN LATERAL (
    SELECT inv_inner.*
    FROM public.loan_invitations inv_inner
    WHERE inv_inner.loan_id = li.id
    ORDER BY inv_inner.created_at DESC, inv_inner.id DESC
    LIMIT 1
  ) inv ON true
  WHERE li.lender_user_id = p_actor_id
     OR li.borrower_user_id = p_actor_id
  ORDER BY li.loaned_at DESC;
END;
$$;

-- ============================================================
-- 4. get_my_pending_invitations
-- Returns pending invitations addressed to p_actor_id's email.
-- Excludes invitations where expires_at <= now().
-- Does NOT return recipient_email.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_my_pending_invitations(p_actor_id uuid)
RETURNS TABLE (
  invitation_id        uuid,
  loan_id              uuid,
  item_name            text,
  recipient_role       text,
  loaned_at            date,
  due_at               date,
  status               text,
  expires_at           timestamptz,
  creator_display_name text
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_actor_email text;
BEGIN
  SELECT au.email INTO v_actor_email FROM auth.users au WHERE au.id = p_actor_id;
  IF NOT FOUND THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    inv.id,
    li.id,
    li.item_name,
    inv.recipient_role,
    li.loaned_at,
    li.due_at,
    inv.status,
    inv.expires_at,
    p.display_name
  FROM public.loan_invitations inv
  JOIN public.loan_items li ON li.id = inv.loan_id
  LEFT JOIN public.profiles p ON p.id = inv.invited_by
  WHERE inv.recipient_email_normalized = lower(trim(v_actor_email))
    AND inv.status = 'pending'
    AND inv.expires_at > now()
  ORDER BY inv.created_at DESC;
END;
$$;

-- ============================================================
-- 5. get_invitation_for_claim
-- Returns invitation for the claim page.
-- Only if actor's email matches recipient_email_normalized.
-- Returns any status so claim page can show correct message.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_invitation_for_claim(
  p_actor_id      uuid,
  p_invitation_id uuid
)
RETURNS TABLE (
  invitation_id        uuid,
  loan_id              uuid,
  item_name            text,
  recipient_role       text,
  loaned_at            date,
  due_at               date,
  status               text,
  expires_at           timestamptz,
  creator_display_name text
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_actor_email text;
BEGIN
  SELECT au.email INTO v_actor_email FROM auth.users au WHERE au.id = p_actor_id;
  IF NOT FOUND THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    inv.id,
    li.id,
    li.item_name,
    inv.recipient_role,
    li.loaned_at,
    li.due_at,
    inv.status,
    inv.expires_at,
    p.display_name
  FROM public.loan_invitations inv
  JOIN public.loan_items li ON li.id = inv.loan_id
  LEFT JOIN public.profiles p ON p.id = inv.invited_by
  WHERE inv.id = p_invitation_id
    AND inv.recipient_email_normalized = lower(trim(v_actor_email));
END;
$$;

-- ============================================================
-- 6. claim_loan_invitation
-- Atomic: locks invitation row, locks loan row, updates both.
-- ============================================================

CREATE OR REPLACE FUNCTION public.claim_loan_invitation(
  p_actor_id      uuid,
  p_invitation_id uuid
)
RETURNS text
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_actor_email text;
  v_inv         public.loan_invitations;
  v_loan        public.loan_items;
BEGIN
  SELECT au.email INTO v_actor_email FROM auth.users au WHERE au.id = p_actor_id;
  IF NOT FOUND THEN RETURN 'unauthenticated'; END IF;

  SELECT * INTO v_inv
  FROM public.loan_invitations
  WHERE id = p_invitation_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN 'not_found'; END IF;

  IF v_inv.status = 'accepted'         THEN RETURN 'already_claimed'; END IF;
  IF v_inv.status NOT IN ('pending', 'expired') THEN RETURN 'not_claimable'; END IF;

  IF v_inv.expires_at < now() THEN
    UPDATE public.loan_invitations
    SET status = 'expired', updated_at = now()
    WHERE id = p_invitation_id;
    RETURN 'expired';
  END IF;

  IF v_inv.status != 'pending' THEN RETURN 'not_claimable'; END IF;

  IF lower(trim(v_actor_email)) != v_inv.recipient_email_normalized THEN
    RETURN 'wrong_email';
  END IF;

  SELECT * INTO v_loan
  FROM public.loan_items
  WHERE id = v_inv.loan_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN 'loan_not_found'; END IF;

  IF v_inv.recipient_role = 'lender'   AND v_loan.borrower_user_id = p_actor_id THEN RETURN 'self_claim'; END IF;
  IF v_inv.recipient_role = 'borrower' AND v_loan.lender_user_id   = p_actor_id THEN RETURN 'self_claim'; END IF;

  IF v_inv.recipient_role = 'lender'   AND v_loan.lender_user_id   IS NOT NULL THEN RETURN 'already_claimed'; END IF;
  IF v_inv.recipient_role = 'borrower' AND v_loan.borrower_user_id IS NOT NULL THEN RETURN 'already_claimed'; END IF;

  IF v_inv.recipient_role = 'lender' THEN
    UPDATE public.loan_items
    SET lender_user_id = p_actor_id, updated_at = now()
    WHERE id = v_inv.loan_id;
  ELSE
    UPDATE public.loan_items
    SET borrower_user_id = p_actor_id, updated_at = now()
    WHERE id = v_inv.loan_id;
  END IF;

  UPDATE public.loan_invitations
  SET status = 'accepted', updated_at = now()
  WHERE id = p_invitation_id;

  RETURN 'ok';
END;
$$;

-- ============================================================
-- 7. reserve_invitation_send
-- Returns recipient_email for server-side use — never log or send to client.
-- ============================================================

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

  -- Expiry check under row lock: mark pending invitations as expired if time has passed
  IF v_inv.expires_at <= now() THEN
    UPDATE public.loan_invitations
    SET status = 'expired', updated_at = now()
    WHERE id = p_invitation_id;
    RETURN QUERY SELECT 0, false, 'expired'::text, NULL::text; RETURN;
  END IF;

  -- Re-validate that recipient is still on the allowlist.
  -- The address may have been removed since the invitation was created.
  IF NOT EXISTS (
    SELECT 1 FROM public.auth_mvp_allowlist
    WHERE email = v_inv.recipient_email_normalized
  ) THEN
    RETURN QUERY SELECT 0, false, 'recipient_unavailable'::text, NULL::text; RETURN;
  END IF;

  -- Reserved attempt: return same key for retry — runs before rate limit so a
  -- reserved attempt can always be reconciled regardless of send volume.
  IF v_inv.attempt_status = 'reserved' THEN
    IF v_inv.attempt_at >= now() - INTERVAL '24 hours' THEN
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

  -- Advisory lock: serialises count + reservation for this actor so concurrent
  -- requests do not both pass the rate limit before either reserves.
  -- Lock class 1003 = reserve_invitation_send actor rate limit.
  PERFORM pg_catalog.pg_advisory_xact_lock(1003, pg_catalog.hashtext(p_actor_id::text));

  -- Rate limit: max 10 invitations with a recent send attempt by this actor in 24h.
  -- Counts invitation rows (each row has one attempt_at, not one row per attempt).
  IF (
    SELECT COUNT(*) FROM public.loan_invitations
    WHERE invited_by = p_actor_id
      AND attempt_at > now() - INTERVAL '24 hours'
  ) >= 10 THEN
    RETURN QUERY SELECT 0, false, 'rate_limited'::text, NULL::text; RETURN;
  END IF;

  v_new_number := v_inv.attempt_number + 1;

  UPDATE public.loan_invitations
  SET attempt_number = v_new_number,
      attempt_status = 'reserved',
      attempt_at     = now(),
      updated_at     = now()
  WHERE id = p_invitation_id;

  RETURN QUERY SELECT
    v_new_number, true, 'ok'::text,
    v_inv.recipient_email_normalized;
END;
$$;

-- ============================================================
-- 8. update_invitation_delivery
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_invitation_delivery(
  p_actor_id        uuid,
  p_invitation_id   uuid,
  p_attempt_number  int,
  p_status          text
)
RETURNS text
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_inv public.loan_invitations;
BEGIN
  IF p_status NOT IN ('sent', 'failed') THEN RETURN 'invalid_status'; END IF;

  SELECT * INTO v_inv
  FROM public.loan_invitations
  WHERE id = p_invitation_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF v_inv.invited_by IS DISTINCT FROM p_actor_id THEN RETURN 'not_found'; END IF;
  IF v_inv.attempt_number != p_attempt_number THEN RETURN 'stale_attempt'; END IF;
  IF v_inv.attempt_status = 'sent' AND p_status = 'sent' THEN RETURN 'ok'; END IF;
  IF v_inv.attempt_status = 'sent' AND p_status = 'failed' THEN RETURN 'stale_attempt'; END IF;
  IF v_inv.attempt_status != 'reserved' THEN RETURN 'stale_attempt'; END IF;

  UPDATE public.loan_invitations
  SET attempt_status = p_status,
      attempt_at     = now(),
      email_sent_at  = CASE
        WHEN p_status = 'sent' THEN COALESCE(email_sent_at, now())
        ELSE email_sent_at
      END,
      updated_at = now()
  WHERE id = p_invitation_id;

  RETURN 'ok';
END;
$$;

-- ============================================================
-- 9. mark_returned
-- Both participants. Requires both parties to have joined
-- (lender_user_id and borrower_user_id both set).
-- ============================================================

CREATE OR REPLACE FUNCTION public.mark_returned(
  p_actor_id uuid,
  p_loan_id  uuid
)
RETURNS text
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_loan public.loan_items;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = p_actor_id) THEN
    RETURN 'unauthenticated';
  END IF;

  SELECT * INTO v_loan
  FROM public.loan_items
  WHERE id = p_loan_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN 'not_found'; END IF;

  IF v_loan.lender_user_id IS DISTINCT FROM p_actor_id
    AND v_loan.borrower_user_id IS DISTINCT FROM p_actor_id
  THEN RETURN 'not_found'; END IF;

  -- Both parties must have joined
  IF v_loan.lender_user_id IS NULL OR v_loan.borrower_user_id IS NULL THEN
    RETURN 'invitation_not_accepted';
  END IF;

  IF v_loan.returned_at IS NOT NULL THEN RETURN 'already_returned'; END IF;

  UPDATE public.loan_items
  SET returned_at = now(),
      returned_by = p_actor_id,
      updated_at  = now()
  WHERE id = p_loan_id;

  RETURN 'ok';
END;
$$;

-- ============================================================
-- 10. undo_return
-- Both participants. Requires both parties to have joined.
-- ============================================================

CREATE OR REPLACE FUNCTION public.undo_return(
  p_actor_id uuid,
  p_loan_id  uuid
)
RETURNS text
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_loan public.loan_items;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = p_actor_id) THEN
    RETURN 'unauthenticated';
  END IF;

  SELECT * INTO v_loan
  FROM public.loan_items
  WHERE id = p_loan_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN 'not_found'; END IF;

  IF v_loan.lender_user_id IS DISTINCT FROM p_actor_id
    AND v_loan.borrower_user_id IS DISTINCT FROM p_actor_id
  THEN RETURN 'not_found'; END IF;

  IF v_loan.lender_user_id IS NULL OR v_loan.borrower_user_id IS NULL THEN
    RETURN 'invitation_not_accepted';
  END IF;

  IF v_loan.returned_at IS NULL THEN RETURN 'not_returned'; END IF;

  UPDATE public.loan_items
  SET returned_at = NULL,
      returned_by = NULL,
      updated_at  = now()
  WHERE id = p_loan_id;

  RETURN 'ok';
END;
$$;

-- ============================================================
-- 11. cancel_invitation
-- ============================================================

CREATE OR REPLACE FUNCTION public.cancel_invitation(
  p_actor_id uuid,
  p_loan_id  uuid
)
RETURNS text
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_inv public.loan_invitations;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = p_actor_id) THEN
    RETURN 'unauthenticated';
  END IF;

  SELECT * INTO v_inv
  FROM public.loan_invitations
  WHERE loan_id = p_loan_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF v_inv.invited_by IS DISTINCT FROM p_actor_id THEN RETURN 'not_found'; END IF;

  UPDATE public.loan_invitations
  SET status = 'cancelled', updated_at = now()
  WHERE id = v_inv.id;

  RETURN 'ok';
END;
$$;

-- ============================================================
-- 12. decline_invitation
-- ============================================================

CREATE OR REPLACE FUNCTION public.decline_invitation(
  p_actor_id      uuid,
  p_invitation_id uuid
)
RETURNS text
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_actor_email text;
  v_inv         public.loan_invitations;
BEGIN
  SELECT au.email INTO v_actor_email FROM auth.users au WHERE au.id = p_actor_id;
  IF NOT FOUND THEN RETURN 'unauthenticated'; END IF;

  SELECT * INTO v_inv
  FROM public.loan_invitations
  WHERE id = p_invitation_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF lower(trim(v_actor_email)) != v_inv.recipient_email_normalized THEN RETURN 'not_found'; END IF;
  IF v_inv.status != 'pending' THEN RETURN 'not_claimable'; END IF;

  UPDATE public.loan_invitations
  SET status = 'declined', updated_at = now()
  WHERE id = p_invitation_id;

  RETURN 'ok';
END;
$$;

-- ============================================================
-- 13. delete_loan
-- Creator only. No accepted invitation may exist.
-- ============================================================

CREATE OR REPLACE FUNCTION public.delete_loan(
  p_actor_id uuid,
  p_loan_id  uuid
)
RETURNS text
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_loan public.loan_items;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = p_actor_id) THEN
    RETURN 'unauthenticated';
  END IF;

  SELECT * INTO v_loan
  FROM public.loan_items
  WHERE id = p_loan_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF v_loan.created_by IS DISTINCT FROM p_actor_id THEN RETURN 'not_found'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.loan_invitations
    WHERE loan_id = p_loan_id AND status = 'accepted'
  ) THEN RETURN 'not_deletable'; END IF;

  DELETE FROM public.loan_items WHERE id = p_loan_id;

  RETURN 'ok';
END;
$$;

-- ============================================================
-- GRANTS: all functions service_role only
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.create_loan(uuid,text,text,date,date,text,text,uuid)    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_loan(uuid,uuid,text,text,date,date)              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_loans(uuid)                                      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_pending_invitations(uuid)                        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_invitation_for_claim(uuid,uuid)                     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_loan_invitation(uuid,uuid)                        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reserve_invitation_send(uuid,uuid)                      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_invitation_delivery(uuid,uuid,int,text)          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_returned(uuid,uuid)                                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.undo_return(uuid,uuid)                                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_invitation(uuid,uuid)                            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decline_invitation(uuid,uuid)                           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_loan(uuid,uuid)                                  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_loan(uuid,text,text,date,date,text,text,uuid)     TO service_role;
GRANT EXECUTE ON FUNCTION public.update_loan(uuid,uuid,text,text,date,date)               TO service_role;
GRANT EXECUTE ON FUNCTION public.get_my_loans(uuid)                                       TO service_role;
GRANT EXECUTE ON FUNCTION public.get_my_pending_invitations(uuid)                         TO service_role;
GRANT EXECUTE ON FUNCTION public.get_invitation_for_claim(uuid,uuid)                      TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_loan_invitation(uuid,uuid)                         TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_invitation_send(uuid,uuid)                       TO service_role;
GRANT EXECUTE ON FUNCTION public.update_invitation_delivery(uuid,uuid,int,text)           TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_returned(uuid,uuid)                                 TO service_role;
GRANT EXECUTE ON FUNCTION public.undo_return(uuid,uuid)                                   TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_invitation(uuid,uuid)                             TO service_role;
GRANT EXECUTE ON FUNCTION public.decline_invitation(uuid,uuid)                            TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_loan(uuid,uuid)                                   TO service_role;
