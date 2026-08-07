-- TODO #95 / SQL114: audited rename of an unregistered canonical UL member.
--
-- This migration never changes expense shares, payments, obligations,
-- repayments or financial_version. It adds a bounded, immutable name-change
-- audit and one manager-only service-role RPC. Stebbi alone runs it after the
-- read-only preflight is green.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $preflight$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.expense_groups') IS NULL THEN v_missing := array_append(v_missing, 'expense_groups'); END IF;
  IF to_regclass('public.expense_group_members') IS NULL THEN v_missing := array_append(v_missing, 'expense_group_members'); END IF;
  IF to_regclass('public.expenses') IS NULL THEN v_missing := array_append(v_missing, 'expenses'); END IF;
  IF to_regclass('public.expense_shares') IS NULL THEN v_missing := array_append(v_missing, 'expense_shares'); END IF;
  IF to_regclass('public.expense_activity') IS NULL THEN v_missing := array_append(v_missing, 'expense_activity'); END IF;
  IF to_regclass('public.expense_member_invitations') IS NULL THEN v_missing := array_append(v_missing, 'expense_member_invitations'); END IF;
  IF to_regclass('public.expense_share_collaborators') IS NULL THEN v_missing := array_append(v_missing, 'expense_share_collaborators'); END IF;
  IF to_regprocedure('public.expense_assert_beta_actor(uuid)') IS NULL THEN v_missing := array_append(v_missing, 'expense_assert_beta_actor'); END IF;
  IF to_regprocedure('public.expense_begin_request(uuid,uuid,text,text)') IS NULL THEN v_missing := array_append(v_missing, 'expense_begin_request'); END IF;
  IF to_regprocedure('public.expense_finish_request(uuid,uuid,jsonb)') IS NULL THEN v_missing := array_append(v_missing, 'expense_finish_request'); END IF;
  IF to_regprocedure('public.expense_active_member_role(uuid,uuid)') IS NULL THEN v_missing := array_append(v_missing, 'expense_active_member_role'); END IF;
  IF to_regprocedure('public.expense_record_activity(uuid,uuid,text,text,uuid,text,text,text,uuid[],boolean)') IS NULL THEN v_missing := array_append(v_missing, 'expense_record_activity'); END IF;
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'sql114_missing_prerequisites:%', array_to_string(v_missing, ',');
  END IF;
END;
$preflight$;

CREATE TABLE IF NOT EXISTS public.expense_member_name_revisions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id      uuid        NOT NULL UNIQUE
    REFERENCES public.expense_activity(id) ON DELETE RESTRICT,
  group_id         uuid        NOT NULL,
  expense_id       uuid        NOT NULL,
  member_id        uuid        NOT NULL,
  old_display_name text        NOT NULL,
  new_display_name text        NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT expense_member_name_revisions_group_expense_fk
    FOREIGN KEY (group_id, expense_id)
    REFERENCES public.expenses(group_id, id) ON DELETE RESTRICT,
  CONSTRAINT expense_member_name_revisions_group_member_fk
    FOREIGN KEY (group_id, member_id)
    REFERENCES public.expense_group_members(group_id, id) ON DELETE RESTRICT,
  CONSTRAINT expense_member_name_revisions_names_check CHECK (
    char_length(btrim(old_display_name)) BETWEEN 1 AND 120
    AND char_length(btrim(new_display_name)) BETWEEN 1 AND 120
    AND old_display_name = btrim(old_display_name)
    AND new_display_name = btrim(new_display_name)
    AND old_display_name <> new_display_name
  )
);

DO $target_shape$
BEGIN
  IF (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'expense_member_name_revisions') <> 8
     OR (SELECT count(*) FROM pg_catalog.pg_constraint
       WHERE conrelid = 'public.expense_member_name_revisions'::regclass) <> 6 THEN
    RAISE EXCEPTION 'sql114_incompatible_target_shape';
  END IF;
END;
$target_shape$;

CREATE INDEX IF NOT EXISTS expense_member_name_revisions_group_created_idx
  ON public.expense_member_name_revisions (group_id, created_at DESC);

ALTER TABLE public.expense_member_name_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_member_name_revisions FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.expense_member_name_revision_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'expense_member_name_revision_immutable';
END;
$$;

DROP TRIGGER IF EXISTS expense_member_name_revisions_immutable_guard
  ON public.expense_member_name_revisions;
CREATE TRIGGER expense_member_name_revisions_immutable_guard
BEFORE UPDATE OR DELETE ON public.expense_member_name_revisions
FOR EACH ROW EXECUTE FUNCTION public.expense_member_name_revision_immutable();

-- The event is private group activity and is intentionally not projected to
-- recent_events. Old and new names live only in the default-deny audit table.
ALTER TABLE public.expense_activity
  DROP CONSTRAINT IF EXISTS expense_activity_event_entity_check;
ALTER TABLE public.expense_activity
  DROP CONSTRAINT IF EXISTS expense_activity_entity_type_check;
ALTER TABLE public.expense_activity
  DROP CONSTRAINT IF EXISTS expense_activity_event_type_check;

ALTER TABLE public.expense_activity
  ADD CONSTRAINT expense_activity_event_type_check CHECK (event_type IN (
    'expense_created', 'expense_updated', 'expense_cancelled',
    'expense_group_member_added', 'expense_group_member_removed',
    'expense_group_member_renamed',
    'expense_group_invitation_received', 'expense_group_invitation_accepted',
    'expense_group_invitation_declined', 'expense_group_member_left',
    'expense_group_settling', 'expense_group_settled',
    'expense_repayment_reported', 'expense_repayment_confirmed',
    'expense_repayment_rejected', 'expense_repayment_cancelled',
    'expense_member_invitation_received', 'expense_member_invitation_accepted',
    'expense_member_invitation_declined', 'expense_member_invitation_cancelled',
    'expense_payment_preference_saved', 'expense_payment_preference_deactivated',
    'expense_share_collaborator_added', 'expense_share_collaborator_linked',
    'expense_share_collaborator_removed'
  ));

ALTER TABLE public.expense_activity
  ADD CONSTRAINT expense_activity_entity_type_check CHECK (entity_type IN (
    'expense', 'expense_group', 'expense_group_invitation',
    'expense_member_invitation', 'expense_repayment', 'payment_preference'
  ));

ALTER TABLE public.expense_activity
  ADD CONSTRAINT expense_activity_event_entity_check CHECK (
    (event_type IN (
        'expense_created', 'expense_updated', 'expense_cancelled',
        'expense_group_member_renamed',
        'expense_share_collaborator_added', 'expense_share_collaborator_linked',
        'expense_share_collaborator_removed'
      )
      AND entity_type = 'expense' AND group_id IS NOT NULL AND expense_title IS NOT NULL)
    OR (event_type = 'expense_group_invitation_received'
      AND entity_type = 'expense_group_invitation'
      AND group_id IS NOT NULL AND entity_id = group_id AND group_title IS NOT NULL)
    OR (event_type IN (
        'expense_group_member_added', 'expense_group_member_removed',
        'expense_group_invitation_accepted', 'expense_group_invitation_declined',
        'expense_group_member_left', 'expense_group_settling', 'expense_group_settled'
      )
      AND entity_type = 'expense_group'
      AND group_id IS NOT NULL AND entity_id = group_id AND group_title IS NOT NULL)
    OR (event_type IN (
        'expense_member_invitation_received', 'expense_member_invitation_accepted',
        'expense_member_invitation_declined', 'expense_member_invitation_cancelled'
      )
      AND entity_type = 'expense_member_invitation'
      AND group_id IS NOT NULL AND group_title IS NOT NULL)
    OR (event_type IN (
        'expense_repayment_reported', 'expense_repayment_confirmed',
        'expense_repayment_rejected', 'expense_repayment_cancelled'
      )
      AND entity_type = 'expense_repayment' AND group_id IS NOT NULL
      AND (expense_title IS NOT NULL OR group_title IS NOT NULL))
    OR (event_type IN (
        'expense_payment_preference_saved', 'expense_payment_preference_deactivated'
      )
      AND entity_type = 'payment_preference' AND group_id IS NULL
      AND expense_title IS NULL AND group_title IS NULL)
  );

CREATE OR REPLACE FUNCTION public.expense_rename_guest_member(
  p_actor_id uuid,
  p_group_id uuid,
  p_member_id uuid,
  p_display_name text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group public.expense_groups%ROWTYPE;
  v_expense public.expenses%ROWTYPE;
  v_member public.expense_group_members%ROWTYPE;
  v_role text;
  v_display_name text := btrim(p_display_name);
  v_fingerprint text;
  v_replay jsonb;
  v_activity_id uuid;
  v_result jsonb;
BEGIN
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  IF p_actor_id IS NULL OR p_group_id IS NULL OR p_member_id IS NULL
     OR p_display_name IS NULL
     OR p_request_id IS NULL
     OR char_length(v_display_name) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'expense_invalid_input';
  END IF;

  v_fingerprint := md5(jsonb_build_object(
    'groupId', p_group_id,
    'memberId', p_member_id,
    'displayName', v_display_name
  )::text);
  v_replay := public.expense_begin_request(
    p_actor_id, p_request_id, 'expense_rename_guest_member', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  SELECT group_row.* INTO v_group
  FROM public.expense_groups AS group_row
  WHERE group_row.id = p_group_id
  FOR UPDATE;

  SELECT expense.* INTO v_expense
  FROM public.expenses AS expense
  JOIN public.expense_shares AS share_row
    ON share_row.expense_id = expense.id
   AND share_row.member_id = p_member_id
  WHERE expense.group_id = p_group_id
    AND expense.status = 'active'
  ORDER BY expense.created_at DESC
  LIMIT 1
  FOR UPDATE OF expense;

  SELECT member.* INTO v_member
  FROM public.expense_group_members AS member
  WHERE member.group_id = p_group_id
    AND member.id = p_member_id
  FOR UPDATE;

  v_role := public.expense_active_member_role(p_actor_id, p_group_id);
  IF v_group.id IS NULL OR v_group.kind <> 'one_off'
     OR v_group.status NOT IN ('active', 'settling', 'settled')
     OR coalesce(v_role, '') NOT IN ('owner', 'admin')
     OR v_expense.id IS NULL
     OR EXISTS (
       SELECT 1 FROM public.expenses AS other_expense
       WHERE other_expense.group_id = p_group_id
         AND other_expense.status = 'active'
         AND other_expense.id <> v_expense.id
     )
     OR v_member.id IS NULL OR v_member.status <> 'active'
     OR v_member.user_id IS NOT NULL THEN
    RAISE EXCEPTION 'expense_guest_member_rename_not_allowed';
  END IF;

  IF v_member.display_name = v_display_name THEN
    v_result := jsonb_build_object(
      'group_id', p_group_id,
      'expense_id', v_expense.id,
      'member_id', p_member_id,
      'display_name', v_display_name,
      'changed', false
    );
    PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
    RETURN v_result;
  END IF;

  UPDATE public.expense_group_members AS member
  SET display_name = v_display_name
  WHERE member.group_id = p_group_id
    AND member.id = p_member_id
    AND member.user_id IS NULL
    AND member.status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'expense_guest_member_rename_conflict'; END IF;

  -- A pending consent invitation must retain the corrected private guest
  -- label. The recipient email and invitation scope are never changed here.
  UPDATE public.expense_member_invitations AS invitation
  SET guest_display_name_snapshot = v_display_name
  WHERE invitation.group_id = p_group_id
    AND invitation.member_id = p_member_id
    AND invitation.status = 'pending';

  v_activity_id := public.expense_record_activity(
    p_group_id, p_actor_id, 'expense_group_member_renamed',
    'expense', v_expense.id, 'expense_group_member_renamed',
    v_expense.title, NULL, ARRAY[]::uuid[], false
  );

  INSERT INTO public.expense_member_name_revisions (
    activity_id, group_id, expense_id, member_id,
    old_display_name, new_display_name
  ) VALUES (
    v_activity_id, p_group_id, v_expense.id, p_member_id,
    v_member.display_name, v_display_name
  );

  v_result := jsonb_build_object(
    'group_id', p_group_id,
    'expense_id', v_expense.id,
    'member_id', p_member_id,
    'display_name', v_display_name,
    'changed', true,
    'activity_id', v_activity_id
  );
  PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;

REVOKE ALL ON TABLE public.expense_member_name_revisions
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.expense_member_name_revisions TO service_role;

REVOKE ALL ON FUNCTION public.expense_member_name_revision_immutable()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_rename_guest_member(uuid, uuid, uuid, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expense_rename_guest_member(uuid, uuid, uuid, text, uuid)
  TO service_role;

COMMENT ON TABLE public.expense_member_name_revisions IS
  'Immutable bounded before/after audit for manager renames of canonical unregistered UL members.';
COMMENT ON FUNCTION public.expense_rename_guest_member(uuid, uuid, uuid, text, uuid) IS
  'Manager-only idempotent guest rename; never mutates the financial ledger or financial_version.';

COMMIT;
