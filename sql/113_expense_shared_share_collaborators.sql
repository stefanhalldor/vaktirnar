-- TODO #95 / SQL113: multiple authorized people behind one canonical UL share.
--
-- The canonical expense_shares/member_id remains the only financial party.
-- This migration adds identity actors only; it performs no backfill and never
-- inserts, updates or deletes shares, payments, obligations or repayments.
-- Stebbi alone runs this migration after the read-only preflight is green.

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
  IF to_regclass('public.expense_member_invitations') IS NULL THEN v_missing := array_append(v_missing, 'expense_member_invitations'); END IF;
  IF to_regprocedure('public.expense_assert_beta_actor(uuid)') IS NULL THEN v_missing := array_append(v_missing, 'expense_assert_beta_actor'); END IF;
  IF to_regprocedure('public.expense_begin_request(uuid,uuid,text,text)') IS NULL THEN v_missing := array_append(v_missing, 'expense_begin_request'); END IF;
  IF to_regprocedure('public.expense_finish_request(uuid,uuid,jsonb)') IS NULL THEN v_missing := array_append(v_missing, 'expense_finish_request'); END IF;
  IF to_regprocedure('public.expense_active_member_role(uuid,uuid)') IS NULL THEN v_missing := array_append(v_missing, 'expense_active_member_role'); END IF;
  IF to_regprocedure('public.expense_create_unified_participant_invitation(uuid,uuid,uuid,text,uuid,text)') IS NULL THEN v_missing := array_append(v_missing, 'expense_create_unified_participant_invitation'); END IF;
  IF to_regprocedure('public.expense_record_activity(uuid,uuid,text,text,uuid,text,text,text,uuid[],boolean)') IS NULL THEN v_missing := array_append(v_missing, 'expense_record_activity'); END IF;
  IF to_regprocedure('public.expense_report_repayment(uuid,uuid,uuid,uuid,bigint,bigint,text,date,text,uuid)') IS NULL THEN v_missing := array_append(v_missing, 'expense_report_repayment'); END IF;
  IF to_regprocedure('public.expense_record_received_repayment(uuid,uuid,uuid,uuid,bigint,bigint,text,date,text,uuid)') IS NULL THEN v_missing := array_append(v_missing, 'expense_record_received_repayment'); END IF;
  IF to_regprocedure('public.expense_transition_repayment(uuid,uuid,text,uuid)') IS NULL THEN v_missing := array_append(v_missing, 'expense_transition_repayment'); END IF;
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'sql113_missing_prerequisites:%', array_to_string(v_missing, ',');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = 'public.expense_member_invitations'::regclass
      AND constraint_row.conname = 'expense_member_invitations_template_check'
      AND pg_catalog.pg_get_constraintdef(constraint_row.oid) LIKE '%v3%'
  ) THEN
    RAISE EXCEPTION 'sql113_requires_sql112_email_v3';
  END IF;
END;
$preflight$;

CREATE TABLE IF NOT EXISTS public.expense_share_collaborators (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id               uuid        NOT NULL,
  expense_id             uuid        NOT NULL,
  share_member_id        uuid        NOT NULL,
  collaborator_member_id uuid        NOT NULL,
  status                 text        NOT NULL DEFAULT 'active',
  created_by             uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  removed_by             uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  removed_at             timestamptz NULL,

  CONSTRAINT expense_share_collaborators_status_check
    CHECK (status IN ('active', 'removed')),
  CONSTRAINT expense_share_collaborators_distinct_members_check
    CHECK (share_member_id <> collaborator_member_id),
  CONSTRAINT expense_share_collaborators_lifecycle_check
    CHECK (
      (status = 'active' AND removed_at IS NULL AND removed_by IS NULL)
      OR (status = 'removed' AND removed_at IS NOT NULL)
    ),
  CONSTRAINT expense_share_collaborators_group_expense_fk
    FOREIGN KEY (group_id, expense_id)
    REFERENCES public.expenses(group_id, id) ON DELETE RESTRICT,
  CONSTRAINT expense_share_collaborators_group_share_member_fk
    FOREIGN KEY (group_id, share_member_id)
    REFERENCES public.expense_group_members(group_id, id) ON DELETE RESTRICT,
  CONSTRAINT expense_share_collaborators_group_actor_member_fk
    FOREIGN KEY (group_id, collaborator_member_id)
    REFERENCES public.expense_group_members(group_id, id) ON DELETE RESTRICT,
  CONSTRAINT expense_share_collaborators_expense_share_fk
    FOREIGN KEY (expense_id, share_member_id)
    REFERENCES public.expense_shares(expense_id, member_id) ON DELETE RESTRICT
);

DO $target_shape$
BEGIN
  IF (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'expense_share_collaborators'
        AND column_name IN (
          'id', 'group_id', 'expense_id', 'share_member_id',
          'collaborator_member_id', 'status', 'created_by', 'removed_by',
          'created_at', 'removed_at'
        )) <> 10
     OR EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'expense_share_collaborators'
         AND column_name IN ('amount_minor', 'currency', 'percentage', 'shares')
     )
     OR (SELECT count(*) FROM pg_constraint
       WHERE conrelid = 'public.expense_share_collaborators'::regclass
         AND conname IN (
           'expense_share_collaborators_status_check',
           'expense_share_collaborators_distinct_members_check',
           'expense_share_collaborators_lifecycle_check',
           'expense_share_collaborators_group_expense_fk',
           'expense_share_collaborators_group_share_member_fk',
           'expense_share_collaborators_group_actor_member_fk',
           'expense_share_collaborators_expense_share_fk'
         )) <> 7 THEN
    RAISE EXCEPTION 'sql113_incompatible_target_shape';
  END IF;
END;
$target_shape$;

CREATE UNIQUE INDEX IF NOT EXISTS expense_share_collaborators_active_actor_unique
  ON public.expense_share_collaborators (expense_id, collaborator_member_id)
  WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS expense_share_collaborators_active_pair_unique
  ON public.expense_share_collaborators (expense_id, share_member_id, collaborator_member_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS expense_share_collaborators_share_idx
  ON public.expense_share_collaborators (expense_id, share_member_id, created_at)
  WHERE status = 'active';

ALTER TABLE public.expense_share_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_share_collaborators FORCE ROW LEVEL SECURITY;

ALTER TABLE public.expense_member_invitations
  ADD COLUMN IF NOT EXISTS shared_expense_id uuid NULL,
  ADD COLUMN IF NOT EXISTS shared_share_member_id uuid NULL;

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.expense_member_invitations'::regclass
      AND conname = 'expense_member_invitations_shared_scope_check'
  ) THEN
    ALTER TABLE public.expense_member_invitations
      ADD CONSTRAINT expense_member_invitations_shared_scope_check
      CHECK ((shared_expense_id IS NULL) = (shared_share_member_id IS NULL));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.expense_member_invitations'::regclass
      AND conname = 'expense_member_invitations_shared_expense_fk'
  ) THEN
    ALTER TABLE public.expense_member_invitations
      ADD CONSTRAINT expense_member_invitations_shared_expense_fk
      FOREIGN KEY (group_id, shared_expense_id)
      REFERENCES public.expenses(group_id, id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.expense_member_invitations'::regclass
      AND conname = 'expense_member_invitations_shared_share_fk'
  ) THEN
    ALTER TABLE public.expense_member_invitations
      ADD CONSTRAINT expense_member_invitations_shared_share_fk
      FOREIGN KEY (shared_expense_id, shared_share_member_id)
      REFERENCES public.expense_shares(expense_id, member_id) ON DELETE RESTRICT;
  END IF;
END;
$constraints$;

CREATE INDEX IF NOT EXISTS expense_member_invitations_shared_scope_idx
  ON public.expense_member_invitations (shared_expense_id, shared_share_member_id)
  WHERE shared_expense_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.expense_guard_share_collaborator_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'expense_share_collaborator_immutable';
  END IF;
  IF OLD.id <> NEW.id
     OR OLD.group_id <> NEW.group_id
     OR OLD.expense_id <> NEW.expense_id
     OR OLD.share_member_id <> NEW.share_member_id
     OR OLD.collaborator_member_id <> NEW.collaborator_member_id
     OR OLD.created_by IS DISTINCT FROM NEW.created_by
     OR OLD.created_at <> NEW.created_at
     OR OLD.status <> 'active'
     OR NEW.status <> 'removed'
     OR NEW.removed_at IS NULL THEN
    RAISE EXCEPTION 'expense_share_collaborator_immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS expense_share_collaborators_immutable_guard
  ON public.expense_share_collaborators;
CREATE TRIGGER expense_share_collaborators_immutable_guard
BEFORE UPDATE OR DELETE ON public.expense_share_collaborators
FOR EACH ROW EXECUTE FUNCTION public.expense_guard_share_collaborator_mutation();

-- Add bounded, non-financial audit events. They deliberately carry neither
-- names/emails nor amounts and are not projected into public recent_events.
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

CREATE OR REPLACE FUNCTION public.expense_actor_can_act_for_share_member(
  p_actor_id uuid,
  p_group_id uuid,
  p_member_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_actor_id IS NOT NULL
    AND public.expense_has_beta_access(p_actor_id)
    AND (
      EXISTS (
        SELECT 1
        FROM public.expense_group_members AS member
        WHERE member.group_id = p_group_id
          AND member.id = p_member_id
          AND member.status = 'active'
          AND member.user_id = p_actor_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.expense_share_collaborators AS collaboration
        JOIN public.expense_group_members AS actor_member
          ON actor_member.group_id = collaboration.group_id
         AND actor_member.id = collaboration.collaborator_member_id
         AND actor_member.status = 'active'
         AND actor_member.user_id = p_actor_id
        JOIN public.expenses AS expense
          ON expense.group_id = collaboration.group_id
         AND expense.id = collaboration.expense_id
         AND expense.status = 'active'
        JOIN public.expense_shares AS share_row
          ON share_row.expense_id = collaboration.expense_id
         AND share_row.member_id = collaboration.share_member_id
        WHERE collaboration.group_id = p_group_id
          AND collaboration.share_member_id = p_member_id
          AND collaboration.status = 'active'
          AND NOT EXISTS (
            SELECT 1
            FROM public.expenses AS other_expense
            WHERE other_expense.group_id = collaboration.group_id
              AND other_expense.status = 'active'
              AND other_expense.id <> collaboration.expense_id
          )
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.expense_add_share_collaborator(
  p_actor_id uuid,
  p_group_id uuid,
  p_expense_id uuid,
  p_share_member_id uuid,
  p_request_id uuid,
  p_member jsonb,
  p_recipient_email text DEFAULT NULL,
  p_relationship_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group public.expense_groups%ROWTYPE;
  v_expense public.expenses%ROWTYPE;
  v_member_id uuid;
  v_display_name text;
  v_role text;
  v_target_email text;
  v_target_user_id uuid;
  v_collaboration_id uuid := gen_random_uuid();
  v_invitation_id uuid;
  v_fingerprint text;
  v_replay jsonb;
  v_result jsonb;
BEGIN
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  IF p_actor_id IS NULL OR p_group_id IS NULL OR p_expense_id IS NULL
     OR p_share_member_id IS NULL OR p_request_id IS NULL
     OR jsonb_typeof(p_member) <> 'object'
     OR NOT (p_member ?& ARRAY['id', 'display_name'])
     OR EXISTS (
       SELECT 1 FROM jsonb_object_keys(p_member) AS key_name
       WHERE key_name NOT IN ('id', 'display_name')
     )
     OR (p_recipient_email IS NOT NULL AND p_relationship_id IS NOT NULL) THEN
    RAISE EXCEPTION 'expense_invalid_input';
  END IF;
  BEGIN
    v_member_id := (p_member->>'id')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'expense_invalid_input';
  END;
  v_display_name := btrim(p_member->>'display_name');
  IF v_member_id IS NULL OR char_length(v_display_name) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'expense_invalid_input';
  END IF;

  v_fingerprint := md5(jsonb_build_object(
    'groupId', p_group_id,
    'expenseId', p_expense_id,
    'shareMemberId', p_share_member_id,
    'member', p_member,
    'recipientEmail', public.normalize_email_canonical(p_recipient_email),
    'relationshipId', p_relationship_id
  )::text);
  v_replay := public.expense_begin_request(
    p_actor_id, p_request_id, 'expense_add_share_collaborator', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  SELECT group_row.* INTO v_group
  FROM public.expense_groups AS group_row
  WHERE group_row.id = p_group_id
  FOR UPDATE;
  SELECT expense.* INTO v_expense
  FROM public.expenses AS expense
  WHERE expense.group_id = p_group_id AND expense.id = p_expense_id
  FOR UPDATE;
  v_role := public.expense_active_member_role(p_actor_id, p_group_id);
  IF v_group.id IS NULL OR v_group.kind <> 'one_off'
     OR v_group.status NOT IN ('active', 'settling', 'settled')
     OR coalesce(v_role, '') NOT IN ('owner', 'admin')
     OR v_expense.id IS NULL OR v_expense.status <> 'active'
     OR EXISTS (
       SELECT 1 FROM public.expenses AS other_expense
       WHERE other_expense.group_id = p_group_id
         AND other_expense.status = 'active'
         AND other_expense.id <> p_expense_id
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.expense_shares AS share_row
       WHERE share_row.expense_id = p_expense_id
         AND share_row.member_id = p_share_member_id
     ) THEN
    RAISE EXCEPTION 'expense_share_collaborator_not_allowed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.expense_group_members AS member
    WHERE member.id = v_member_id
  ) OR (
    SELECT count(*) FROM public.expense_group_members AS member
    WHERE member.group_id = p_group_id
      AND member.status IN ('active', 'invited')
  ) >= 50 THEN
    RAISE EXCEPTION 'expense_share_actor_conflict';
  END IF;

  IF p_relationship_id IS NOT NULL THEN
    SELECT account.id, public.normalize_email_canonical(account.email)
      INTO v_target_user_id, v_target_email
    FROM public.relationships AS relationship
    JOIN auth.users AS account ON account.id = relationship.counterpart_user_id
    WHERE relationship.id = p_relationship_id
      AND relationship.owner_id = p_actor_id
      AND relationship.counterpart_user_id IS NOT NULL
      AND relationship.counterpart_user_id <> p_actor_id;
    IF v_target_user_id IS NULL THEN RAISE EXCEPTION 'expense_recipient_unavailable'; END IF;
  ELSIF p_recipient_email IS NOT NULL THEN
    v_target_email := public.normalize_email_canonical(p_recipient_email);
    SELECT account.id INTO v_target_user_id
    FROM auth.users AS account
    WHERE public.normalize_email_canonical(account.email) = v_target_email
    ORDER BY account.id LIMIT 1;
  END IF;

  IF v_target_user_id IS NOT NULL AND (
    EXISTS (
      SELECT 1
      FROM public.expense_shares AS share_row
      JOIN public.expense_group_members AS member
        ON member.group_id = p_group_id AND member.id = share_row.member_id
      WHERE share_row.expense_id = p_expense_id
        AND member.user_id = v_target_user_id
        AND member.status IN ('active', 'invited')
    )
    OR EXISTS (
      SELECT 1
      FROM public.expense_share_collaborators AS collaboration
      JOIN public.expense_group_members AS member
        ON member.group_id = collaboration.group_id
       AND member.id = collaboration.collaborator_member_id
      WHERE collaboration.expense_id = p_expense_id
        AND collaboration.status = 'active'
        AND member.user_id = v_target_user_id
        AND member.status IN ('active', 'invited')
    )
  ) THEN
    RAISE EXCEPTION 'expense_share_actor_conflict';
  END IF;

  INSERT INTO public.expense_group_members (
    id, group_id, user_id, display_name, role, status
  ) VALUES (
    v_member_id, p_group_id, NULL, v_display_name, 'member', 'active'
  );
  INSERT INTO public.expense_share_collaborators (
    id, group_id, expense_id, share_member_id, collaborator_member_id,
    status, created_by
  ) VALUES (
    v_collaboration_id, p_group_id, p_expense_id, p_share_member_id,
    v_member_id, 'active', p_actor_id
  );

  IF p_recipient_email IS NOT NULL OR p_relationship_id IS NOT NULL THEN
    v_invitation_id := public.expense_create_unified_participant_invitation(
      p_actor_id, p_group_id, v_member_id, p_recipient_email,
      p_relationship_id, CASE WHEN p_relationship_id IS NULL
        THEN 'manual_email' ELSE 'relationship' END
    );
    UPDATE public.expense_member_invitations AS invitation
    SET shared_expense_id = p_expense_id,
        shared_share_member_id = p_share_member_id
    WHERE invitation.id = v_invitation_id
      AND invitation.group_id = p_group_id
      AND invitation.member_id = v_member_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'expense_invitation_scope_failed'; END IF;
  END IF;

  PERFORM public.expense_record_activity(
    p_group_id, p_actor_id, 'expense_share_collaborator_added',
    'expense', p_expense_id, 'expense_share_collaborator_added',
    v_expense.title, NULL, ARRAY[]::uuid[], false
  );

  v_result := jsonb_build_object(
    'group_id', p_group_id,
    'expense_id', p_expense_id,
    'share_member_id', p_share_member_id,
    'member_id', v_member_id,
    'collaboration_id', v_collaboration_id
  ) || CASE WHEN v_invitation_id IS NULL THEN '{}'::jsonb
    ELSE jsonb_build_object('invitation_id', v_invitation_id) END;
  PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;

-- Accepted share collaborators act only for the canonical member whose share
-- they joined. The financial rows and settlement calculations stay canonical.
-- SQL113_REPAYMENT_OVERRIDES
CREATE OR REPLACE FUNCTION public.expense_transition_repayment(
  p_actor_id uuid,
  p_repayment_id uuid,
  p_action text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group_id uuid;
  v_group public.expense_groups%ROWTYPE;
  v_repayment public.expense_repayments%ROWTYPE;
  v_from public.expense_group_members%ROWTYPE;
  v_to public.expense_group_members%ROWTYPE;
  v_role text;
  v_new_status text;
  v_event text;
  v_fingerprint text;
  v_replay jsonb;
  v_result jsonb;
BEGIN
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  IF p_action IS NULL OR p_action NOT IN ('confirm', 'reject', 'cancel') THEN
    RAISE EXCEPTION 'expense_invalid_input';
  END IF;
  v_fingerprint := md5(jsonb_build_object(
    'repaymentId', p_repayment_id, 'action', p_action
  )::text);
  v_replay := public.expense_begin_request(
    p_actor_id, p_request_id, 'expense_transition_repayment', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN
    RETURN v_replay;
  END IF;

  SELECT repayment.group_id INTO v_group_id
  FROM public.expense_repayments AS repayment
  WHERE repayment.id = p_repayment_id;
  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'expense_repayment_not_found';
  END IF;

  -- Preserve the global lock order: group before repayment.
  SELECT group_row.* INTO v_group
  FROM public.expense_groups AS group_row
  WHERE group_row.id = v_group_id
  FOR UPDATE;
  SELECT repayment.* INTO v_repayment
  FROM public.expense_repayments AS repayment
  WHERE repayment.id = p_repayment_id
    AND repayment.group_id = v_group_id
  FOR UPDATE;
  v_role := public.expense_active_member_role(p_actor_id, v_group_id);
  SELECT member.* INTO v_from
  FROM public.expense_group_members AS member
  WHERE member.id = v_repayment.from_member_id
    AND member.group_id = v_group_id;
  SELECT member.* INTO v_to
  FROM public.expense_group_members AS member
  WHERE member.id = v_repayment.to_member_id
    AND member.group_id = v_group_id;

  -- Confirmed is terminal: neither debtor nor manager can undo it. Rejection
  -- and cancellation are also terminal; every transition starts at reported.
  IF v_repayment.status <> 'reported' OR v_role IS NULL
     OR v_from.status NOT IN ('active', 'invited')
     OR v_to.status NOT IN ('active', 'invited') THEN
    RAISE EXCEPTION 'expense_repayment_transition_invalid';
  END IF;
  IF p_action IN ('confirm', 'reject') AND NOT (
    public.expense_actor_can_act_for_share_member(
      p_actor_id, v_group_id, v_repayment.to_member_id
    )
    OR (
      (v_to.user_id IS NULL OR v_to.status = 'invited')
      AND coalesce(v_role, '') IN ('owner', 'admin')
    )
  ) THEN
    RAISE EXCEPTION 'expense_repayment_not_allowed';
  END IF;
  IF p_action = 'cancel' AND NOT (
    public.expense_actor_can_act_for_share_member(
      p_actor_id, v_group_id, v_repayment.from_member_id
    )
    OR v_repayment.reported_by = p_actor_id
    OR coalesce(v_role, '') IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'expense_repayment_not_allowed';
  END IF;

  v_new_status := CASE p_action
    WHEN 'confirm' THEN 'confirmed'
    WHEN 'reject' THEN 'rejected'
    ELSE 'cancelled'
  END;
  v_event := CASE p_action
    WHEN 'confirm' THEN 'expense_repayment_confirmed'
    WHEN 'reject' THEN 'expense_repayment_rejected'
    ELSE 'expense_repayment_cancelled'
  END;
  UPDATE public.expense_repayments AS repayment
  SET status = v_new_status
  WHERE repayment.id = p_repayment_id;
  UPDATE public.expense_groups AS group_row
  SET financial_version = group_row.financial_version + 1
  WHERE group_row.id = v_group_id;

  PERFORM public.expense_record_activity(
    v_group_id, p_actor_id, v_event, 'expense_repayment', p_repayment_id,
    v_event, NULL, v_group.name, ARRAY[]::uuid[], true
  );

  v_result := jsonb_build_object('group_id', v_group_id);
  PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;
CREATE OR REPLACE FUNCTION public.expense_record_received_repayment(
  p_actor_id uuid,
  p_group_id uuid,
  p_from_member_id uuid,
  p_to_member_id uuid,
  p_expected_financial_version bigint,
  p_amount_minor bigint,
  p_currency text,
  p_occurred_on date,
  p_note text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group public.expense_groups%ROWTYPE;
  v_from public.expense_group_members%ROWTYPE;
  v_to public.expense_group_members%ROWTYPE;
  v_role text;
  v_available bigint;
  v_obligation_id uuid := gen_random_uuid();
  v_repayment_id uuid := gen_random_uuid();
  v_fingerprint text;
  v_replay jsonb;
  v_result jsonb;
BEGIN
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  IF p_actor_id IS NULL OR p_group_id IS NULL
     OR p_from_member_id IS NULL OR p_to_member_id IS NULL
     OR p_from_member_id = p_to_member_id
     OR p_expected_financial_version IS NULL OR p_expected_financial_version < 0
     OR p_amount_minor NOT BETWEEN 1 AND 9007199254740991
     OR p_currency !~ '^[A-Z]{3}$'
     OR p_occurred_on IS NULL
     OR (p_note IS NOT NULL AND char_length(p_note) > 1000) THEN
    RAISE EXCEPTION 'expense_invalid_input';
  END IF;

  v_fingerprint := md5(jsonb_build_object(
    'groupId', p_group_id,
    'fromMemberId', p_from_member_id,
    'toMemberId', p_to_member_id,
    'expectedFinancialVersion', p_expected_financial_version,
    'amountMinor', p_amount_minor,
    'currency', p_currency,
    'occurredOn', p_occurred_on,
    'note', NULLIF(btrim(p_note), '')
  )::text);
  v_replay := public.expense_begin_request(
    p_actor_id, p_request_id, 'expense_record_received_repayment', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN
    RETURN v_replay;
  END IF;

  -- Keep the global order: actor mutation lock (inside begin_request), then
  -- the group row. The financial version is a CAS guard against stale dialogs.
  SELECT group_row.* INTO v_group
  FROM public.expense_groups AS group_row
  WHERE group_row.id = p_group_id
  FOR UPDATE;
  v_role := public.expense_active_member_role(p_actor_id, p_group_id);
  IF v_group.id IS NULL OR v_group.status NOT IN ('active', 'settling')
     OR v_group.financial_version <> p_expected_financial_version
     OR v_role IS NULL THEN
    RAISE EXCEPTION 'expense_financial_version_conflict';
  END IF;

  SELECT member.* INTO v_from
  FROM public.expense_group_members AS member
  WHERE member.group_id = p_group_id
    AND member.id = p_from_member_id
    AND member.status IN ('active', 'invited');
  SELECT member.* INTO v_to
  FROM public.expense_group_members AS member
  WHERE member.group_id = p_group_id
    AND member.id = p_to_member_id
    AND member.status IN ('active', 'invited');

  IF v_from.id IS NULL OR v_to.id IS NULL OR NOT (
    public.expense_actor_can_act_for_share_member(
      p_actor_id, p_group_id, p_to_member_id
    )
    OR (
      (v_to.user_id IS NULL OR v_to.status = 'invited')
      AND coalesce(v_role, '') IN ('owner', 'admin')
    )
  ) THEN
    RAISE EXCEPTION 'expense_repayment_not_allowed';
  END IF;

  -- Include pending reports. The recipient can record only genuinely free
  -- remainder and can never duplicate a reported or confirmed amount.
  SELECT settlement.amount_minor INTO v_available
  FROM public.expense_simplified_settlement(p_group_id, p_currency, true) AS settlement
  WHERE settlement.from_member_id = p_from_member_id
    AND settlement.to_member_id = p_to_member_id
  LIMIT 1;
  IF v_available IS NULL OR p_amount_minor > v_available THEN
    RAISE EXCEPTION 'expense_repayment_exceeds_available';
  END IF;

  INSERT INTO public.expense_obligations (
    id, group_id, from_member_id, to_member_id, amount_minor, currency
  ) VALUES (
    v_obligation_id, p_group_id, p_from_member_id, p_to_member_id,
    p_amount_minor, p_currency
  );
  INSERT INTO public.expense_repayments (
    id, group_id, from_member_id, to_member_id, amount_minor, currency,
    occurred_on, note, status, reported_by, payment_preference_snapshot,
    payment_profile_encrypted_snapshot
  ) VALUES (
    v_repayment_id, p_group_id, p_from_member_id, p_to_member_id,
    p_amount_minor, p_currency, p_occurred_on, NULLIF(btrim(p_note), ''),
    'confirmed', p_actor_id, NULL, NULL
  );
  INSERT INTO public.expense_repayment_allocations (
    group_id, repayment_id, obligation_id, amount_minor
  ) VALUES (p_group_id, v_repayment_id, v_obligation_id, p_amount_minor);

  UPDATE public.expense_groups AS group_row
  SET financial_version = group_row.financial_version + 1
  WHERE group_row.id = p_group_id;

  PERFORM public.expense_record_activity(
    p_group_id, p_actor_id, 'expense_repayment_confirmed',
    'expense_repayment', v_repayment_id, 'expense_repayment_confirmed',
    NULL, v_group.name, ARRAY[]::uuid[], true
  );

  v_result := jsonb_build_object(
    'repayment_id', v_repayment_id,
    'group_id', p_group_id
  );
  PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;
CREATE OR REPLACE FUNCTION public.expense_report_repayment(
  p_actor_id uuid,
  p_group_id uuid,
  p_from_member_id uuid,
  p_to_member_id uuid,
  p_expected_financial_version bigint,
  p_amount_minor bigint,
  p_currency text,
  p_occurred_on date,
  p_note text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group public.expense_groups%ROWTYPE;
  v_from public.expense_group_members%ROWTYPE;
  v_to public.expense_group_members%ROWTYPE;
  v_role text;
  v_available bigint;
  v_obligation_id uuid := gen_random_uuid();
  v_repayment_id uuid := gen_random_uuid();
  v_preference_id uuid;
  v_preference public.expense_payment_preferences%ROWTYPE;
  v_snapshot jsonb;
  v_fingerprint text;
  v_replay jsonb;
  v_result jsonb;
BEGIN
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  IF p_group_id IS NULL OR p_from_member_id IS NULL OR p_to_member_id IS NULL
     OR p_from_member_id = p_to_member_id
     OR p_expected_financial_version IS NULL OR p_expected_financial_version < 0
     OR p_amount_minor NOT BETWEEN 1 AND 9007199254740991
     OR p_currency !~ '^[A-Z]{3}$'
     OR p_occurred_on IS NULL
     OR (p_note IS NOT NULL AND char_length(p_note) > 1000) THEN
    RAISE EXCEPTION 'expense_invalid_input';
  END IF;

  v_fingerprint := md5(jsonb_build_object(
    'groupId', p_group_id,
    'fromMemberId', p_from_member_id,
    'toMemberId', p_to_member_id,
    'expectedFinancialVersion', p_expected_financial_version,
    'amountMinor', p_amount_minor,
    'currency', p_currency,
    'occurredOn', p_occurred_on,
    'note', NULLIF(btrim(p_note), '')
  )::text);
  v_replay := public.expense_begin_request(
    p_actor_id, p_request_id, 'expense_report_repayment', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN
    RETURN v_replay;
  END IF;

  -- Every financial mutation locks the group first. This serializes balance
  -- derivation and makes expected_financial_version an effective CAS.
  SELECT group_row.* INTO v_group
  FROM public.expense_groups AS group_row
  WHERE group_row.id = p_group_id
  FOR UPDATE;
  v_role := public.expense_active_member_role(p_actor_id, p_group_id);
  IF v_group.id IS NULL OR v_group.status NOT IN ('active', 'settling')
     OR v_group.financial_version <> p_expected_financial_version
     OR v_role IS NULL THEN
    RAISE EXCEPTION 'expense_financial_version_conflict';
  END IF;

  SELECT member.* INTO v_from
  FROM public.expense_group_members AS member
  WHERE member.group_id = p_group_id
    AND member.id = p_from_member_id
    AND member.status IN ('active', 'invited');
  SELECT member.* INTO v_to
  FROM public.expense_group_members AS member
  WHERE member.group_id = p_group_id
    AND member.id = p_to_member_id
    AND member.status IN ('active', 'invited');
  IF v_from.id IS NULL OR v_to.id IS NULL
     OR NOT (
       public.expense_actor_can_act_for_share_member(
         p_actor_id, p_group_id, p_from_member_id
       )
       OR (
         (v_from.user_id IS NULL OR v_from.status = 'invited')
         AND coalesce(v_role, '') IN ('owner', 'admin')
       )
     ) THEN
    RAISE EXCEPTION 'expense_repayment_not_allowed';
  END IF;

  SELECT settlement.amount_minor
  INTO v_available
  FROM public.expense_simplified_settlement(p_group_id, p_currency, true) AS settlement
  WHERE settlement.from_member_id = p_from_member_id
    AND settlement.to_member_id = p_to_member_id
  LIMIT 1;
  IF v_available IS NULL OR p_amount_minor > v_available THEN
    RAISE EXCEPTION 'expense_repayment_exceeds_available';
  END IF;

  -- Payment preferences use a separate owner-level advisory-lock namespace.
  -- Global order is actor mutation lock (9601), financial group row, then
  -- preference owner lock (9602), then preference/assignment rows. Save,
  -- deactivate, and account deletion take the same owner lock before touching
  -- preference data, so the authorization decision and copied snapshot are
  -- from one serialized state without crossing actor locks between users.
  --
  -- An admin reporting for an unregistered guest debtor must not receive the
  -- registered creditor's payment details. Snapshot only for the debtor acting
  -- for their own registered party.
  IF v_to.user_id IS NOT NULL
     AND public.expense_actor_can_act_for_share_member(
       p_actor_id, p_group_id, p_from_member_id
     ) THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_to.user_id::text, 9602)
    );

    -- Resolve the recipient's most specific assignment. A NULL preference_id
    -- is an explicit suppression and prevents fallback to a broader row.
    SELECT assignment.preference_id
    INTO v_preference_id
    FROM public.expense_payment_preference_assignments AS assignment
    WHERE assignment.owner_user_id = v_to.user_id
      AND (
        (assignment.scope_type = 'group_currency'
          AND assignment.group_id = p_group_id
          AND assignment.currency = p_currency)
        OR (assignment.scope_type = 'currency'
          AND assignment.group_id IS NULL
          AND assignment.currency = p_currency)
        OR (assignment.scope_type = 'general'
          AND assignment.group_id IS NULL
          AND assignment.currency IS NULL)
      )
    ORDER BY CASE assignment.scope_type
      WHEN 'group_currency' THEN 1
      WHEN 'currency' THEN 2
      ELSE 3
    END
    LIMIT 1;

    IF v_preference_id IS NOT NULL THEN
      SELECT preference.* INTO v_preference
      FROM public.expense_payment_preferences AS preference
      WHERE preference.id = v_preference_id
        AND preference.owner_user_id = v_to.user_id
        AND preference.active
        AND preference.visibility = 'debt_context'
        AND (
          preference.supported_currencies IS NULL
          OR p_currency = ANY(preference.supported_currencies)
        );

      IF v_preference.id IS NOT NULL THEN
        v_snapshot := jsonb_build_object(
          'title', v_preference.title,
          'kind', v_preference.kind,
          'currency', p_currency,
          'details', v_preference.details,
          'visibility', v_preference.visibility,
          'captured_at', now(),
          'owner_user_id', v_preference.owner_user_id,
          'source_preference_id', v_preference.id,
          'source_version', v_preference.version
        );
      END IF;
    END IF;
  END IF;

  INSERT INTO public.expense_obligations (
    id, group_id, from_member_id, to_member_id, amount_minor, currency
  ) VALUES (
    v_obligation_id, p_group_id, p_from_member_id, p_to_member_id,
    p_amount_minor, p_currency
  );
  INSERT INTO public.expense_repayments (
    id, group_id, from_member_id, to_member_id, amount_minor, currency,
    occurred_on, note, status, reported_by, payment_preference_snapshot
  ) VALUES (
    v_repayment_id, p_group_id, p_from_member_id, p_to_member_id,
    p_amount_minor, p_currency, p_occurred_on, NULLIF(btrim(p_note), ''),
    'reported', p_actor_id, v_snapshot
  );
  INSERT INTO public.expense_repayment_allocations (
    group_id, repayment_id, obligation_id, amount_minor
  ) VALUES (p_group_id, v_repayment_id, v_obligation_id, p_amount_minor);

  UPDATE public.expense_groups AS group_row
  SET financial_version = group_row.financial_version + 1
  WHERE group_row.id = p_group_id;

  PERFORM public.expense_record_activity(
    p_group_id, p_actor_id, 'expense_repayment_reported',
    'expense_repayment', v_repayment_id, 'expense_repayment_reported',
    NULL, v_group.name, ARRAY[]::uuid[], true
  );

  v_result := jsonb_build_object(
    'repayment_id', v_repayment_id,
    'group_id', p_group_id
  );
  PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$$;

-- Existing guest-linking remains reusable. If the guest is a shared actor,
-- the invitation is additionally scoped to the exact expense/share.
CREATE OR REPLACE FUNCTION public.expense_invite_existing_participant(
  p_actor_id uuid,
  p_group_id uuid,
  p_member_id uuid,
  p_recipient_email text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_scope_expense_id uuid;
  v_scope_share_member_id uuid;
BEGIN
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'expense_invalid_input'; END IF;
  v_id := public.expense_create_unified_participant_invitation(
    p_actor_id, p_group_id, p_member_id, p_recipient_email, NULL, 'guest_link'
  );
  SELECT collaboration.expense_id, collaboration.share_member_id
    INTO v_scope_expense_id, v_scope_share_member_id
  FROM public.expense_share_collaborators AS collaboration
  WHERE collaboration.group_id = p_group_id
    AND collaboration.collaborator_member_id = p_member_id
    AND collaboration.status = 'active'
  ORDER BY collaboration.created_at DESC
  LIMIT 1;
  IF v_scope_expense_id IS NOT NULL THEN
    UPDATE public.expense_member_invitations AS invitation
    SET shared_expense_id = v_scope_expense_id,
        shared_share_member_id = v_scope_share_member_id
    WHERE invitation.id = v_id
      AND invitation.group_id = p_group_id
      AND invitation.member_id = p_member_id;
  END IF;
  RETURN jsonb_build_object(
    'invitation_id', v_id, 'group_id', p_group_id, 'member_id', p_member_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.expense_respond_scoped_member_invitation(
  p_actor_id uuid,
  p_invitation_id uuid,
  p_action text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invitation public.expense_member_invitations%ROWTYPE;
  v_group public.expense_groups%ROWTYPE;
  v_member public.expense_group_members%ROWTYPE;
  v_actor_email text;
  v_name text;
  v_expense_title text;
  v_result jsonb;
  v_existing record;
  v_version bigint;
  v_fingerprint text;
BEGIN
  IF p_actor_id IS NULL OR p_invitation_id IS NULL OR p_request_id IS NULL
     OR p_action NOT IN ('accept', 'decline') THEN
    RAISE EXCEPTION 'expense_invalid_input';
  END IF;
  v_fingerprint := md5(jsonb_build_object(
    'invitationId', p_invitation_id, 'action', p_action
  )::text);
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_actor_id::text, 9601)
  );
  INSERT INTO public.expense_mutation_requests (
    actor_user_id, request_id, operation, fingerprint
  ) VALUES (
    p_actor_id, p_request_id, 'expense_respond_scoped_member_invitation', v_fingerprint
  ) ON CONFLICT (actor_user_id, request_id) DO NOTHING;
  IF NOT FOUND THEN
    SELECT request.* INTO v_existing
    FROM public.expense_mutation_requests AS request
    WHERE request.actor_user_id = p_actor_id AND request.request_id = p_request_id
    FOR UPDATE;
    IF v_existing.operation <> 'expense_respond_scoped_member_invitation'
       OR v_existing.fingerprint <> v_fingerprint THEN
      RAISE EXCEPTION 'expense_idempotency_conflict';
    END IF;
    IF v_existing.result IS NULL THEN RAISE EXCEPTION 'expense_idempotency_incomplete'; END IF;
    RETURN v_existing.result;
  END IF;

  SELECT public.normalize_email_canonical(account.email) INTO v_actor_email
  FROM auth.users AS account WHERE account.id = p_actor_id;
  SELECT invitation.* INTO v_invitation
  FROM public.expense_member_invitations AS invitation
  WHERE invitation.id = p_invitation_id
  FOR UPDATE;
  IF v_invitation.id IS NULL OR v_invitation.status <> 'pending'
     OR v_invitation.recipient_email_canonical IS DISTINCT FROM v_actor_email THEN
    RAISE EXCEPTION 'expense_invitation_not_found';
  END IF;
  SELECT group_row.* INTO v_group
  FROM public.expense_groups AS group_row
  WHERE group_row.id = v_invitation.group_id
  FOR UPDATE;
  SELECT member.* INTO v_member
  FROM public.expense_group_members AS member
  WHERE member.group_id = v_invitation.group_id
    AND member.id = v_invitation.member_id
  FOR UPDATE;

  IF v_invitation.shared_expense_id IS NOT NULL THEN
    SELECT expense.title INTO v_expense_title
    FROM public.expenses AS expense
    JOIN public.expense_share_collaborators AS collaboration
      ON collaboration.group_id = expense.group_id
     AND collaboration.expense_id = expense.id
     AND collaboration.share_member_id = v_invitation.shared_share_member_id
     AND collaboration.collaborator_member_id = v_invitation.member_id
     AND collaboration.status = 'active'
    WHERE expense.group_id = v_invitation.group_id
      AND expense.id = v_invitation.shared_expense_id
      AND expense.status = 'active';
    IF v_expense_title IS NULL THEN RAISE EXCEPTION 'expense_invitation_conflict'; END IF;
  END IF;

  IF v_invitation.expires_at <= now() THEN
    PERFORM public.expense_terminalize_member_invitations(
      ARRAY[p_invitation_id], 'expired'
    );
    v_result := jsonb_build_object('status', 'expired');
  ELSIF p_action = 'decline' THEN
    PERFORM public.expense_terminalize_member_invitations(
      ARRAY[p_invitation_id], 'declined'
    );
    PERFORM public.expense_record_activity(
      v_group.id, p_actor_id, 'expense_member_invitation_declined',
      'expense_member_invitation', p_invitation_id,
      'expense_member_invitation_declined', NULL,
      v_invitation.context_title_snapshot,
      CASE WHEN v_invitation.invited_by IS NULL THEN ARRAY[]::uuid[]
        ELSE ARRAY[v_invitation.invited_by] END, true
    );
    v_result := jsonb_build_object('status', 'declined');
  ELSE
    IF v_group.status NOT IN ('active', 'settling', 'settled')
       OR v_member.status <> 'active' OR v_member.user_id IS NOT NULL
       OR EXISTS (
         SELECT 1 FROM public.expense_group_members AS duplicate
         WHERE duplicate.group_id = v_group.id
           AND duplicate.id <> v_member.id
           AND duplicate.user_id = p_actor_id
           AND duplicate.status IN ('active', 'invited')
       ) THEN
      RAISE EXCEPTION 'expense_invitation_conflict';
    END IF;
    IF v_invitation.shared_expense_id IS NOT NULL AND (
      EXISTS (
        SELECT 1
        FROM public.expense_shares AS share_row
        JOIN public.expense_group_members AS member
          ON member.group_id = v_group.id AND member.id = share_row.member_id
        WHERE share_row.expense_id = v_invitation.shared_expense_id
          AND member.user_id = p_actor_id
          AND member.status IN ('active', 'invited')
      )
      OR EXISTS (
        SELECT 1
        FROM public.expense_share_collaborators AS collaboration
        JOIN public.expense_group_members AS member
          ON member.group_id = collaboration.group_id
         AND member.id = collaboration.collaborator_member_id
        WHERE collaboration.expense_id = v_invitation.shared_expense_id
          AND collaboration.status = 'active'
          AND collaboration.collaborator_member_id <> v_member.id
          AND member.user_id = p_actor_id
          AND member.status IN ('active', 'invited')
      )
    ) THEN
      RAISE EXCEPTION 'expense_share_actor_conflict';
    END IF;

    SELECT coalesce(NULLIF(btrim(profile.display_name), ''), 'Teskeiðarnotandi')
      INTO v_name
    FROM public.profiles AS profile WHERE profile.id = p_actor_id;
    UPDATE public.expense_group_members AS member
    SET user_id = p_actor_id,
        display_name = left(coalesce(v_name, 'Teskeiðarnotandi'), 120),
        status = 'active'
    WHERE member.group_id = v_group.id AND member.id = v_member.id;
    PERFORM public.expense_terminalize_member_invitations(
      ARRAY[p_invitation_id], 'accepted'
    );
    IF v_invitation.shared_expense_id IS NULL THEN
      UPDATE public.expense_groups AS group_row
      SET financial_version = group_row.financial_version + 1
      WHERE group_row.id = v_group.id
      RETURNING group_row.financial_version INTO v_version;
    ELSE
      v_version := v_group.financial_version;
    END IF;
    PERFORM public.expense_record_activity(
      v_group.id, p_actor_id, 'expense_member_invitation_accepted',
      'expense_member_invitation', p_invitation_id,
      'expense_member_invitation_accepted', NULL,
      v_invitation.context_title_snapshot, ARRAY[p_actor_id], true
    );
    IF v_invitation.shared_expense_id IS NOT NULL THEN
      PERFORM public.expense_record_activity(
        v_group.id, p_actor_id, 'expense_share_collaborator_linked',
        'expense', v_invitation.shared_expense_id,
        'expense_share_collaborator_linked', v_expense_title,
        NULL, ARRAY[]::uuid[], false
      );
    END IF;
    v_result := jsonb_build_object(
      'status', 'accepted', 'group_id', v_group.id,
      'member_id', v_member.id, 'invited_by', v_invitation.invited_by,
      'counterpart_user_id', p_actor_id, 'financial_version', v_version,
      'participant_source', v_invitation.participant_source
    );
  END IF;
  UPDATE public.expense_mutation_requests AS request
  SET result = v_result, completed_at = now()
  WHERE request.actor_user_id = p_actor_id
    AND request.request_id = p_request_id
    AND request.result IS NULL;
  RETURN v_result;
END;
$$;

REVOKE ALL ON TABLE public.expense_share_collaborators
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.expense_share_collaborators TO service_role;

REVOKE ALL ON FUNCTION public.expense_guard_share_collaborator_mutation()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_actor_can_act_for_share_member(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.expense_add_share_collaborator(
  uuid, uuid, uuid, uuid, uuid, jsonb, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expense_add_share_collaborator(
  uuid, uuid, uuid, uuid, uuid, jsonb, text, uuid
) TO service_role;

REVOKE ALL ON FUNCTION public.expense_invite_existing_participant(
  uuid, uuid, uuid, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expense_invite_existing_participant(
  uuid, uuid, uuid, text, uuid
) TO service_role;

REVOKE ALL ON FUNCTION public.expense_respond_scoped_member_invitation(
  uuid, uuid, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expense_respond_scoped_member_invitation(
  uuid, uuid, text, uuid
) TO service_role;

REVOKE ALL ON FUNCTION public.expense_report_repayment(
  uuid, uuid, uuid, uuid, bigint, bigint, text, date, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expense_report_repayment(
  uuid, uuid, uuid, uuid, bigint, bigint, text, date, text, uuid
) TO service_role;

REVOKE ALL ON FUNCTION public.expense_record_received_repayment(
  uuid, uuid, uuid, uuid, bigint, bigint, text, date, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expense_record_received_repayment(
  uuid, uuid, uuid, uuid, bigint, bigint, text, date, text, uuid
) TO service_role;

REVOKE ALL ON FUNCTION public.expense_transition_repayment(
  uuid, uuid, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expense_transition_repayment(
  uuid, uuid, text, uuid
) TO service_role;

COMMENT ON TABLE public.expense_share_collaborators IS
  'Identity-only actors authorized behind one canonical financial share; contains no amount.';
COMMENT ON FUNCTION public.expense_add_share_collaborator(
  uuid, uuid, uuid, uuid, uuid, jsonb, text, uuid
) IS 'Manager-only, idempotent identity mapping; never creates or changes a financial share.';
COMMENT ON FUNCTION public.expense_actor_can_act_for_share_member(uuid, uuid, uuid) IS
  'Private exact-scope authorization for a canonical member or accepted active collaborator.';

COMMIT;
