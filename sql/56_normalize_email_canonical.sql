-- =============================================================================
-- sql/56_normalize_email_canonical.sql
-- Unified Gmail-aware email canonicalization (#43, #49).
--
-- Problem: loan_invitations.recipient_email_normalized was stored using
-- lower(trim(...)) only. Gmail/Googlemail treats dots in the local-part as
-- insignificant: fyrri.seinni@gmail.com and fyrriseinni@gmail.com deliver to
-- the same inbox. A user who signs up with the dotted form cannot see pending
-- loans sent to the undotted form (or vice versa).
--
-- Fix:
--   1. New helper: public.normalize_email_canonical(text) → text
--      Gmail/Googlemail: strip dots from local-part, domain → gmail.com.
--      All other domains: trim + lowercase only (dots are significant).
--      NULL input → NULL (STRICT). IMMUTABLE for planner optimisation.
--
--   2. Read paths: compare normalize_email_canonical(actor_email) against
--      normalize_email_canonical(stored_recipient_email_normalized) so that
--      existing non-canonical rows still match.
--
--   3. Write paths: store normalize_email_canonical(p_recipient_email) so
--      new rows are always in canonical form.
--
-- Affected functions (all updated in this migration):
--   get_my_loans, claim_loan_invitation, create_loan, add_loan_invitation,
--   get_my_pending_invitations, get_invitation_for_claim, decline_invitation.
--
-- auth_mvp_allowlist note:
--   This migration does NOT touch allowlist logic. Feature access is enforced
--   in TypeScript (guardFeatureAccess / checkFeatureAccess) which already uses
--   normalizeEmailForAccess() — the same Gmail-canonical logic as this helper.
--   No allowlist backfill is required for existing allowlist entries.
--
-- No table schema changes. No data migration in this migration.
-- An optional read-only preflight is provided at the bottom (commented out).
--
-- Migration safety:
--   get_my_loans adds no new columns — DROP+CREATE still used for consistency
--   with the established pattern from sql/50 and sql/55.
--   All other functions: CREATE OR REPLACE (signatures unchanged).
--
-- Rollout order:
--   1. Apply this migration.
--   2. Reload PostgREST schema cache (get_my_loans is re-created).
--   3. Deploy app code (TypeScript already uses normalizeEmailForAccess).
--
-- Rollback: restore function bodies from sql/55 (get_my_loans),
--   sql/50 (claim_loan_invitation), sql/49 (create_loan, add_loan_invitation),
--   sql/32 (get_my_pending_invitations, get_invitation_for_claim,
--           decline_invitation). No data changes to undo.
-- =============================================================================

BEGIN;

-- ── 1. normalize_email_canonical ──────────────────────────────────────────────
-- Canonicalizer only, not a validator. Empty or malformed inputs pass through
-- as lower(trim(input)). STRICT: NULL input → NULL output. Callers are
-- expected to validate email format before writing (TypeScript enforces this
-- at the application boundary).

CREATE OR REPLACE FUNCTION public.normalize_email_canonical(p_email text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT
    CASE
      WHEN split_part(lower(trim(p_email)), '@', 2) = 'gmail.com'
        OR split_part(lower(trim(p_email)), '@', 2) = 'googlemail.com'
      THEN replace(split_part(lower(trim(p_email)), '@', 1), '.', '') || '@gmail.com'
      ELSE lower(trim(p_email))
    END
$$;

REVOKE EXECUTE ON FUNCTION public.normalize_email_canonical(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.normalize_email_canonical(text) TO service_role;

-- ── 2. get_my_loans ───────────────────────────────────────────────────────────
-- Changes from sql/55:
--   v_actor_norm now uses normalize_email_canonical.
--   Branch 2 WHERE: normalize both sides so old dotted-Gmail data matches.

DROP FUNCTION IF EXISTS public.get_my_loans(uuid);

CREATE FUNCTION public.get_my_loans(p_actor_id uuid)
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
  is_creator                boolean,
  requires_acknowledgement  boolean,
  recipient_email           text
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_actor_email text;
  v_actor_norm  text;
BEGIN
  SELECT au.email INTO v_actor_email FROM auth.users au WHERE au.id = p_actor_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_actor_norm := public.normalize_email_canonical(v_actor_email);

  RETURN QUERY

  -- ── Branch 1: rows where actor is already lender or borrower ──────────────
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
    CASE
      WHEN inv.status = 'pending' AND inv.expires_at <= now() THEN 'expired'::text
      ELSE inv.status
    END,
    inv.attempt_status,
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
    (li.created_by = p_actor_id),
    false,
    -- Only expose recipient email to the creator of the loan
    CASE WHEN li.created_by = p_actor_id THEN inv.recipient_email_normalized ELSE NULL::text END
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

  UNION ALL

  -- ── Branch 2: pending invitation rows where actor is recipient by email ────
  -- Normalize both sides so old dotted-Gmail rows match canonical actor email.
  SELECT
    li.id,
    li.item_name,
    li.note,
    li.loaned_at,
    li.due_at,
    li.returned_at,
    inv.recipient_role::text,
    p_creator.display_name,
    inv.id,
    'pending'::text,
    inv.attempt_status,
    false,
    false,
    true,
    NULL::text
  FROM public.loan_invitations inv
  JOIN public.loan_items li ON li.id = inv.loan_id
  LEFT JOIN public.profiles p_creator ON p_creator.id = inv.invited_by
  WHERE public.normalize_email_canonical(inv.recipient_email_normalized) = v_actor_norm
    AND inv.status = 'pending'
    AND (li.lender_user_id   IS DISTINCT FROM p_actor_id)
    AND (li.borrower_user_id IS DISTINCT FROM p_actor_id)

  ORDER BY loaned_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_loans(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_my_loans(uuid) TO service_role;

-- ── 3. claim_loan_invitation ──────────────────────────────────────────────────
-- Change from sql/50: normalize both sides of the email equality check.

CREATE OR REPLACE FUNCTION public.claim_loan_invitation(
  p_actor_id      uuid,
  p_invitation_id uuid
)
RETURNS text
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_actor_email    text;
  v_actor_norm     text;
  v_recipient_norm text;
  v_inv            public.loan_invitations;
  v_loan           public.loan_items;
BEGIN
  SELECT au.email INTO v_actor_email FROM auth.users au WHERE au.id = p_actor_id;
  IF NOT FOUND THEN RETURN 'unauthenticated'; END IF;

  SELECT * INTO v_inv
  FROM public.loan_invitations
  WHERE id = p_invitation_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN 'not_found'; END IF;

  IF v_inv.status = 'accepted' THEN RETURN 'already_claimed'; END IF;
  IF v_inv.status != 'pending' THEN RETURN 'not_claimable';   END IF;

  v_actor_norm     := public.normalize_email_canonical(v_actor_email);
  v_recipient_norm := public.normalize_email_canonical(v_inv.recipient_email_normalized);

  -- IS DISTINCT FROM is NULL-safe: treats NULL != NULL correctly.
  -- NULL actor_norm guard ensures an auth.users row with a NULL email
  -- cannot bypass the ownership check.
  IF v_actor_norm IS NULL OR v_actor_norm IS DISTINCT FROM v_recipient_norm THEN
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

REVOKE EXECUTE ON FUNCTION public.claim_loan_invitation(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_loan_invitation(uuid, uuid) TO service_role;

-- ── 4. create_loan ────────────────────────────────────────────────────────────
-- Changes from sql/49: v_actor_norm and v_recipient_norm use canonical helper.

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
  SELECT au.email INTO v_actor_email FROM auth.users au WHERE au.id = p_actor_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'unauthenticated'; END IF;

  v_actor_norm := public.normalize_email_canonical(v_actor_email);

  PERFORM pg_catalog.pg_advisory_xact_lock(1001, pg_catalog.hashtext(p_actor_id::text));

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

  IF p_recipient_email IS NOT NULL THEN
    v_recipient_norm := public.normalize_email_canonical(p_recipient_email);

    IF v_recipient_norm = v_actor_norm THEN
      RAISE EXCEPTION 'recipient_unavailable';
    END IF;
  END IF;

  IF p_creator_role NOT IN ('lender', 'borrower') THEN
    RAISE EXCEPTION 'invalid_role';
  END IF;

  IF char_length(trim(p_item_name)) = 0 OR char_length(p_item_name) > 200 THEN
    RAISE EXCEPTION 'invalid_item_name';
  END IF;

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
        AND public.normalize_email_canonical(recipient_email_normalized) = v_recipient_norm
        AND created_at > now() - INTERVAL '24 hours'
    ) >= 20 THEN
      RAISE EXCEPTION 'rate_limited';
    END IF;
  END IF;

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

REVOKE EXECUTE ON FUNCTION public.create_loan(uuid,text,text,date,date,text,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.create_loan(uuid,text,text,date,date,text,text,uuid) TO service_role;

-- ── 5. add_loan_invitation ────────────────────────────────────────────────────
-- Changes from sql/49:
--   v_actor_norm and v_recipient_norm use canonical helper.
--   Idempotency check and unique-violation handler normalize stored email.

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
  SELECT au.email INTO v_actor_email FROM auth.users au WHERE au.id = p_actor_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'unauthenticated'; END IF;

  v_actor_norm     := public.normalize_email_canonical(v_actor_email);
  v_recipient_norm := public.normalize_email_canonical(p_recipient_email);

  PERFORM pg_catalog.pg_advisory_xact_lock(1001, pg_catalog.hashtext(p_actor_id::text));

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

  SELECT * INTO v_inv
  FROM public.loan_invitations
  WHERE loan_id        = p_loan_id
    AND recipient_role = v_expected_role
    AND status         IN ('pending', 'accepted')
  FOR UPDATE;

  SELECT * INTO v_loan FROM public.loan_items WHERE id = p_loan_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

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

  IF v_inv.id IS NOT NULL THEN
    IF v_inv.status = 'accepted' THEN
      RAISE EXCEPTION 'already_has_party';
    END IF;

    IF v_inv.expires_at <= now() THEN
      UPDATE public.loan_invitations
      SET status = 'expired', updated_at = now()
      WHERE id = v_inv.id;

    ELSIF public.normalize_email_canonical(v_inv.recipient_email_normalized) = v_recipient_norm THEN
      RETURN QUERY SELECT v_inv.id;
      RETURN;

    ELSE
      RAISE EXCEPTION 'already_has_invitation';
    END IF;
  END IF;

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
      AND public.normalize_email_canonical(recipient_email_normalized) = v_recipient_norm
      AND created_at > now() - INTERVAL '24 hours'
  ) >= 20 THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

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

      IF public.normalize_email_canonical(v_winning_email) = v_recipient_norm THEN
        v_invitation_id := v_winning_id;
      ELSE
        RAISE EXCEPTION 'already_has_invitation';
      END IF;
  END;

  RETURN QUERY SELECT v_invitation_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.add_loan_invitation(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.add_loan_invitation(uuid,uuid,text) TO service_role;

-- ── 6. get_my_pending_invitations ─────────────────────────────────────────────
-- Change from sql/32: normalize both sides of the email match.
-- Note: the expires_at > now() filter is intentionally kept. This function
-- powers the home-page badge (heim/page.tsx) for invitations reachable via
-- email link. The canonical post-expiry view is get_my_loans branch 2 (soft-ack);
-- claim_loan_invitation accepts claims regardless of email-link expiry.

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
  WHERE public.normalize_email_canonical(inv.recipient_email_normalized)
          = public.normalize_email_canonical(v_actor_email)
    AND inv.status = 'pending'
    AND inv.expires_at > now()
  ORDER BY inv.created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_pending_invitations(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_my_pending_invitations(uuid) TO service_role;

-- ── 7. get_invitation_for_claim ───────────────────────────────────────────────
-- Change from sql/32: normalize both sides of the email match.

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
    AND public.normalize_email_canonical(inv.recipient_email_normalized)
          = public.normalize_email_canonical(v_actor_email);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_invitation_for_claim(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_invitation_for_claim(uuid, uuid) TO service_role;

-- ── 8. decline_invitation ─────────────────────────────────────────────────────
-- Change from sql/32: normalize both sides of the email check.

CREATE OR REPLACE FUNCTION public.decline_invitation(
  p_actor_id      uuid,
  p_invitation_id uuid
)
RETURNS text
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_actor_email    text;
  v_actor_norm     text;
  v_recipient_norm text;
  v_inv            public.loan_invitations;
BEGIN
  SELECT au.email INTO v_actor_email FROM auth.users au WHERE au.id = p_actor_id;
  IF NOT FOUND THEN RETURN 'unauthenticated'; END IF;

  SELECT * INTO v_inv
  FROM public.loan_invitations
  WHERE id = p_invitation_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN 'not_found'; END IF;

  v_actor_norm     := public.normalize_email_canonical(v_actor_email);
  v_recipient_norm := public.normalize_email_canonical(v_inv.recipient_email_normalized);

  -- IS DISTINCT FROM is NULL-safe. NULL actor_norm guard prevents bypass
  -- if auth.users.email is unexpectedly NULL.
  IF v_actor_norm IS NULL OR v_actor_norm IS DISTINCT FROM v_recipient_norm THEN
    RETURN 'not_found';
  END IF;
  IF v_inv.status != 'pending' THEN RETURN 'not_claimable'; END IF;

  UPDATE public.loan_invitations
  SET status = 'declined', updated_at = now()
  WHERE id = p_invitation_id;

  RETURN 'ok';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.decline_invitation(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.decline_invitation(uuid, uuid) TO service_role;

COMMIT;

-- =============================================================================
-- Read-only verification queries
-- NOTE: The queries below use public.normalize_email_canonical() which is
-- created by this migration. Run them AFTER applying the migration.
-- For a standalone pre-migration check (no helper required) see the inline
-- expression at the bottom of this section.
-- =============================================================================
-- -- Post-migration: invitations whose stored email differs from canonical form:
-- SELECT id, recipient_email_normalized,
--        public.normalize_email_canonical(recipient_email_normalized) AS canonical
-- FROM public.loan_invitations
-- WHERE recipient_email_normalized
--         IS DISTINCT FROM public.normalize_email_canonical(recipient_email_normalized);
--
-- -- Post-migration: relationship rows sharing a canonical email per owner:
-- SELECT owner_id, public.normalize_email_canonical(email_canonical) AS canon_email,
--        count(*) AS row_count
-- FROM public.relationships
-- WHERE email_canonical IS NOT NULL
-- GROUP BY owner_id, public.normalize_email_canonical(email_canonical)
-- HAVING count(*) > 1;
--
-- -- Pre-migration standalone check (inline Gmail logic, no helper required):
-- SELECT id, recipient_email_normalized,
--        CASE
--          WHEN split_part(lower(trim(recipient_email_normalized)),'@',2)
--               IN ('gmail.com','googlemail.com')
--          THEN replace(split_part(lower(trim(recipient_email_normalized)),'@',1),'.','')
--               || '@gmail.com'
--          ELSE lower(trim(recipient_email_normalized))
--        END AS canonical_would_be
-- FROM public.loan_invitations
-- WHERE recipient_email_normalized IS NOT NULL
--   AND (lower(trim(recipient_email_normalized)) LIKE '%@gmail.com'
--     OR lower(trim(recipient_email_normalized)) LIKE '%@googlemail.com')
--   AND recipient_email_normalized LIKE '%.%@%';
