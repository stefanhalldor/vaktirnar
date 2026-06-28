-- Migration 63: switch_loan_role + get_loan_for_pending_recipient (#62)
--
-- switch_loan_role: Lets actual parties and pending recipients swap their
-- role (lender/borrower) on a loan. Updates loan_invitations.recipient_role
-- when an invitation exists so that claim_loan_invitation places the recipient
-- in the correct column after the switch.
--
-- get_loan_for_pending_recipient: Used by the detail page to render a
-- LoanItem-shaped row for pending recipients who are not yet in get_my_loans.
-- Returns the same columns as get_my_loans Branch 2, scoped to one loan.
--
-- Lock order in switch_loan_role (matches claim_loan_invitation to prevent deadlocks):
--   1. loan_invitations FOR UPDATE  (if a pending invitation row exists)
--   2. loan_items FOR UPDATE
--
-- Invitation lookup strategy (finding 3 from Codex v010):
--   First try to find a pending invitation whose recipient_email canonically
--   matches the actor (pending recipient case). If none, fall back to the most
--   recent pending invitation (actual party case). This ensures we lock the
--   correct invitation when the actor is a pending recipient.
--
-- pending_user_ids (finding 1 from Codex v010):
--   Returns uuid[] (all users whose canonical email matches the invitation
--   recipient email), not just one. Matches the multi-user canonical approach
--   established in SQL57/get_user_ids_by_canonical_email.
--
-- Pending recipient check: canonical email match via normalize_email_canonical,
-- same pattern as SQL60/SQL62 history access.
--
-- Data impact:
--   - Updates loan_items (lender_user_id, borrower_user_id, updated_at)
--   - Updates loan_invitations.recipient_role (if pending invitation exists)
--   - No rows deleted
--
-- Deployment:
--   1. Run this SQL on Supabase after SQL62.
--   2. Reload PostgREST schema cache: NOTIFY pgrst, 'reload schema';
--   3. Localhost testing per Codex v008 checks.
--   4. Deploy app code only after localhost testing and Stebbi approval.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.switch_loan_role(uuid, uuid);
--   DROP FUNCTION IF EXISTS public.get_loan_for_pending_recipient(uuid, uuid);

BEGIN;

-- Drop both functions before (re)creating so Postgres does not reject a return-type
-- change. switch_loan_role changed from pending_user_id uuid to pending_user_ids uuid[]
-- during review. CREATE OR REPLACE cannot change a return type on an existing function.
DROP FUNCTION IF EXISTS public.switch_loan_role(uuid, uuid);
DROP FUNCTION IF EXISTS public.get_loan_for_pending_recipient(uuid, uuid);

-- ── 1. get_loan_for_pending_recipient ─────────────────────────────────────────
-- Returns one LoanItem-shaped row for a pending recipient viewing a specific
-- loan they have not yet claimed. Access check: canonical email match against
-- a pending invitation for p_loan_id. Returns empty if no match.
--
-- Columns match get_my_loans exactly so TypeScript can cast to LoanItem.
-- requires_acknowledgement = true so LoanCard hides edit/delete/return.
-- is_creator = false, can_send_invitation = false.
-- recipient_email = NULL (actor is the recipient, they know their own email).
-- invitation_status = 'pending' (DB status; time-expired rows also appear
--   since get_my_loans Branch 2 uses the same policy).

CREATE OR REPLACE FUNCTION public.get_loan_for_pending_recipient(
  p_actor_id uuid,
  p_loan_id  uuid
)
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
LANGUAGE plpgsql STABLE
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
    false::boolean,
    false::boolean,
    true::boolean,
    NULL::text
  FROM public.loan_invitations inv
  JOIN public.loan_items li ON li.id = inv.loan_id
  LEFT JOIN public.profiles p_creator ON p_creator.id = inv.invited_by
  WHERE li.id = p_loan_id
    AND inv.status = 'pending'
    AND public.normalize_email_canonical(inv.recipient_email_normalized) = v_actor_norm
    AND (li.lender_user_id   IS DISTINCT FROM p_actor_id)
    AND (li.borrower_user_id IS DISTINCT FROM p_actor_id)
  ORDER BY inv.created_at DESC, inv.id DESC
  LIMIT 1;
END;
$$;

GRANT  EXECUTE ON FUNCTION public.get_loan_for_pending_recipient(uuid, uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.get_loan_for_pending_recipient(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ── 2. switch_loan_role ───────────────────────────────────────────────────────
-- Swaps lender/borrower for actual parties, or flips recipient_role for pending
-- recipients. Returns (status, item_name, counterpart_user_id, pending_user_ids)
-- for the server action to record events and Ólesið notifications.
--
-- status values:
--   ok            — switch completed
--   not_found     — loan or actor not found, or actor has no access
--   invalid_state — multiple pending invitations exist for the loan (ambiguous)
--
-- counterpart_user_id: the other actual party (for Ólesið notification)
-- pending_user_ids: all users whose canonical email matches the pending
--   invitation recipient (may include actor — TypeScript action skips actor)

CREATE OR REPLACE FUNCTION public.switch_loan_role(
  p_actor_id uuid,
  p_loan_id  uuid
)
RETURNS TABLE (
  status              text,
  item_name           text,
  counterpart_user_id uuid,
  pending_user_ids    uuid[]
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_actor_email          text;
  v_actor_norm           text;
  v_inv_id               uuid;
  v_inv                  public.loan_invitations;
  v_loan                 public.loan_items;
  v_actor_is_lender      boolean := false;
  v_actor_is_borrower    boolean := false;
  v_is_pending_recipient boolean := false;
  v_counterpart_id       uuid;
  v_pending_ids          uuid[];
  v_pending_count        integer;
BEGIN
  -- Verify actor exists and get canonical email
  SELECT au.email INTO v_actor_email FROM auth.users au WHERE au.id = p_actor_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::text, NULL::uuid, NULL::uuid[];
    RETURN;
  END IF;

  v_actor_norm := public.normalize_email_canonical(v_actor_email);

  -- Find the invitation to lock, preferring one that matches the actor's
  -- canonical email (pending recipient case) over the newest (actual party case).
  -- This ensures a pending recipient always locks their own invitation even if
  -- a newer invitation exists for the same loan.
  --
  -- Step 1: look for an invitation whose recipient email matches actor.
  SELECT inv.id INTO v_inv_id
  FROM public.loan_invitations inv
  WHERE inv.loan_id = p_loan_id
    AND inv.status  = 'pending'
    AND public.normalize_email_canonical(inv.recipient_email_normalized) = v_actor_norm
  ORDER BY inv.created_at DESC, inv.id DESC
  LIMIT 1;

  -- Step 2: if actor is not the pending recipient, fall back to newest pending.
  -- Guard: multiple pending invitations for the same loan would be ambiguous —
  -- we cannot safely determine which one belongs to the actual party without
  -- risking updating the wrong row. Return invalid_state so the caller knows
  -- data needs manual review rather than having the SQL guess.
  IF v_inv_id IS NULL THEN
    SELECT COUNT(*) INTO v_pending_count
    FROM public.loan_invitations inv
    WHERE inv.loan_id = p_loan_id
      AND inv.status  = 'pending';

    IF v_pending_count > 1 THEN
      RETURN QUERY SELECT 'invalid_state'::text, NULL::text, NULL::uuid, NULL::uuid[];
      RETURN;
    END IF;

    SELECT inv.id INTO v_inv_id
    FROM public.loan_invitations inv
    WHERE inv.loan_id = p_loan_id
      AND inv.status  = 'pending'
    ORDER BY inv.created_at DESC, inv.id DESC
    LIMIT 1;
  END IF;

  -- Acquire locks in order: invitation first, then loan.
  -- Matches lock order in claim_loan_invitation to prevent deadlock.
  IF v_inv_id IS NOT NULL THEN
    SELECT * INTO v_inv
    FROM public.loan_invitations
    WHERE id = v_inv_id
    FOR UPDATE;
  END IF;

  SELECT * INTO v_loan
  FROM public.loan_items
  WHERE id = p_loan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::text, NULL::uuid, NULL::uuid[];
    RETURN;
  END IF;

  -- Determine actor's relationship to this loan
  v_actor_is_lender   := (v_loan.lender_user_id   = p_actor_id);
  v_actor_is_borrower := (v_loan.borrower_user_id  = p_actor_id);

  IF NOT v_actor_is_lender AND NOT v_actor_is_borrower THEN
    -- Check if actor is pending recipient via canonical email match on locked row
    IF v_inv.id IS NOT NULL
      AND v_actor_norm IS NOT NULL
      AND public.normalize_email_canonical(v_inv.recipient_email_normalized) = v_actor_norm
    THEN
      v_is_pending_recipient := true;
    END IF;
  END IF;

  IF NOT v_actor_is_lender AND NOT v_actor_is_borrower AND NOT v_is_pending_recipient THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::text, NULL::uuid, NULL::uuid[];
    RETURN;
  END IF;

  -- Guard: if actor is an actual party and multiple pending invitations exist for
  -- this loan, the state is ambiguous even if Step 1 found an invitation matching
  -- actor's canonical email (unusual dirty-data case). Return invalid_state rather
  -- than risk updating the wrong invitation row.
  -- v_pending_count is NULL here if Step 1 found v_inv_id (Step 2 count was skipped).
  IF (v_actor_is_lender OR v_actor_is_borrower) AND v_pending_count IS NULL THEN
    SELECT COUNT(*) INTO v_pending_count
    FROM public.loan_invitations inv
    WHERE inv.loan_id = p_loan_id
      AND inv.status  = 'pending';
  END IF;

  IF (v_actor_is_lender OR v_actor_is_borrower) AND v_pending_count > 1 THEN
    RETURN QUERY SELECT 'invalid_state'::text, NULL::text, NULL::uuid, NULL::uuid[];
    RETURN;
  END IF;

  -- Perform the swap
  IF v_actor_is_lender THEN
    -- Actor moves from lender slot to borrower slot
    UPDATE public.loan_items
    SET lender_user_id   = v_loan.borrower_user_id,
        borrower_user_id = p_actor_id,
        updated_at       = now()
    WHERE id = p_loan_id;
    v_counterpart_id := v_loan.borrower_user_id;

  ELSIF v_actor_is_borrower THEN
    -- Actor moves from borrower slot to lender slot
    UPDATE public.loan_items
    SET borrower_user_id = v_loan.lender_user_id,
        lender_user_id   = p_actor_id,
        updated_at       = now()
    WHERE id = p_loan_id;
    v_counterpart_id := v_loan.lender_user_id;

  ELSE
    -- Pending recipient: no slot swap, just touch updated_at
    UPDATE public.loan_items
    SET updated_at = now()
    WHERE id = p_loan_id;
    -- Counterpart is whoever holds the actual party slot
    v_counterpart_id := COALESCE(v_loan.lender_user_id, v_loan.borrower_user_id);
  END IF;

  -- Flip recipient_role in the pending invitation.
  -- Also look up all users whose canonical email matches, for notifications.
  IF v_inv.id IS NOT NULL THEN
    UPDATE public.loan_invitations
    SET recipient_role = CASE
          WHEN v_inv.recipient_role = 'lender' THEN 'borrower'::text
          ELSE 'lender'::text
        END,
        updated_at = now()
    WHERE id = v_inv.id;

    -- Collect all canonical-matching user ids for Ólesið notifications.
    -- Uses ARRAY() subquery to avoid DISTINCT+ORDER BY aggregate restriction.
    -- Never returns email addresses — only UUIDs.
    SELECT ARRAY(
      SELECT au.id
      FROM auth.users au
      WHERE public.normalize_email_canonical(au.email)
              = public.normalize_email_canonical(v_inv.recipient_email_normalized)
      ORDER BY au.created_at ASC, au.id ASC
    )
    INTO v_pending_ids;
  END IF;

  RETURN QUERY SELECT 'ok'::text, v_loan.item_name, v_counterpart_id, v_pending_ids;
END;
$$;

GRANT  EXECUTE ON FUNCTION public.switch_loan_role(uuid, uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.switch_loan_role(uuid, uuid) FROM PUBLIC, anon, authenticated;

COMMIT;
