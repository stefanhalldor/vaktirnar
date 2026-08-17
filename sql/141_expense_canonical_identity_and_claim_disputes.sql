-- SQL141: canonical Expense identity from durable Relationship/Event proof,
-- private claim disputes, and fail-closed settlement review.
--
-- This file is written for Stebbi to run only after the read-only preflight.
-- Codex does not execute migrations.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';
SET LOCAL search_path = pg_catalog, public;

DO $preflight$
BEGIN
  IF current_user <> 'postgres' AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles AS role_row
    WHERE role_row.rolname = current_user AND role_row.rolsuper
  ) THEN
    RAISE EXCEPTION 'expense_141_executor_invalid';
  END IF;
  IF pg_catalog.to_regclass('public.expense_groups') IS NULL
     OR pg_catalog.to_regclass('public.expense_group_members') IS NULL
     OR pg_catalog.to_regclass('public.expenses') IS NULL
     OR pg_catalog.to_regclass('public.expense_payments') IS NULL
     OR pg_catalog.to_regclass('public.expense_shares') IS NULL
     OR pg_catalog.to_regclass('public.expense_obligations') IS NULL
     OR pg_catalog.to_regclass('public.expense_repayments') IS NULL
     OR pg_catalog.to_regclass('public.expense_activity') IS NULL
     OR pg_catalog.to_regclass('public.expense_activity_audience') IS NULL
     OR pg_catalog.to_regclass('public.expense_mutation_requests') IS NULL
     OR pg_catalog.to_regclass('public.expense_member_invitations') IS NULL
     OR pg_catalog.to_regclass('public.expense_share_collaborators') IS NULL
     OR pg_catalog.to_regclass('public.relationships') IS NULL
     OR pg_catalog.to_regclass('public.profiles') IS NULL
     OR pg_catalog.to_regclass('public.teskeid_events') IS NULL
     OR pg_catalog.to_regclass('public.teskeid_event_guests') IS NULL
     OR pg_catalog.to_regclass('public.teskeid_event_guest_invitations') IS NULL
     OR pg_catalog.to_regclass('public.teskeid_event_attendance_memberships') IS NULL
     OR pg_catalog.to_regclass('public.teskeid_event_expense_links') IS NULL
     OR pg_catalog.to_regclass('public.teskeid_event_expense_participant_sources') IS NULL
     OR pg_catalog.to_regclass('public.recent_events') IS NULL
     OR pg_catalog.to_regclass('auth.users') IS NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_begin_request(uuid,uuid,text,text)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_finish_request(uuid,uuid,jsonb)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_assert_beta_actor(uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_has_beta_access(uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_active_member_role(uuid,uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.normalize_email_canonical(text)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_record_activity(uuid,uuid,text,text,uuid,text,text,text,uuid[],boolean)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_create_expense_with_known_members(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_update_expense_with_participants(uuid,uuid,uuid,bigint,text,bigint,text,date,text,text,text,boolean,jsonb,jsonb,uuid[],jsonb,jsonb)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_add_participant(uuid,uuid,uuid,jsonb,text,uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_add_share_collaborator(uuid,uuid,uuid,uuid,uuid,jsonb,text,uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_update_expense(uuid,uuid,uuid,bigint,text,bigint,text,date,text,text,text,boolean,jsonb,jsonb,jsonb)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_add_group_member(uuid,uuid,uuid,jsonb)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_create_unified_participant_invitation(uuid,uuid,uuid,text,uuid,text)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_terminalize_member_invitations(uuid[],text)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_create_tagged_expense_for_actor(uuid,uuid,uuid,bigint,jsonb)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_create_expense_from_event_for_actor(uuid,uuid,uuid,bigint,boolean,jsonb)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_begin_request(uuid,uuid,text,text,boolean)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_finish_request(uuid,uuid,jsonb)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_uuid_from_text(text)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_resolve_recent_targets(uuid,uuid[])'
     ) IS NULL THEN
    RAISE EXCEPTION 'expense_141_prerequisite_missing';
  END IF;
  IF pg_catalog.to_regclass('public.expense_member_identity_bindings') IS NOT NULL
     OR pg_catalog.to_regclass('public.expense_claim_disputes') IS NOT NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_get_claim_context(uuid,uuid)'
     ) IS NOT NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_dispute_claim(uuid,uuid,uuid,uuid,bigint)'
     ) IS NOT NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_get_event_identity_candidates(uuid,uuid)'
     ) IS NOT NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_bind_member_event_identity(uuid,uuid,uuid,uuid,uuid,bigint)'
     ) IS NOT NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_identity_request_id(text,uuid)'
     ) IS NOT NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_record_private_recent(uuid,uuid,uuid[],text,uuid,text)'
     ) IS NOT NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_apply_identity_binding(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid,boolean)'
     ) IS NOT NULL
     OR pg_catalog.to_regprocedure(
       'public.expense_guard_disputed_settlement()'
     ) IS NOT NULL THEN
    RAISE EXCEPTION 'expense_141_target_exists';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger AS trigger_row
    WHERE trigger_row.tgname = 'expense_repayments_dispute_guard'
      AND NOT trigger_row.tgisinternal
  ) THEN
    RAISE EXCEPTION 'expense_141_target_exists';
  END IF;
END;
$preflight$;

CREATE TABLE public.expense_member_identity_bindings (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id               uuid        NOT NULL,
  member_id              uuid        NOT NULL,
  target_user_id         uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  proof_kind             text        NOT NULL,
  relationship_id        uuid        NULL,
  event_id               uuid        NULL,
  event_participant_id   uuid        NULL,
  bound_by_user_id       uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT expense_member_identity_bindings_member_fk
    FOREIGN KEY (group_id, member_id)
    REFERENCES public.expense_group_members(group_id, id) ON DELETE CASCADE,
  CONSTRAINT expense_member_identity_bindings_member_key
    UNIQUE (group_id, member_id),
  CONSTRAINT expense_member_identity_bindings_proof_check CHECK (
    (proof_kind = 'relationship'
      AND relationship_id IS NOT NULL
      AND event_id IS NULL AND event_participant_id IS NULL)
    OR (proof_kind IN ('event_guest', 'event_organizer', 'event_current_repair')
      AND relationship_id IS NULL
      AND event_id IS NOT NULL AND event_participant_id IS NOT NULL)
  )
);

CREATE INDEX expense_member_identity_bindings_user_idx
  ON public.expense_member_identity_bindings (target_user_id, created_at DESC)
  WHERE target_user_id IS NOT NULL;

CREATE TABLE public.expense_claim_disputes (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id          uuid        NOT NULL,
  expense_id        uuid        NOT NULL,
  member_id         uuid        NOT NULL,
  disputed_user_id  uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  status            text        NOT NULL DEFAULT 'disputed',
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT expense_claim_disputes_expense_fk
    FOREIGN KEY (group_id, expense_id)
    REFERENCES public.expenses(group_id, id) ON DELETE CASCADE,
  CONSTRAINT expense_claim_disputes_member_fk
    FOREIGN KEY (group_id, member_id)
    REFERENCES public.expense_group_members(group_id, id) ON DELETE RESTRICT,
  CONSTRAINT expense_claim_disputes_claim_key
    UNIQUE (expense_id, member_id),
  CONSTRAINT expense_claim_disputes_status_check CHECK (status = 'disputed')
);

CREATE INDEX expense_claim_disputes_group_idx
  ON public.expense_claim_disputes (group_id, created_at DESC);

ALTER TABLE public.expense_member_identity_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_member_identity_bindings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.expense_claim_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_claim_disputes FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.expense_member_identity_bindings
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.expense_claim_disputes
  FROM PUBLIC, anon, authenticated, service_role;

-- Preserve the complete current SQL123 activity contract and add two bounded,
-- amount-free events. Their audience is inserted explicitly by the private
-- helpers below, so no unrelated group member receives the private signal.
ALTER TABLE public.expense_activity
  DROP CONSTRAINT expense_activity_event_entity_check,
  DROP CONSTRAINT expense_activity_event_type_check;

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
    'expense_share_collaborator_removed',
    'expense_settlement_batch_proposed', 'expense_settlement_batch_confirmed',
    'expense_settlement_batch_rejected', 'expense_settlement_batch_cancelled',
    'expense_identity_bound', 'expense_claim_disputed'
  )),
  ADD CONSTRAINT expense_activity_event_entity_check CHECK (
    (event_type IN (
        'expense_created', 'expense_updated', 'expense_cancelled',
        'expense_group_member_renamed',
        'expense_share_collaborator_added', 'expense_share_collaborator_linked',
        'expense_share_collaborator_removed',
        'expense_identity_bound', 'expense_claim_disputed'
      )
      AND entity_type = 'expense' AND group_id IS NOT NULL
      AND expense_title IS NOT NULL)
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
    OR (event_type IN (
        'expense_settlement_batch_proposed', 'expense_settlement_batch_confirmed',
        'expense_settlement_batch_rejected', 'expense_settlement_batch_cancelled'
      )
      AND entity_type = 'expense_settlement_batch'
      AND group_id IS NOT NULL AND group_title IS NOT NULL)
  );

CREATE FUNCTION public.expense_identity_request_id(
  p_scope text,
  p_request_id uuid
)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT (
    pg_catalog.substr(value.hash, 1, 8) || '-' ||
    pg_catalog.substr(value.hash, 9, 4) || '-4' ||
    pg_catalog.substr(value.hash, 14, 3) || '-8' ||
    pg_catalog.substr(value.hash, 18, 3) || '-' ||
    pg_catalog.substr(value.hash, 21, 12)
  )::uuid
  FROM (SELECT pg_catalog.md5(p_scope || ':' || p_request_id::text) AS hash) AS value;
$function$;

CREATE FUNCTION public.expense_record_private_recent(
  p_group_id uuid,
  p_actor_id uuid,
  p_recipient_user_ids uuid[],
  p_event_type text,
  p_expense_id uuid,
  p_expense_title text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_activity_id uuid := gen_random_uuid();
  v_created_at timestamptz := now();
  v_recipient_id uuid;
BEGIN
  IF p_event_type NOT IN ('expense_identity_bound', 'expense_claim_disputed')
     OR p_recipient_user_ids IS NULL
     OR pg_catalog.cardinality(p_recipient_user_ids) NOT BETWEEN 1 AND 4
     OR pg_catalog.array_position(p_recipient_user_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'expense_invalid_input';
  END IF;
  INSERT INTO public.expense_activity(
    id, group_id, event_type, entity_type, entity_id, summary_code,
    actor_user_id, actor_display_name, expense_title, group_title, created_at
  ) VALUES (
    v_activity_id, p_group_id, p_event_type, 'expense', p_expense_id,
    p_event_type, p_actor_id, 'Teskeiðarnotandi',
    pg_catalog.nullif(pg_catalog.btrim(p_expense_title), ''), NULL, v_created_at
  );
  FOREACH v_recipient_id IN ARRAY p_recipient_user_ids LOOP
    INSERT INTO public.expense_activity_audience(activity_id, user_id)
    VALUES (v_activity_id, v_recipient_id)
    ON CONFLICT DO NOTHING;
    INSERT INTO public.recent_events(
      user_id, source, event_type, entity_type, entity_id, event_key,
      payload, href, occurred_at, ack_at
    )
    SELECT v_recipient_id, 'expenses', p_event_type, 'expense', p_expense_id,
      'expenses:activity:' || v_activity_id::text,
      pg_catalog.jsonb_build_object(
        'expenseTitle', p_expense_title
      ),
      '/auth-mvp/utlagt-og-endurgreitt/utgjold/' || p_expense_id::text,
      v_created_at,
      CASE WHEN v_recipient_id = p_actor_id THEN v_created_at ELSE NULL END
    ON CONFLICT (user_id, event_key) DO NOTHING;
  END LOOP;
  RETURN v_activity_id;
END;
$function$;

CREATE FUNCTION public.expense_apply_identity_binding(
  p_actor_id uuid,
  p_group_id uuid,
  p_member_id uuid,
  p_target_user_id uuid,
  p_proof_kind text,
  p_relationship_id uuid,
  p_event_id uuid,
  p_event_participant_id uuid,
  p_cancel_pending_invitations boolean
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_group public.expense_groups%ROWTYPE;
  v_member public.expense_group_members%ROWTYPE;
  v_expense public.expenses%ROWTYPE;
  v_new_version bigint;
BEGIN
  IF p_actor_id IS NULL OR p_group_id IS NULL OR p_member_id IS NULL
     OR p_target_user_id IS NULL OR p_target_user_id = p_actor_id
     OR p_cancel_pending_invitations IS NULL
     OR (
       p_proof_kind = 'relationship'
       AND (p_relationship_id IS NULL OR p_event_id IS NOT NULL
         OR p_event_participant_id IS NOT NULL)
     )
     OR (
       p_proof_kind IN ('event_guest', 'event_organizer', 'event_current_repair')
       AND (p_relationship_id IS NOT NULL OR p_event_id IS NULL
         OR p_event_participant_id IS NULL)
     )
     OR p_proof_kind NOT IN (
       'relationship', 'event_guest', 'event_organizer', 'event_current_repair'
     ) THEN
    RAISE EXCEPTION 'expense_invalid_input';
  END IF;

  SELECT group_row.* INTO v_group
  FROM public.expense_groups AS group_row
  WHERE group_row.id = p_group_id
  FOR UPDATE;
  SELECT member.* INTO v_member
  FROM public.expense_group_members AS member
  WHERE member.group_id = p_group_id AND member.id = p_member_id
  FOR UPDATE;
  SELECT expense.* INTO v_expense
  FROM public.expenses AS expense
  WHERE expense.group_id = p_group_id
  ORDER BY expense.created_at, expense.id
  LIMIT 1;

  IF v_group.id IS NULL OR v_group.status = 'closed'
     OR v_member.id IS NULL OR v_member.role = 'owner'
     OR v_member.status <> 'active' OR v_expense.id IS NULL
     OR (v_member.user_id IS NOT NULL
       AND v_member.user_id IS DISTINCT FROM p_target_user_id)
     OR EXISTS (
       SELECT 1 FROM public.expense_group_members AS duplicate
       WHERE duplicate.group_id = p_group_id
         AND duplicate.id <> p_member_id
         AND duplicate.user_id = p_target_user_id
         AND duplicate.status IN ('active', 'invited')
     ) THEN
    RAISE EXCEPTION 'expense_member_link_not_allowed';
  END IF;

  IF v_member.user_id IS NULL THEN
    UPDATE public.expense_group_members AS member
    SET user_id = p_target_user_id,
        status = 'active'
    WHERE member.group_id = p_group_id AND member.id = p_member_id;

    IF p_cancel_pending_invitations THEN
      PERFORM public.expense_terminalize_member_invitations(
        ARRAY(
          SELECT invitation.id
          FROM public.expense_member_invitations AS invitation
          WHERE invitation.group_id = p_group_id
            AND invitation.member_id = p_member_id
            AND invitation.status = 'pending'
          ORDER BY invitation.id
        ),
        'cancelled'
      );
    END IF;

    INSERT INTO public.expense_member_identity_bindings(
      group_id, member_id, target_user_id, proof_kind, relationship_id,
      event_id, event_participant_id, bound_by_user_id
    ) VALUES (
      p_group_id, p_member_id, p_target_user_id, p_proof_kind,
      p_relationship_id, p_event_id, p_event_participant_id, p_actor_id
    );
    UPDATE public.expense_groups AS group_row
    SET financial_version = group_row.financial_version + 1
    WHERE group_row.id = p_group_id
    RETURNING group_row.financial_version INTO v_new_version;
    PERFORM public.expense_record_private_recent(
      p_group_id, p_actor_id, ARRAY[p_target_user_id],
      'expense_identity_bound', v_expense.id, v_expense.title
    );
  ELSE
    SELECT group_row.financial_version INTO v_new_version
    FROM public.expense_groups AS group_row WHERE group_row.id = p_group_id;
  END IF;
  RETURN v_new_version;
END;
$function$;

-- Canonical ordinary Relationship binding. The server derives counterpart_id;
-- browser labels, emails and user ids are never authority.
CREATE OR REPLACE FUNCTION public.expense_create_expense_with_participants(
  p_actor_id uuid, p_request_id uuid, p_expense_id uuid, p_group_id uuid,
  p_title text, p_total_minor bigint, p_currency text, p_incurred_on date,
  p_category text, p_note text, p_split_method text, p_one_off_members jsonb,
  p_payments jsonb, p_shares jsonb, p_obligations jsonb,
  p_participant_invitations jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_wrapper_request_id uuid;
  v_fingerprint text;
  v_replay jsonb;
  v_result jsonb;
  v_item jsonb;
  v_invitation_ids jsonb := '[]'::jsonb;
  v_invitation_id uuid;
  v_target_user_id uuid;
  v_group_id uuid;
  v_financial_version bigint;
BEGIN
  IF p_group_id IS NOT NULL OR pg_catalog.jsonb_typeof(p_participant_invitations) <> 'array'
     OR pg_catalog.jsonb_array_length(p_participant_invitations) > 49 THEN
    RAISE EXCEPTION 'expense_invalid_input';
  END IF;
  v_wrapper_request_id := public.expense_identity_request_id(
    'expense-create-identity-v1', p_request_id
  );
  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'requestId', p_request_id, 'expenseId', p_expense_id, 'title', p_title,
    'total', p_total_minor, 'currency', p_currency, 'incurredOn', p_incurred_on,
    'category', p_category, 'note', p_note, 'splitMethod', p_split_method,
    'members', p_one_off_members, 'payments', p_payments, 'shares', p_shares,
    'obligations', p_obligations, 'participantInvitations', p_participant_invitations
  )::text);
  v_replay := public.expense_begin_request(
    p_actor_id, v_wrapper_request_id,
    'expense_create_expense_with_identity', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  v_result := public.expense_create_expense_with_known_members(
    p_actor_id, p_request_id, p_expense_id, p_group_id, p_title, p_total_minor,
    p_currency, p_incurred_on, p_category, p_note, p_split_method,
    p_one_off_members, p_payments, p_shares, p_obligations, '[]'::jsonb
  );
  v_group_id := (v_result->>'group_id')::uuid;

  FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_participant_invitations)
  LOOP
    IF pg_catalog.jsonb_typeof(v_item) <> 'object'
       OR NOT (v_item ? 'member_id')
       OR ((v_item ? 'recipient_email') = (v_item ? 'relationship_id')) THEN
      RAISE EXCEPTION 'expense_invalid_input';
    END IF;
    IF v_item ? 'relationship_id' THEN
      SELECT relationship.counterpart_user_id INTO v_target_user_id
      FROM public.relationships AS relationship
      WHERE relationship.id = (v_item->>'relationship_id')::uuid
        AND relationship.owner_id = p_actor_id
        AND relationship.counterpart_user_id IS NOT NULL
        AND relationship.counterpart_user_id <> p_actor_id;
      IF v_target_user_id IS NULL THEN
        RAISE EXCEPTION 'expense_relationship_not_available';
      END IF;
      PERFORM public.expense_apply_identity_binding(
        p_actor_id, v_group_id, (v_item->>'member_id')::uuid,
        v_target_user_id, 'relationship', (v_item->>'relationship_id')::uuid,
        NULL, NULL, true
      );
    ELSE
      v_invitation_id := public.expense_create_unified_participant_invitation(
        p_actor_id, v_group_id, (v_item->>'member_id')::uuid,
        v_item->>'recipient_email', NULL, 'manual_email'
      );
      v_invitation_ids := v_invitation_ids || pg_catalog.jsonb_build_array(v_invitation_id);
    END IF;
    v_target_user_id := NULL;
  END LOOP;
  SELECT group_row.financial_version INTO v_financial_version
  FROM public.expense_groups AS group_row
  WHERE group_row.id = v_group_id;
  v_result := v_result || pg_catalog.jsonb_build_object(
    'invitation_ids', v_invitation_ids,
    'financial_version', v_financial_version
  );
  PERFORM public.expense_finish_request(
    p_actor_id, v_wrapper_request_id, v_result
  );
  RETURN v_result;
END;
$function$;

-- Apply the same durable Relationship rule when an existing expense gains new
-- participants. Email-only participants continue through the consent flow.
CREATE OR REPLACE FUNCTION public.expense_update_expense_with_participants(
  p_actor_id uuid, p_request_id uuid, p_expense_id uuid,
  p_expected_financial_version bigint, p_title text, p_total_minor bigint,
  p_currency text, p_incurred_on date, p_category text, p_note text,
  p_split_method text, p_preserve_shares boolean, p_new_guest_members jsonb,
  p_new_participant_invitations jsonb, p_removed_member_ids uuid[],
  p_payments jsonb, p_shares jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_wrapper_request_id uuid;
  v_fingerprint text;
  v_replay jsonb;
  v_result jsonb;
  v_item jsonb;
  v_invitation_ids jsonb := '[]'::jsonb;
  v_invitation_id uuid;
  v_target_user_id uuid;
  v_group_id uuid;
  v_financial_version bigint;
  v_removed_id uuid;
  v_removed public.expense_group_members%ROWTYPE;
  v_group_name text;
BEGIN
  IF pg_catalog.jsonb_typeof(p_new_participant_invitations) <> 'array'
     OR pg_catalog.jsonb_array_length(p_new_participant_invitations) > 48
     OR COALESCE(pg_catalog.cardinality(p_removed_member_ids), 0) > 48
     OR pg_catalog.array_position(p_removed_member_ids, NULL) IS NOT NULL
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.unnest(COALESCE(p_removed_member_ids, ARRAY[]::uuid[]))
         AS removed(id)
       GROUP BY removed.id HAVING pg_catalog.count(*) > 1
     ) THEN
    RAISE EXCEPTION 'expense_invalid_input';
  END IF;
  v_wrapper_request_id := public.expense_identity_request_id(
    'expense-update-identity-v1', p_request_id
  );
  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'requestId', p_request_id, 'expenseId', p_expense_id,
    'expectedFinancialVersion', p_expected_financial_version,
    'title', p_title, 'total', p_total_minor, 'currency', p_currency,
    'incurredOn', p_incurred_on, 'category', p_category, 'note', p_note,
    'splitMethod', p_split_method, 'preserveShares', p_preserve_shares,
    'newMembers', p_new_guest_members,
    'participantInvitations', p_new_participant_invitations,
    'removedMemberIds', p_removed_member_ids,
    'payments', p_payments, 'shares', p_shares
  )::text);
  v_replay := public.expense_begin_request(
    p_actor_id, v_wrapper_request_id,
    'expense_update_expense_with_identity', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  v_result := public.expense_update_expense(
    p_actor_id, p_request_id, p_expense_id, p_expected_financial_version,
    p_title, p_total_minor, p_currency, p_incurred_on, p_category, p_note,
    p_split_method, p_preserve_shares, p_new_guest_members, p_payments, p_shares
  );
  v_group_id := (v_result->>'group_id')::uuid;

  FOR v_item IN
    SELECT value FROM pg_catalog.jsonb_array_elements(p_new_participant_invitations)
  LOOP
    IF pg_catalog.jsonb_typeof(v_item) <> 'object'
       OR NOT (v_item ? 'member_id')
       OR ((v_item ? 'recipient_email') = (v_item ? 'relationship_id')) THEN
      RAISE EXCEPTION 'expense_invalid_input';
    END IF;
    IF v_item ? 'relationship_id' THEN
      SELECT relationship.counterpart_user_id INTO v_target_user_id
      FROM public.relationships AS relationship
      WHERE relationship.id = (v_item->>'relationship_id')::uuid
        AND relationship.owner_id = p_actor_id
        AND relationship.counterpart_user_id IS NOT NULL
        AND relationship.counterpart_user_id <> p_actor_id;
      IF v_target_user_id IS NULL THEN
        RAISE EXCEPTION 'expense_relationship_not_available';
      END IF;
      PERFORM public.expense_apply_identity_binding(
        p_actor_id, v_group_id, (v_item->>'member_id')::uuid,
        v_target_user_id, 'relationship', (v_item->>'relationship_id')::uuid,
        NULL, NULL, true
      );
    ELSE
      v_invitation_id := public.expense_create_unified_participant_invitation(
        p_actor_id, v_group_id, (v_item->>'member_id')::uuid,
        v_item->>'recipient_email', NULL, 'manual_email'
      );
      v_invitation_ids := v_invitation_ids
        || pg_catalog.jsonb_build_array(v_invitation_id);
    END IF;
    v_target_user_id := NULL;
  END LOOP;

  SELECT group_row.name INTO v_group_name
  FROM public.expense_groups AS group_row WHERE group_row.id = v_group_id;
  FOREACH v_removed_id IN ARRAY COALESCE(p_removed_member_ids, ARRAY[]::uuid[])
  LOOP
    SELECT member.* INTO v_removed
    FROM public.expense_group_members AS member
    WHERE member.group_id = v_group_id AND member.id = v_removed_id
    FOR UPDATE;
    IF v_removed.id IS NULL OR v_removed.role = 'owner'
       OR v_removed.user_id = p_actor_id
       OR EXISTS (SELECT 1 FROM public.expense_payments AS payment
         WHERE payment.group_id = v_removed.group_id
           AND payment.member_id = v_removed_id)
       OR EXISTS (SELECT 1 FROM public.expense_shares AS share
         WHERE share.group_id = v_removed.group_id
           AND share.member_id = v_removed_id)
       OR EXISTS (SELECT 1 FROM public.expense_obligations AS obligation
         WHERE obligation.group_id = v_removed.group_id
           AND (obligation.from_member_id = v_removed_id
             OR obligation.to_member_id = v_removed_id))
       OR EXISTS (SELECT 1 FROM public.expense_repayments AS repayment
         WHERE repayment.group_id = v_removed.group_id
           AND (repayment.from_member_id = v_removed_id
             OR repayment.to_member_id = v_removed_id)) THEN
      RAISE EXCEPTION 'expense_member_cannot_remove';
    END IF;
    PERFORM public.expense_terminalize_member_invitations(
      ARRAY(
        SELECT invitation.id
        FROM public.expense_member_invitations AS invitation
        WHERE invitation.group_id = v_removed.group_id
          AND invitation.member_id = v_removed_id
          AND invitation.status = 'pending'
      ),
      'cancelled'
    );
    UPDATE public.expense_group_members AS member
    SET status = 'removed'
    WHERE member.group_id = v_removed.group_id AND member.id = v_removed_id;
    PERFORM public.expense_record_activity(
      v_removed.group_id, p_actor_id,
      'expense_group_member_removed', 'expense_group', v_removed.group_id,
      'expense_group_member_removed', NULL, v_group_name,
      CASE WHEN v_removed.user_id IS NULL THEN ARRAY[]::uuid[]
        ELSE ARRAY[v_removed.user_id] END,
      true
    );
  END LOOP;

  SELECT group_row.financial_version INTO v_financial_version
  FROM public.expense_groups AS group_row WHERE group_row.id = v_group_id;
  v_result := v_result || pg_catalog.jsonb_build_object(
    'invitation_ids', v_invitation_ids,
    'financial_version', v_financial_version
  );
  PERFORM public.expense_finish_request(
    p_actor_id, v_wrapper_request_id, v_result
  );
  RETURN v_result;
END;
$function$;

-- Group-level participant additions use the same proof rule. The ordinary
-- member row is created first, then linked only from a server-owned relation.
CREATE OR REPLACE FUNCTION public.expense_add_participant(
  p_actor_id uuid,
  p_group_id uuid,
  p_request_id uuid,
  p_member jsonb,
  p_recipient_email text DEFAULT NULL,
  p_relationship_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_wrapper_request_id uuid;
  v_fingerprint text;
  v_replay jsonb;
  v_result jsonb;
  v_invitation_id uuid;
  v_target_user_id uuid;
  v_financial_version bigint;
BEGIN
  IF pg_catalog.jsonb_typeof(p_member) <> 'object'
     OR NOT (p_member ?& ARRAY['id','display_name'])
     OR (p_recipient_email IS NOT NULL AND p_relationship_id IS NOT NULL) THEN
    RAISE EXCEPTION 'expense_invalid_input';
  END IF;
  v_wrapper_request_id := public.expense_identity_request_id(
    'expense-add-participant-identity-v1', p_request_id
  );
  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'groupId', p_group_id, 'requestId', p_request_id,
    'member', p_member, 'recipientEmail', p_recipient_email,
    'relationshipId', p_relationship_id
  )::text);
  v_replay := public.expense_begin_request(
    p_actor_id, v_wrapper_request_id,
    'expense_add_participant_with_identity', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  v_result := public.expense_add_group_member(
    p_actor_id, p_group_id, p_request_id,
    pg_catalog.jsonb_build_object(
      'id', p_member->>'id', 'user_id', NULL,
      'display_name', p_member->>'display_name', 'status', 'active'
    )
  );
  IF p_relationship_id IS NOT NULL THEN
    SELECT relationship.counterpart_user_id INTO v_target_user_id
    FROM public.relationships AS relationship
    WHERE relationship.id = p_relationship_id
      AND relationship.owner_id = p_actor_id
      AND relationship.counterpart_user_id IS NOT NULL
      AND relationship.counterpart_user_id <> p_actor_id;
    IF v_target_user_id IS NULL THEN
      RAISE EXCEPTION 'expense_relationship_not_available';
    END IF;
    PERFORM public.expense_apply_identity_binding(
      p_actor_id, p_group_id, (p_member->>'id')::uuid,
      v_target_user_id, 'relationship', p_relationship_id,
      NULL, NULL, true
    );
  ELSIF p_recipient_email IS NOT NULL THEN
    v_invitation_id := public.expense_create_unified_participant_invitation(
      p_actor_id, p_group_id, (p_member->>'id')::uuid,
      p_recipient_email, NULL, 'manual_email'
    );
  END IF;
  SELECT group_row.financial_version INTO v_financial_version
  FROM public.expense_groups AS group_row WHERE group_row.id = p_group_id;
  v_result := v_result || pg_catalog.jsonb_build_object(
    'member_id', p_member->>'id',
    'financial_version', v_financial_version
  ) || CASE WHEN v_invitation_id IS NULL THEN '{}'::jsonb
    ELSE pg_catalog.jsonb_build_object('invitation_id', v_invitation_id) END;
  PERFORM public.expense_finish_request(
    p_actor_id, v_wrapper_request_id, v_result
  );
  RETURN v_result;
END;
$function$;

-- Share collaborators follow the same rule: a durable Relationship binds the
-- exact Expense member immediately; email-only input remains invitation-based.
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
AS $function$
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
  v_financial_version bigint;
BEGIN
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  IF p_actor_id IS NULL OR p_group_id IS NULL OR p_expense_id IS NULL
     OR p_share_member_id IS NULL OR p_request_id IS NULL
     OR pg_catalog.jsonb_typeof(p_member) <> 'object'
     OR NOT (p_member ?& ARRAY['id', 'display_name'])
     OR EXISTS (
       SELECT 1 FROM pg_catalog.jsonb_object_keys(p_member) AS key_name
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
  v_display_name := pg_catalog.btrim(p_member->>'display_name');
  IF v_member_id IS NULL OR pg_catalog.char_length(v_display_name) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'expense_invalid_input';
  END IF;

  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'groupId', p_group_id, 'expenseId', p_expense_id,
    'shareMemberId', p_share_member_id, 'member', p_member,
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
     OR COALESCE(v_role, '') NOT IN ('owner', 'admin')
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
    SELECT pg_catalog.count(*) FROM public.expense_group_members AS member
    WHERE member.group_id = p_group_id
      AND member.status IN ('active', 'invited')
  ) >= 50 THEN
    RAISE EXCEPTION 'expense_share_actor_conflict';
  END IF;

  IF p_relationship_id IS NOT NULL THEN
    SELECT relationship.counterpart_user_id,
           public.normalize_email_canonical(account.email)
      INTO v_target_user_id, v_target_email
    FROM public.relationships AS relationship
    JOIN auth.users AS account ON account.id = relationship.counterpart_user_id
    WHERE relationship.id = p_relationship_id
      AND relationship.owner_id = p_actor_id
      AND relationship.counterpart_user_id IS NOT NULL
      AND relationship.counterpart_user_id <> p_actor_id;
    IF v_target_user_id IS NULL THEN
      RAISE EXCEPTION 'expense_recipient_unavailable';
    END IF;
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

  IF p_relationship_id IS NOT NULL THEN
    v_financial_version := public.expense_apply_identity_binding(
      p_actor_id, p_group_id, v_member_id, v_target_user_id,
      'relationship', p_relationship_id, NULL, NULL, true
    );
  ELSIF p_recipient_email IS NOT NULL THEN
    v_invitation_id := public.expense_create_unified_participant_invitation(
      p_actor_id, p_group_id, v_member_id, p_recipient_email,
      NULL, 'manual_email'
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
  IF v_financial_version IS NULL THEN
    SELECT group_row.financial_version INTO v_financial_version
    FROM public.expense_groups AS group_row WHERE group_row.id = p_group_id;
  END IF;
  v_result := pg_catalog.jsonb_build_object(
    'group_id', p_group_id, 'expense_id', p_expense_id,
    'share_member_id', p_share_member_id, 'member_id', v_member_id,
    'collaboration_id', v_collaboration_id,
    'financial_version', v_financial_version
  ) || CASE WHEN v_invitation_id IS NULL THEN '{}'::jsonb
    ELSE pg_catalog.jsonb_build_object('invitation_id', v_invitation_id) END;
  PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$function$;

-- Event wrapper: bind only current accepted members. The temporary SQL133
-- source rows prove which Expense member was selected; SQL139 still removes
-- those rows before commit, so no historical participant-source is required.
CREATE OR REPLACE FUNCTION public.teskeid_event_create_expense_from_event_for_actor(
  p_actor_id uuid,
  p_request_id uuid,
  p_event_id uuid,
  p_expected_roster_revision bigint,
  p_link_to_event boolean,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_fingerprint text;
  v_replay jsonb;
  v_inner_request_id uuid;
  v_result jsonb;
  v_group_id uuid;
  v_expense_id uuid;
  v_import_invitation_ids uuid[] := ARRAY[]::uuid[];
  v_source record;
  v_mapping jsonb;
  v_owner_user_id uuid;
  v_owner_participant_id uuid;
  v_financial_version bigint;
BEGIN
  IF p_actor_id IS NULL OR p_request_id IS NULL OR p_event_id IS NULL
     OR p_expected_roster_revision IS NULL OR p_expected_roster_revision < 1
     OR p_link_to_event IS NULL OR p_payload IS NULL
     OR pg_catalog.jsonb_typeof(p_payload) <> 'object'
     OR pg_catalog.pg_column_size(p_payload) > 262144
     OR (
       p_payload ? 'event_organizer_members'
       AND (
         pg_catalog.jsonb_typeof(p_payload->'event_organizer_members') <> 'array'
         OR pg_catalog.jsonb_array_length(p_payload->'event_organizer_members') > 1
       )
     ) THEN
    RAISE EXCEPTION 'teskeid_event_invalid_input';
  END IF;
  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'eventId', p_event_id,
    'expectedRosterRevision', p_expected_roster_revision,
    'linkToEvent', p_link_to_event,
    'payload', p_payload
  )::text);
  v_replay := public.teskeid_event_begin_request(
    p_actor_id, p_request_id,
    'teskeid_event_create_expense_from_event', v_fingerprint, true
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  v_inner_request_id := public.teskeid_event_uuid_from_text(
    'teskeid-event-independent-expense:' || p_actor_id::text || ':' || p_request_id::text
  );
  v_result := public.teskeid_event_create_tagged_expense_for_actor(
    p_actor_id, v_inner_request_id, p_event_id,
    p_expected_roster_revision, p_payload - 'event_organizer_members'
  );
  v_group_id := (v_result->>'group_id')::uuid;
  v_expense_id := (v_result->>'expense_id')::uuid;

  FOR v_source IN
    SELECT source.expense_member_id, source.event_guest_id,
      guest.linked_user_id
    FROM public.teskeid_event_expense_participant_sources AS source
    JOIN public.teskeid_event_guests AS guest
      ON guest.event_id = source.event_id
     AND guest.id = source.event_guest_id
     AND guest.status = 'active'
     AND guest.linked_user_id IS NOT NULL
    JOIN public.teskeid_event_attendance_memberships AS membership
      ON membership.event_id = guest.event_id
     AND membership.event_guest_id = guest.id
     AND membership.user_id = guest.linked_user_id
    JOIN public.teskeid_event_guest_invitations AS accepted_invitation
      ON accepted_invitation.id = membership.accepted_invitation_id
     AND accepted_invitation.event_id = membership.event_id
     AND accepted_invitation.event_guest_id = membership.event_guest_id
     AND accepted_invitation.accepted_user_id = membership.user_id
     AND accepted_invitation.status = 'accepted'
    WHERE source.event_id = p_event_id
      AND source.group_id = v_group_id
      AND source.expense_id = v_expense_id
    ORDER BY source.expense_member_id
  LOOP
    PERFORM public.expense_apply_identity_binding(
      p_actor_id, v_group_id, v_source.expense_member_id,
      v_source.linked_user_id, 'event_guest', NULL,
      p_event_id, v_source.event_guest_id, false
    );
    -- Only a current, accepted Event identity bypasses consent. Invitations
    -- for email-only/unlinked guests remain durable and actionable.
    SELECT v_import_invitation_ids || COALESCE(
      pg_catalog.array_agg(invitation.id ORDER BY invitation.id),
      ARRAY[]::uuid[]
    ) INTO v_import_invitation_ids
    FROM public.expense_member_invitations AS invitation
    WHERE invitation.group_id = v_group_id
      AND invitation.member_id = v_source.expense_member_id
      AND invitation.status = 'pending';
  END LOOP;

  IF p_payload ? 'event_organizer_members' THEN
    SELECT event_row.owner_user_id INTO v_owner_user_id
    FROM public.teskeid_events AS event_row
    WHERE event_row.id = p_event_id;
    v_owner_participant_id := public.teskeid_event_uuid_from_text(
      'teskeid-event-owner-participant:' || p_event_id::text
    );
    FOR v_mapping IN
      SELECT value FROM pg_catalog.jsonb_array_elements(
        p_payload->'event_organizer_members'
      )
    LOOP
      IF pg_catalog.jsonb_typeof(v_mapping) <> 'object'
         OR (v_mapping - ARRAY['member_id','event_participant_id']::text[]) <> '{}'::jsonb
         OR (v_mapping->>'event_participant_id')::uuid <> v_owner_participant_id
         OR v_owner_user_id IS NULL OR v_owner_user_id = p_actor_id
         OR NOT EXISTS (
           SELECT 1 FROM pg_catalog.jsonb_array_elements(
             p_payload->'one_off_members'
           ) AS member(value)
           WHERE member.value->>'id' = v_mapping->>'member_id'
         ) THEN
        RAISE EXCEPTION 'teskeid_event_roster_conflict';
      END IF;
      PERFORM public.expense_apply_identity_binding(
        p_actor_id, v_group_id, (v_mapping->>'member_id')::uuid,
        v_owner_user_id, 'event_organizer', NULL,
        p_event_id, v_owner_participant_id, false
      );
    END LOOP;
  END IF;

  DELETE FROM public.recent_events AS recent
  WHERE recent.source = 'expenses'
    AND recent.entity_type = 'expense_member_invitation'
    AND recent.entity_id = ANY(v_import_invitation_ids);
  DELETE FROM public.expense_activity AS activity
  WHERE activity.entity_type = 'expense_member_invitation'
    AND activity.entity_id = ANY(v_import_invitation_ids);
  DELETE FROM public.expense_member_invitations AS invitation
  WHERE invitation.id = ANY(v_import_invitation_ids);

  v_result := pg_catalog.jsonb_set(
    v_result, '{invitation_ids}', COALESCE((
      SELECT pg_catalog.jsonb_agg(candidate.value ORDER BY candidate.ordinal)
      FROM pg_catalog.jsonb_array_elements_text(
        COALESCE(v_result->'invitation_ids', '[]'::jsonb)
      ) WITH ORDINALITY AS candidate(value, ordinal)
      WHERE candidate.value::uuid <> ALL(v_import_invitation_ids)
    ), '[]'::jsonb), true
  );
  DELETE FROM public.teskeid_event_expense_participant_sources AS source
  WHERE source.event_id = p_event_id
    AND source.group_id = v_group_id
    AND source.expense_id = v_expense_id;
  IF NOT p_link_to_event THEN
    DELETE FROM public.teskeid_event_expense_links AS link
    WHERE link.event_id = p_event_id
      AND link.group_id = v_group_id
      AND link.expense_id = v_expense_id;
  END IF;
  SELECT group_row.financial_version INTO v_financial_version
  FROM public.expense_groups AS group_row WHERE group_row.id = v_group_id;
  v_result := v_result || pg_catalog.jsonb_build_object(
    'financial_version', v_financial_version
  );
  PERFORM public.teskeid_event_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.expense_get_event_identity_candidates(
  p_actor_id uuid,
  p_expense_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_group_id uuid;
  v_event_id uuid;
  v_event_name text;
  v_owner_id uuid;
  v_candidates jsonb := '[]'::jsonb;
BEGIN
  SELECT expense.group_id, link.event_id, event_row.name, event_row.owner_user_id
  INTO v_group_id, v_event_id, v_event_name, v_owner_id
  FROM public.expenses AS expense
  JOIN public.teskeid_event_expense_links AS link
    ON link.group_id = expense.group_id AND link.expense_id = expense.id
  JOIN public.teskeid_events AS event_row ON event_row.id = link.event_id
  WHERE expense.id = p_expense_id
    AND expense.status = 'active'
    AND public.expense_active_member_role(p_actor_id, expense.group_id)
      IN ('owner','admin')
    AND (
      event_row.owner_user_id = p_actor_id
      OR EXISTS (
        SELECT 1
        FROM public.teskeid_event_attendance_memberships AS actor_membership
        JOIN public.teskeid_event_guests AS actor_guest
          ON actor_guest.event_id = actor_membership.event_id
         AND actor_guest.id = actor_membership.event_guest_id
         AND actor_guest.status = 'active'
         AND actor_guest.linked_user_id = actor_membership.user_id
        JOIN public.teskeid_event_guest_invitations AS actor_invitation
          ON actor_invitation.id = actor_membership.accepted_invitation_id
         AND actor_invitation.event_id = actor_membership.event_id
         AND actor_invitation.event_guest_id = actor_membership.event_guest_id
         AND actor_invitation.accepted_user_id = actor_membership.user_id
         AND actor_invitation.status = 'accepted'
        WHERE actor_membership.event_id = event_row.id
          AND actor_membership.user_id = p_actor_id
      )
    );
  IF v_group_id IS NULL THEN RETURN NULL; END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'event_participant_id', candidate.participant_id,
    'display_name', candidate.display_name
  ) ORDER BY candidate.display_name, candidate.participant_id), '[]'::jsonb)
  INTO v_candidates
  FROM (
    SELECT guest.id AS participant_id,
      CASE
        WHEN pg_catalog.char_length(pg_catalog.btrim(profile.display_name)) BETWEEN 1 AND 120
          AND pg_catalog.strpos(profile.display_name, '@') = 0
        THEN pg_catalog.btrim(profile.display_name)
        ELSE NULL
      END AS display_name,
      guest.linked_user_id AS target_user_id
    FROM public.teskeid_event_guests AS guest
    JOIN public.teskeid_event_attendance_memberships AS membership
      ON membership.event_id = guest.event_id
     AND membership.event_guest_id = guest.id
     AND membership.user_id = guest.linked_user_id
    JOIN public.teskeid_event_guest_invitations AS invitation
      ON invitation.id = membership.accepted_invitation_id
     AND invitation.event_id = membership.event_id
     AND invitation.event_guest_id = membership.event_guest_id
     AND invitation.accepted_user_id = membership.user_id
     AND invitation.status = 'accepted'
    LEFT JOIN public.profiles AS profile ON profile.id = guest.linked_user_id
    WHERE guest.event_id = v_event_id
      AND guest.status = 'active'
      AND guest.linked_user_id IS NOT NULL
      AND guest.linked_user_id IS DISTINCT FROM v_owner_id
    UNION ALL
    SELECT public.teskeid_event_uuid_from_text(
        'teskeid-event-owner-participant:' || v_event_id::text
      ),
      CASE
        WHEN pg_catalog.char_length(pg_catalog.btrim(profile.display_name)) BETWEEN 1 AND 120
          AND pg_catalog.strpos(profile.display_name, '@') = 0
        THEN pg_catalog.btrim(profile.display_name)
        ELSE NULL
      END,
      v_owner_id
    FROM (SELECT v_owner_id AS owner_user_id) AS event_owner
    LEFT JOIN public.profiles AS profile ON profile.id = event_owner.owner_user_id
  ) AS candidate
  WHERE candidate.target_user_id <> p_actor_id
    AND NOT EXISTS (
      SELECT 1 FROM public.expense_group_members AS existing
      WHERE existing.group_id = v_group_id
        AND existing.user_id = candidate.target_user_id
        AND existing.status IN ('active','invited')
    );
  RETURN pg_catalog.jsonb_build_object(
    'event_id', v_event_id,
    'event_name', v_event_name,
    'candidates', v_candidates
  );
END;
$function$;

CREATE FUNCTION public.expense_bind_member_event_identity(
  p_actor_id uuid,
  p_request_id uuid,
  p_expense_id uuid,
  p_member_id uuid,
  p_event_participant_id uuid,
  p_expected_financial_version bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_fingerprint text;
  v_replay jsonb;
  v_group public.expense_groups%ROWTYPE;
  v_expense public.expenses%ROWTYPE;
  v_actor_member public.expense_group_members%ROWTYPE;
  v_target_member public.expense_group_members%ROWTYPE;
  v_event public.teskeid_events%ROWTYPE;
  v_link public.teskeid_event_expense_links%ROWTYPE;
  v_group_id uuid;
  v_event_id uuid;
  v_target_user_id uuid;
  v_owner_participant_id uuid;
  v_proof_kind text;
  v_new_version bigint;
  v_result jsonb;
BEGIN
  IF p_actor_id IS NULL OR p_request_id IS NULL OR p_expense_id IS NULL
     OR p_member_id IS NULL OR p_event_participant_id IS NULL
     OR p_expected_financial_version IS NULL
     OR p_expected_financial_version < 0 THEN
    RAISE EXCEPTION 'expense_invalid_input';
  END IF;
  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'expenseId', p_expense_id, 'memberId', p_member_id,
    'eventParticipantId', p_event_participant_id,
    'expectedFinancialVersion', p_expected_financial_version
  )::text);
  v_replay := public.expense_begin_request(
    p_actor_id, p_request_id, 'expense_bind_member_event_identity', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  SELECT link.group_id, link.event_id INTO v_group_id, v_event_id
  FROM public.teskeid_event_expense_links AS link
  WHERE link.expense_id = p_expense_id;
  IF v_group_id IS NULL OR v_event_id IS NULL THEN
    RAISE EXCEPTION 'expense_update_not_allowed';
  END IF;
  -- Preserve SQL139's canonical mutation order: Expense group and exact
  -- Expense/member rows first, then Event/link and attendance proof.
  SELECT group_row.* INTO v_group
  FROM public.expense_groups AS group_row
  WHERE group_row.id = v_group_id
  FOR UPDATE;
  SELECT expense.* INTO v_expense
  FROM public.expenses AS expense
  WHERE expense.group_id = v_group_id AND expense.id = p_expense_id
  FOR UPDATE;
  SELECT member.* INTO v_actor_member
  FROM public.expense_group_members AS member
  WHERE member.group_id = v_group_id
    AND member.user_id = p_actor_id
    AND member.status = 'active'
    AND member.role IN ('owner','admin')
  FOR UPDATE;
  SELECT member.* INTO v_target_member
  FROM public.expense_group_members AS member
  WHERE member.group_id = v_group_id AND member.id = p_member_id
  FOR UPDATE;
  IF v_group.id IS NULL OR v_group.status = 'closed'
     OR v_group.financial_version <> p_expected_financial_version
     OR v_expense.id IS NULL OR v_expense.status <> 'active'
     OR v_actor_member.id IS NULL OR v_target_member.id IS NULL
     OR v_target_member.status <> 'active' OR v_target_member.role = 'owner'
     OR v_target_member.user_id IS NOT NULL THEN
    RAISE EXCEPTION 'expense_update_not_allowed';
  END IF;
  SELECT event_row.* INTO v_event
  FROM public.teskeid_events AS event_row
  WHERE event_row.id = v_event_id
  FOR UPDATE;
  SELECT link.* INTO v_link
  FROM public.teskeid_event_expense_links AS link
  WHERE link.event_id = v_event_id
    AND link.group_id = v_group_id
    AND link.expense_id = p_expense_id
  FOR UPDATE;
  IF v_event.id IS NULL OR v_link.expense_id IS NULL THEN
    RAISE EXCEPTION 'expense_update_not_allowed';
  END IF;
  IF v_event.owner_user_id <> p_actor_id THEN
    PERFORM actor_membership.id
    FROM public.teskeid_event_attendance_memberships AS actor_membership
    JOIN public.teskeid_event_guests AS actor_guest
      ON actor_guest.event_id = actor_membership.event_id
     AND actor_guest.id = actor_membership.event_guest_id
     AND actor_guest.status = 'active'
     AND actor_guest.linked_user_id = actor_membership.user_id
    JOIN public.teskeid_event_guest_invitations AS actor_invitation
      ON actor_invitation.id = actor_membership.accepted_invitation_id
     AND actor_invitation.event_id = actor_membership.event_id
     AND actor_invitation.event_guest_id = actor_membership.event_guest_id
     AND actor_invitation.accepted_user_id = actor_membership.user_id
     AND actor_invitation.status = 'accepted'
    WHERE actor_membership.event_id = v_event_id
      AND actor_membership.user_id = p_actor_id
    LIMIT 1
    FOR SHARE OF actor_membership, actor_guest, actor_invitation;
    IF NOT FOUND THEN RAISE EXCEPTION 'expense_update_not_allowed'; END IF;
  END IF;

  v_owner_participant_id := public.teskeid_event_uuid_from_text(
    'teskeid-event-owner-participant:' || v_event_id::text
  );
  IF p_event_participant_id = v_owner_participant_id THEN
    v_target_user_id := v_event.owner_user_id;
    v_proof_kind := 'event_current_repair';
  ELSE
    SELECT guest.linked_user_id INTO v_target_user_id
    FROM public.teskeid_event_guests AS guest
    JOIN public.teskeid_event_attendance_memberships AS membership
      ON membership.event_id = guest.event_id
     AND membership.event_guest_id = guest.id
     AND membership.user_id = guest.linked_user_id
    JOIN public.teskeid_event_guest_invitations AS invitation
      ON invitation.id = membership.accepted_invitation_id
     AND invitation.event_id = membership.event_id
     AND invitation.event_guest_id = membership.event_guest_id
     AND invitation.accepted_user_id = membership.user_id
     AND invitation.status = 'accepted'
    WHERE guest.event_id = v_event_id
      AND guest.id = p_event_participant_id
      AND guest.status = 'active'
      AND guest.linked_user_id IS NOT NULL
      AND guest.linked_user_id IS DISTINCT FROM v_event.owner_user_id
    FOR SHARE OF guest, membership, invitation;
    v_proof_kind := 'event_current_repair';
  END IF;
  IF v_target_user_id IS NULL OR v_target_user_id = p_actor_id THEN
    RAISE EXCEPTION 'expense_member_link_not_allowed';
  END IF;
  v_new_version := public.expense_apply_identity_binding(
    p_actor_id, v_group_id, p_member_id, v_target_user_id,
    v_proof_kind, NULL, v_event_id, p_event_participant_id, true
  );
  v_result := pg_catalog.jsonb_build_object(
    'expense_id', p_expense_id,
    'group_id', v_group_id,
    'event_id', v_event_id,
    'member_id', p_member_id,
    'financial_version', v_new_version
  );
  PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.expense_dispute_claim(
  p_actor_id uuid,
  p_request_id uuid,
  p_expense_id uuid,
  p_member_id uuid,
  p_expected_financial_version bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_fingerprint text;
  v_existing public.expense_mutation_requests%ROWTYPE;
  v_group public.expense_groups%ROWTYPE;
  v_expense public.expenses%ROWTYPE;
  v_member public.expense_group_members%ROWTYPE;
  v_group_id uuid;
  v_owner_user_id uuid;
  v_new_version bigint;
  v_result jsonb;
  v_inserted boolean := false;
BEGIN
  IF p_actor_id IS NULL OR p_request_id IS NULL OR p_expense_id IS NULL
     OR p_member_id IS NULL OR p_expected_financial_version IS NULL
     OR p_expected_financial_version < 0 THEN
    RAISE EXCEPTION 'expense_invalid_input';
  END IF;
  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'expenseId', p_expense_id, 'memberId', p_member_id,
    'expectedFinancialVersion', p_expected_financial_version
  )::text);
  -- This exact-member action is intentionally available without the general
  -- Expense feature entitlement. It uses the same private request table but
  -- authenticates only after locking the exact canonical member below.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_actor_id::text, 9601)
  );
  INSERT INTO public.expense_mutation_requests(
    actor_user_id, request_id, operation, fingerprint
  ) VALUES (
    p_actor_id, p_request_id, 'expense_dispute_claim', v_fingerprint
  ) ON CONFLICT (actor_user_id, request_id) DO NOTHING;
  IF NOT FOUND THEN
    SELECT request.* INTO v_existing
    FROM public.expense_mutation_requests AS request
    WHERE request.actor_user_id = p_actor_id AND request.request_id = p_request_id
    FOR UPDATE;
    IF v_existing.operation <> 'expense_dispute_claim'
       OR v_existing.fingerprint <> v_fingerprint THEN
      RAISE EXCEPTION 'expense_idempotency_conflict';
    END IF;
    IF v_existing.result IS NULL THEN RAISE EXCEPTION 'expense_idempotency_incomplete'; END IF;
    RETURN v_existing.result;
  END IF;

  SELECT expense.group_id INTO v_group_id
  FROM public.expenses AS expense
  WHERE expense.id = p_expense_id;
  IF v_group_id IS NULL THEN RAISE EXCEPTION 'expense_claim_not_allowed'; END IF;
  SELECT group_row.* INTO v_group
  FROM public.expense_groups AS group_row
  WHERE group_row.id = v_group_id
  FOR UPDATE;
  SELECT expense.* INTO v_expense
  FROM public.expenses AS expense
  WHERE expense.id = p_expense_id AND expense.group_id = v_group.id
  FOR UPDATE;
  SELECT member.* INTO v_member
  FROM public.expense_group_members AS member
  WHERE member.group_id = v_group.id AND member.id = p_member_id
  FOR UPDATE;
  IF v_group.id IS NULL OR v_group.status = 'closed'
     OR v_group.financial_version <> p_expected_financial_version
     OR v_expense.id IS NULL OR v_expense.status <> 'active'
     OR v_expense.created_by IS NOT DISTINCT FROM p_actor_id
     OR v_member.id IS NULL OR v_member.user_id IS DISTINCT FROM p_actor_id
     OR v_member.status <> 'active'
     OR NOT (
       EXISTS (
         SELECT 1 FROM public.expense_shares AS direct_share
         WHERE direct_share.group_id = v_expense.group_id
           AND direct_share.expense_id = v_expense.id
           AND direct_share.member_id = v_member.id
           AND direct_share.amount_minor > 0
       )
       OR EXISTS (
         SELECT 1
         FROM public.expense_share_collaborators AS collaboration
         JOIN public.expense_shares AS shared_share
           ON shared_share.group_id = collaboration.group_id
          AND shared_share.expense_id = collaboration.expense_id
          AND shared_share.member_id = collaboration.share_member_id
          AND shared_share.amount_minor > 0
         WHERE collaboration.group_id = v_expense.group_id
           AND collaboration.expense_id = v_expense.id
           AND collaboration.collaborator_member_id = v_member.id
           AND collaboration.status = 'active'
       )
     ) THEN
    RAISE EXCEPTION 'expense_claim_not_allowed';
  END IF;

  INSERT INTO public.expense_claim_disputes(
    group_id, expense_id, member_id, disputed_user_id
  ) VALUES (v_group.id, p_expense_id, p_member_id, p_actor_id)
  ON CONFLICT (expense_id, member_id) DO NOTHING;
  v_inserted := FOUND;
  IF NOT v_inserted AND NOT EXISTS (
    SELECT 1 FROM public.expense_claim_disputes AS dispute
    WHERE dispute.expense_id = p_expense_id
      AND dispute.member_id = p_member_id
      AND dispute.disputed_user_id = p_actor_id
      AND dispute.status = 'disputed'
  ) THEN
    RAISE EXCEPTION 'expense_claim_conflict';
  END IF;
  IF v_inserted THEN
    UPDATE public.expense_groups AS group_row
    SET financial_version = group_row.financial_version + 1
    WHERE group_row.id = v_group.id
    RETURNING group_row.financial_version INTO v_new_version;
    SELECT COALESCE(
      (
        SELECT creator_member.user_id
        FROM public.expense_group_members AS creator_member
        WHERE creator_member.group_id = v_group.id
          AND creator_member.user_id = v_expense.created_by
          AND creator_member.status = 'active'
        LIMIT 1
      ),
      owner_member.user_id
    ) INTO v_owner_user_id
    FROM public.expense_group_members AS owner_member
    WHERE owner_member.group_id = v_group.id
      AND owner_member.role = 'owner' AND owner_member.status = 'active';
    PERFORM public.expense_record_private_recent(
      v_group.id, p_actor_id,
      ARRAY[COALESCE(v_owner_user_id, p_actor_id)],
      'expense_claim_disputed', p_expense_id, v_expense.title
    );
  ELSE
    SELECT group_row.financial_version INTO v_new_version
    FROM public.expense_groups AS group_row WHERE group_row.id = v_group.id;
  END IF;
  v_result := pg_catalog.jsonb_build_object(
    'expense_id', p_expense_id,
    'group_id', v_group.id,
    'member_id', p_member_id,
    'status', 'disputed',
    'financial_version', v_new_version
  );
  UPDATE public.expense_mutation_requests AS request
  SET result = v_result, completed_at = now()
  WHERE request.actor_user_id = p_actor_id
    AND request.request_id = p_request_id
    AND request.result IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'expense_idempotency_incomplete'; END IF;
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.expense_get_claim_context(
  p_actor_id uuid,
  p_group_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_role text;
  v_result jsonb;
BEGIN
  v_role := public.expense_active_member_role(p_actor_id, p_group_id);
  IF v_role IS NULL THEN RETURN NULL; END IF;
  SELECT pg_catalog.jsonb_build_object(
    'requires_review', EXISTS (
      SELECT 1 FROM public.expense_claim_disputes AS dispute
      WHERE dispute.group_id = p_group_id AND dispute.status = 'disputed'
    ),
    'disputes', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'expense_id', dispute.expense_id,
        'member_id', dispute.member_id,
        'status', dispute.status,
        'is_self', dispute.disputed_user_id = p_actor_id
      ) ORDER BY dispute.created_at, dispute.id)
      FROM public.expense_claim_disputes AS dispute
      WHERE dispute.group_id = p_group_id
        AND (dispute.disputed_user_id = p_actor_id OR v_role IN ('owner','admin'))
    ), '[]'::jsonb),
    'bindings', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'member_id', binding.member_id,
        'proof_kind', binding.proof_kind,
        'is_self', member.user_id = p_actor_id
      ) ORDER BY binding.created_at, binding.id)
      FROM public.expense_member_identity_bindings AS binding
      JOIN public.expense_group_members AS member
        ON member.group_id = binding.group_id AND member.id = binding.member_id
      WHERE binding.group_id = p_group_id
        AND (member.user_id = p_actor_id OR v_role IN ('owner','admin'))
    ), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.expense_guard_disputed_settlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF (
    TG_OP = 'INSERT'
    OR (TG_OP = 'UPDATE' AND NEW.status = 'confirmed'
      AND OLD.status IS DISTINCT FROM NEW.status)
  ) AND EXISTS (
    SELECT 1 FROM public.expense_claim_disputes AS dispute
    WHERE dispute.group_id = NEW.group_id AND dispute.status = 'disputed'
  ) THEN
    RAISE EXCEPTION 'expense_claim_requires_review';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER expense_repayments_dispute_guard
BEFORE INSERT OR UPDATE OF status ON public.expense_repayments
FOR EACH ROW EXECUTE FUNCTION public.expense_guard_disputed_settlement();

-- Exact-current recent target resolution. Canonical active members may open
-- the exact detail even without general beta entitlement; pending invitation
-- routes remain feature-gated.
CREATE OR REPLACE FUNCTION public.expense_resolve_recent_targets(
  p_actor_id uuid,
  p_activity_ids uuid[]
)
RETURNS TABLE (activity_id uuid, href text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF p_actor_id IS NULL OR p_activity_ids IS NULL
     OR pg_catalog.cardinality(p_activity_ids) > 100
     OR pg_catalog.array_position(p_activity_ids, NULL) IS NOT NULL THEN
    RETURN;
  END IF;
  RETURN QUERY
  WITH resolved AS (
    -- Pending exact-email consent remains available only to an actor who has
    -- the general Expense entitlement. Canonical active members use the
    -- second branch and need no feature-wide entitlement for this exact item.
    SELECT activity.id,
      CASE
        WHEN invitation.status = 'pending'
          AND invitation.expires_at > now()
          AND public.expense_has_beta_access(p_actor_id)
          AND invitation.recipient_email_canonical
            = public.normalize_email_canonical(account.email)
        THEN '/auth-mvp/utlagt-og-endurgreitt/bod/adili/' || invitation.id::text
        WHEN invitation.status = 'accepted'
          AND linked_member.user_id = p_actor_id
          AND linked_member.status = 'active'
        THEN '/auth-mvp/utlagt-og-endurgreitt/hopar/' || invitation.group_id::text
        WHEN current_member.id IS NOT NULL
        THEN '/auth-mvp/utlagt-og-endurgreitt/hopar/' || invitation.group_id::text
        ELSE NULL
      END AS resolved_href,
      activity.sequence_no
    FROM public.expense_activity AS activity
    JOIN public.expense_activity_audience AS audience
      ON audience.activity_id = activity.id AND audience.user_id = p_actor_id
    JOIN public.expense_member_invitations AS invitation
      ON invitation.id = activity.entity_id
     AND invitation.group_id = activity.group_id
    JOIN auth.users AS account ON account.id = p_actor_id
    JOIN public.expense_group_members AS linked_member
      ON linked_member.group_id = invitation.group_id
     AND linked_member.id = invitation.member_id
    LEFT JOIN public.expense_group_members AS current_member
      ON current_member.group_id = invitation.group_id
     AND current_member.user_id = p_actor_id
     AND current_member.status = 'active'
    WHERE activity.id = ANY(p_activity_ids)
      AND activity.entity_type = 'expense_member_invitation'

    UNION ALL

    SELECT activity.id,
      CASE activity.entity_type
        WHEN 'expense' THEN '/auth-mvp/utlagt-og-endurgreitt/utgjold/' || activity.entity_id::text
        WHEN 'expense_repayment' THEN '/auth-mvp/utlagt-og-endurgreitt/endurgreidslur/' || activity.entity_id::text
        WHEN 'expense_group' THEN '/auth-mvp/utlagt-og-endurgreitt/hopar/' || activity.group_id::text
        WHEN 'expense_group_invitation' THEN '/auth-mvp/utlagt-og-endurgreitt/hopar/' || activity.group_id::text
        ELSE NULL
      END AS resolved_href,
      activity.sequence_no
    FROM public.expense_activity AS activity
    JOIN public.expense_activity_audience AS audience
      ON audience.activity_id = activity.id AND audience.user_id = p_actor_id
    JOIN public.expense_group_members AS membership
      ON membership.group_id = activity.group_id
     AND membership.user_id = p_actor_id
     AND membership.status = 'active'
    WHERE activity.id = ANY(p_activity_ids)
      AND activity.group_id IS NOT NULL
      AND activity.entity_type NOT IN ('payment_preference','expense_member_invitation')
      AND CASE activity.entity_type
        WHEN 'expense' THEN EXISTS (
          SELECT 1 FROM public.expenses AS expense
          WHERE expense.id = activity.entity_id AND expense.group_id = activity.group_id
        )
        WHEN 'expense_repayment' THEN EXISTS (
          SELECT 1 FROM public.expense_repayments AS repayment
          WHERE repayment.id = activity.entity_id AND repayment.group_id = activity.group_id
        )
        WHEN 'expense_group' THEN activity.entity_id = activity.group_id
        WHEN 'expense_group_invitation' THEN activity.entity_id = activity.group_id
        ELSE false
      END
  )
  SELECT resolved.id, resolved.resolved_href
  FROM resolved
  WHERE resolved.resolved_href IS NOT NULL
  ORDER BY resolved.sequence_no;
END;
$function$;

ALTER TABLE public.expense_member_identity_bindings OWNER TO postgres;
ALTER TABLE public.expense_claim_disputes OWNER TO postgres;

ALTER FUNCTION public.expense_identity_request_id(text,uuid) OWNER TO postgres;
ALTER FUNCTION public.expense_record_private_recent(uuid,uuid,uuid[],text,uuid,text) OWNER TO postgres;
ALTER FUNCTION public.expense_apply_identity_binding(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid,boolean) OWNER TO postgres;
ALTER FUNCTION public.expense_get_event_identity_candidates(uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.expense_bind_member_event_identity(uuid,uuid,uuid,uuid,uuid,bigint) OWNER TO postgres;
ALTER FUNCTION public.expense_dispute_claim(uuid,uuid,uuid,uuid,bigint) OWNER TO postgres;
ALTER FUNCTION public.expense_get_claim_context(uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.expense_guard_disputed_settlement() OWNER TO postgres;
ALTER FUNCTION public.expense_create_expense_with_participants(
  uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb
) OWNER TO postgres;
ALTER FUNCTION public.expense_update_expense_with_participants(
  uuid,uuid,uuid,bigint,text,bigint,text,date,text,text,text,boolean,jsonb,jsonb,uuid[],jsonb,jsonb
) OWNER TO postgres;
ALTER FUNCTION public.expense_add_participant(uuid,uuid,uuid,jsonb,text,uuid)
  OWNER TO postgres;
ALTER FUNCTION public.expense_add_share_collaborator(
  uuid,uuid,uuid,uuid,uuid,jsonb,text,uuid
) OWNER TO postgres;
ALTER FUNCTION public.teskeid_event_create_expense_from_event_for_actor(
  uuid,uuid,uuid,bigint,boolean,jsonb
) OWNER TO postgres;
ALTER FUNCTION public.expense_resolve_recent_targets(uuid,uuid[])
  OWNER TO postgres;

REVOKE ALL ON FUNCTION public.expense_identity_request_id(text,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_record_private_recent(uuid,uuid,uuid[],text,uuid,text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_apply_identity_binding(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid,boolean)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_guard_disputed_settlement()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.expense_get_event_identity_candidates(uuid,uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_bind_member_event_identity(uuid,uuid,uuid,uuid,uuid,bigint)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_dispute_claim(uuid,uuid,uuid,uuid,bigint)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_get_claim_context(uuid,uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.expense_get_event_identity_candidates(uuid,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_bind_member_event_identity(uuid,uuid,uuid,uuid,uuid,bigint)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_dispute_claim(uuid,uuid,uuid,uuid,bigint)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_get_claim_context(uuid,uuid)
  TO service_role;

-- CREATE OR REPLACE preserves the established service_role grants for the
-- four public wrappers. Reassert the client boundary explicitly.
REVOKE ALL ON FUNCTION public.expense_create_expense_with_participants(
  uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_update_expense_with_participants(
  uuid,uuid,uuid,bigint,text,bigint,text,date,text,text,text,boolean,jsonb,jsonb,uuid[],jsonb,jsonb
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_add_participant(uuid,uuid,uuid,jsonb,text,uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_add_share_collaborator(
  uuid,uuid,uuid,uuid,uuid,jsonb,text,uuid
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.teskeid_event_create_expense_from_event_for_actor(
  uuid,uuid,uuid,bigint,boolean,jsonb
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_resolve_recent_targets(uuid,uuid[])
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.expense_create_expense_with_participants(
  uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb
) TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_update_expense_with_participants(
  uuid,uuid,uuid,bigint,text,bigint,text,date,text,text,text,boolean,jsonb,jsonb,uuid[],jsonb,jsonb
) TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_add_participant(uuid,uuid,uuid,jsonb,text,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_add_share_collaborator(
  uuid,uuid,uuid,uuid,uuid,jsonb,text,uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.teskeid_event_create_expense_from_event_for_actor(
  uuid,uuid,uuid,bigint,boolean,jsonb
) TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_resolve_recent_targets(uuid,uuid[])
  TO service_role;

COMMENT ON TABLE public.expense_member_identity_bindings IS
  'Private proof history for canonical Expense member identity; never a financial ledger.';
COMMENT ON TABLE public.expense_claim_disputes IS
  'Private append-only recognition disputes. Identity and financial ledger rows remain unchanged.';

-- SQL141 performs no historical identity backfill and creates no dispute.
-- New application traffic cannot see this uncommitted transaction, so either
-- row here would be migration-authored drift and must roll back the release.
DO $no_historical_backfill$
BEGIN
  IF EXISTS (SELECT 1 FROM public.expense_member_identity_bindings)
     OR EXISTS (SELECT 1 FROM public.expense_claim_disputes) THEN
    RAISE EXCEPTION 'expense_141_unexpected_historical_backfill';
  END IF;
END;
$no_historical_backfill$;

COMMIT;
