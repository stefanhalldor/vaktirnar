-- Teskeið / Lánað og skilað: creator-private name-only counterparties.
-- Written for review and manual execution only. Codex did not run this SQL.
--
-- Data impact:
--   * adds one nullable column; existing rows remain NULL;
--   * no backfill and no destructive data rewrite;
--   * a later email invitation clears the private name atomically.
-- Security:
--   * no browser table or function grants;
--   * name is projected only to loan_items.created_by through get_my_loans;
--   * pending/accepted recipients never receive the creator-private label.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.loan_items') IS NULL
     OR to_regclass('public.loan_invitations') IS NULL THEN
    RAISE EXCEPTION 'loan prerequisites missing';
  END IF;
  IF to_regprocedure('public.create_loan(uuid,text,text,date,date,text,text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'required create_loan signature missing';
  END IF;
  IF to_regprocedure('public.get_my_loans(uuid)') IS NULL THEN
    RAISE EXCEPTION 'required get_my_loans signature missing';
  END IF;
END;
$$;

ALTER TABLE public.loan_items
  ADD COLUMN IF NOT EXISTS creator_counterparty_name text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.loan_items'::regclass
      AND conname = 'loan_items_creator_counterparty_name_check'
  ) THEN
    ALTER TABLE public.loan_items
      ADD CONSTRAINT loan_items_creator_counterparty_name_check
      CHECK (
        creator_counterparty_name IS NULL
        OR (
          creator_counterparty_name = btrim(creator_counterparty_name)
          AND char_length(creator_counterparty_name) BETWEEN 1 AND 120
        )
      );
  END IF;
END;
$$;

-- Atomic wrapper for the name-only create path. Existing create_loan callers
-- and its email invitation behavior keep their exact signature and contract.
CREATE OR REPLACE FUNCTION public.create_loan_with_counterparty_name(
  p_actor_id          uuid,
  p_item_name         text,
  p_note              text,
  p_loaned_at         date,
  p_due_at            date,
  p_creator_role      text,
  p_counterparty_name text,
  p_request_id        uuid
)
RETURNS TABLE (loan_id uuid, invitation_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_name       text;
  v_loan_id    uuid;
  v_invite_id  uuid;
  v_existing   text;
BEGIN
  v_name := btrim(p_counterparty_name);
  IF v_name IS NULL OR char_length(v_name) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'invalid_counterparty_name';
  END IF;

  SELECT created.loan_id, created.invitation_id
  INTO v_loan_id, v_invite_id
  FROM public.create_loan(
    p_actor_id,
    p_item_name,
    p_note,
    p_loaned_at,
    p_due_at,
    p_creator_role,
    NULL,
    p_request_id
  ) AS created;

  IF v_loan_id IS NULL OR v_invite_id IS NOT NULL THEN
    RAISE EXCEPTION 'idempotency_conflict';
  END IF;

  SELECT li.creator_counterparty_name
  INTO v_existing
  FROM public.loan_items li
  WHERE li.id = v_loan_id
    AND li.created_by = p_actor_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  IF v_existing IS NOT NULL AND v_existing IS DISTINCT FROM v_name THEN
    RAISE EXCEPTION 'idempotency_conflict';
  END IF;

  UPDATE public.loan_items
  SET creator_counterparty_name = v_name
  WHERE id = v_loan_id;

  RETURN QUERY SELECT v_loan_id, NULL::uuid;
END;
$$;

REVOKE ALL ON FUNCTION public.create_loan_with_counterparty_name(uuid,text,text,date,date,text,text,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_loan_with_counterparty_name(uuid,text,text,date,date,text,text,uuid)
  TO service_role;

-- Adds or replaces a private name only while the creator still owns a vacant
-- counterparty slot and no active invitation/party exists.
CREATE OR REPLACE FUNCTION public.set_loan_counterparty_name(
  p_actor_id          uuid,
  p_loan_id           uuid,
  p_counterparty_name text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_name text;
  v_loan public.loan_items;
BEGIN
  v_name := btrim(p_counterparty_name);
  IF v_name IS NULL OR char_length(v_name) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'invalid_counterparty_name';
  END IF;

  SELECT * INTO v_loan
  FROM public.loan_items
  WHERE id = p_loan_id
  FOR UPDATE;

  IF NOT FOUND OR v_loan.created_by IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  IF (v_loan.lender_user_id = p_actor_id AND v_loan.borrower_user_id IS NOT NULL)
     OR (v_loan.borrower_user_id = p_actor_id AND v_loan.lender_user_id IS NOT NULL)
     OR (v_loan.lender_user_id IS DISTINCT FROM p_actor_id
         AND v_loan.borrower_user_id IS DISTINCT FROM p_actor_id) THEN
    RAISE EXCEPTION 'already_has_party';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.loan_invitations invitation
    WHERE invitation.loan_id = p_loan_id
      AND invitation.status IN ('pending', 'accepted')
  ) THEN
    RAISE EXCEPTION 'already_has_invitation';
  END IF;

  UPDATE public.loan_items
  SET creator_counterparty_name = v_name
  WHERE id = p_loan_id;

  RETURN 'ok';
END;
$$;

REVOKE ALL ON FUNCTION public.set_loan_counterparty_name(uuid,uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_loan_counterparty_name(uuid,uuid,text)
  TO service_role;

-- Any real invitation supersedes the creator-private placeholder name.
CREATE OR REPLACE FUNCTION public.loan_clear_private_counterparty_name_on_invitation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  UPDATE public.loan_items
  SET creator_counterparty_name = NULL
  WHERE id = NEW.loan_id
    AND creator_counterparty_name IS NOT NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS loan_clear_private_counterparty_name_on_invitation
  ON public.loan_invitations;
CREATE TRIGGER loan_clear_private_counterparty_name_on_invitation
  AFTER INSERT ON public.loan_invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.loan_clear_private_counterparty_name_on_invitation();

REVOKE ALL ON FUNCTION public.loan_clear_private_counterparty_name_on_invitation()
  FROM PUBLIC, anon, authenticated;

-- Recreate the existing projection with one creator-only fallback. The raw
-- private column is never returned and the pending-recipient branch is intact.
DROP FUNCTION public.get_my_loans(uuid);

CREATE FUNCTION public.get_my_loans(p_actor_id uuid)
RETURNS TABLE (
  id uuid,
  item_name text,
  note text,
  loaned_at date,
  due_at date,
  returned_at timestamptz,
  my_role text,
  other_display_name text,
  invitation_id uuid,
  invitation_status text,
  invitation_attempt_status text,
  can_send_invitation boolean,
  is_creator boolean,
  requires_acknowledgement boolean,
  recipient_email text
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_actor_email text;
  v_actor_norm text;
BEGIN
  SELECT users.email INTO v_actor_email
  FROM auth.users users
  WHERE users.id = p_actor_id;
  IF NOT FOUND THEN RETURN; END IF;
  v_actor_norm := public.normalize_email_canonical(v_actor_email);

  RETURN QUERY
  SELECT
    item.id,
    item.item_name,
    item.note,
    item.loaned_at,
    item.due_at,
    item.returned_at,
    CASE WHEN item.lender_user_id = p_actor_id THEN 'lender'::text ELSE 'borrower'::text END,
    CASE
      WHEN item.lender_user_id = p_actor_id THEN
        COALESCE(borrower.display_name,
          CASE WHEN item.created_by = p_actor_id THEN item.creator_counterparty_name END)
      ELSE
        COALESCE(lender.display_name,
          CASE WHEN item.created_by = p_actor_id THEN item.creator_counterparty_name END)
    END,
    invitation.id,
    CASE
      WHEN invitation.status = 'pending' AND invitation.expires_at <= now() THEN 'expired'::text
      ELSE invitation.status
    END,
    invitation.attempt_status,
    (
      invitation.id IS NOT NULL
      AND invitation.status = 'pending'
      AND invitation.expires_at > now()
      AND invitation.invited_by = p_actor_id
      AND invitation.attempt_number < 3
      AND (
        invitation.attempt_status IS NULL
        OR (invitation.attempt_status = 'failed'
            AND invitation.attempt_at < now() - INTERVAL '5 minutes')
        OR (invitation.attempt_status = 'reserved'
            AND invitation.attempt_at >= now() - INTERVAL '24 hours')
      )
    ),
    item.created_by = p_actor_id,
    false,
    CASE WHEN item.created_by = p_actor_id
      THEN invitation.recipient_email_normalized ELSE NULL::text END
  FROM public.loan_items item
  LEFT JOIN public.profiles lender ON lender.id = item.lender_user_id
  LEFT JOIN public.profiles borrower ON borrower.id = item.borrower_user_id
  LEFT JOIN LATERAL (
    SELECT candidate.*
    FROM public.loan_invitations candidate
    WHERE candidate.loan_id = item.id
    ORDER BY candidate.created_at DESC, candidate.id DESC
    LIMIT 1
  ) invitation ON true
  WHERE item.lender_user_id = p_actor_id
     OR item.borrower_user_id = p_actor_id

  UNION ALL

  SELECT
    item.id,
    item.item_name,
    item.note,
    item.loaned_at,
    item.due_at,
    item.returned_at,
    invitation.recipient_role::text,
    creator.display_name,
    invitation.id,
    'pending'::text,
    invitation.attempt_status,
    false,
    false,
    true,
    NULL::text
  FROM public.loan_invitations invitation
  JOIN public.loan_items item ON item.id = invitation.loan_id
  LEFT JOIN public.profiles creator ON creator.id = invitation.invited_by
  WHERE public.normalize_email_canonical(invitation.recipient_email_normalized) = v_actor_norm
    AND invitation.status = 'pending'
    AND item.lender_user_id IS DISTINCT FROM p_actor_id
    AND item.borrower_user_id IS DISTINCT FROM p_actor_id

  ORDER BY loaned_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_loans(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_loans(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Recovery (manual, only after reviewing data):
-- 1. Drop the two new RPCs and invitation trigger/function.
-- 2. Restore get_my_loans from sql/56_normalize_email_canonical.sql.
-- 3. Drop the constraint and column only if no private names must be retained.
