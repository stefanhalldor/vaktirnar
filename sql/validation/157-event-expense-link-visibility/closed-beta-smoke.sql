-- SQL157 closed-beta privacy/authority smoke probe.
--
-- DISPOSABLE LOCAL/STAGING ONLY. Never run this against production or real
-- user data. Prepare one disposable Event with exactly one linked one-off
-- Expense and two consenting test accounts, then replace the five values in
-- sql157_probe_input below:
--
-- * manager_actor_id: non-owner active Event attendee who may manage the exact
--   Expense and has both Events and Expenses beta access;
-- * viewer_actor_id: different active Event attendee with both beta accesses,
--   but no active membership in the Expense group;
-- * event_id / expense_id: the exact disposable linked pair;
-- * environment_ack: the exact acknowledgement string shown below.
--
-- Run only after SQL157, the PostgREST schema-cache reload and a fully green
-- postflight. Use an exact current_user = session_user = postgres session.
-- The probe invokes the RPCs as service_role, writes only visibility/replay
-- state inside this transaction, and has no COMMIT path. A successful run ends
-- with sql157_closed_beta_smoke_ok and ROLLBACK.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TEMP TABLE sql157_probe_input (
  environment_ack text NOT NULL,
  manager_actor_id uuid NOT NULL,
  viewer_actor_id uuid NOT NULL,
  event_id uuid NOT NULL,
  expense_id uuid NOT NULL
) ON COMMIT DROP;

-- EDIT ONLY THIS ROW. The shipped placeholders deliberately fail closed.
INSERT INTO sql157_probe_input (
  environment_ack,
  manager_actor_id,
  viewer_actor_id,
  event_id,
  expense_id
) VALUES (
  'EDIT_ME_DISPOSABLE_LOCAL_OR_STAGING_ONLY',
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000000'
);

DO $probe_preflight$
DECLARE
  v_input sql157_probe_input%ROWTYPE;
  v_group_id uuid;
  v_event_owner_id uuid;
  v_expense_creator_id uuid;
  v_manager_role text;
  v_link_count bigint;
  v_group_expense_count bigint;
  v_payment_count bigint;
  v_payment_total numeric;
  v_request_count bigint;
BEGIN
  SELECT * INTO STRICT v_input FROM sql157_probe_input;

  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'sql157_probe_executor_must_be_postgres';
  END IF;
  IF v_input.environment_ack <>
       'I_CONFIRM_DISPOSABLE_LOCAL_OR_STAGING_ONLY' THEN
    RAISE EXCEPTION 'sql157_probe_disposable_environment_not_acknowledged';
  END IF;
  IF v_input.manager_actor_id = '00000000-0000-0000-0000-000000000000'
     OR v_input.viewer_actor_id = '00000000-0000-0000-0000-000000000000'
     OR v_input.event_id = '00000000-0000-0000-0000-000000000000'
     OR v_input.expense_id = '00000000-0000-0000-0000-000000000000'
     OR v_input.manager_actor_id = v_input.viewer_actor_id THEN
    RAISE EXCEPTION 'sql157_probe_input_invalid';
  END IF;
  IF pg_catalog.to_regprocedure(
       'public.teskeid_event_get_expense_activity_v2(uuid,uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_get_expense_link_management_v2(uuid,uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.teskeid_event_set_expense_visibility(uuid,uuid,uuid,uuid,bigint,text)'
     ) IS NULL THEN
    RAISE EXCEPTION 'sql157_probe_migration_not_installed';
  END IF;

  SELECT expense.group_id, event_row.owner_user_id, expense.created_by,
    public.expense_active_member_role(
      v_input.manager_actor_id, expense.group_id
    )
  INTO v_group_id, v_event_owner_id, v_expense_creator_id, v_manager_role
  FROM public.expenses AS expense
  JOIN public.expense_groups AS group_row
    ON group_row.id = expense.group_id
   AND group_row.kind = 'one_off'
   AND group_row.status <> 'closed'
  JOIN public.teskeid_event_expense_links AS link
    ON link.expense_id = expense.id
   AND link.group_id = expense.group_id
   AND link.event_id = v_input.event_id
  JOIN public.teskeid_events AS event_row ON event_row.id = link.event_id
  WHERE expense.id = v_input.expense_id
    AND expense.status = 'active'
    AND expense.total_minor BETWEEN 1 AND 9007199254740991;
  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'sql157_probe_exact_linked_expense_required';
  END IF;
  IF v_event_owner_id = v_input.manager_actor_id
     OR v_manager_role IS NULL
     OR (
       v_expense_creator_id IS DISTINCT FROM v_input.manager_actor_id
       AND v_manager_role NOT IN ('owner', 'admin')
     ) THEN
    RAISE EXCEPTION 'sql157_probe_non_owner_manager_authority_required';
  END IF;
  IF NOT public.teskeid_event_has_access(v_input.manager_actor_id)
     OR NOT public.expense_has_beta_access(v_input.manager_actor_id)
     OR NOT public.teskeid_event_has_access(v_input.viewer_actor_id)
     OR NOT public.expense_has_beta_access(v_input.viewer_actor_id) THEN
    RAISE EXCEPTION 'sql157_probe_both_beta_accesses_required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.teskeid_event_attendance_memberships AS membership
    JOIN public.teskeid_event_guests AS guest
      ON guest.event_id = membership.event_id
     AND guest.id = membership.event_guest_id
     AND guest.status = 'active'
     AND guest.linked_user_id = membership.user_id
    JOIN public.teskeid_event_participations AS participation
      ON participation.event_id = membership.event_id
     AND participation.event_guest_id = membership.event_guest_id
     AND participation.recipient_user_id = membership.user_id
     AND participation.access_state = 'active'
    JOIN public.teskeid_event_participation_rsvp_v3 AS decision
      ON decision.event_id = participation.event_id
     AND decision.event_guest_id = participation.event_guest_id
     AND decision.identity_generation = participation.identity_generation
     AND decision.decision_version = participation.rsvp_version
    WHERE membership.event_id = v_input.event_id
      AND membership.user_id = v_input.manager_actor_id
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.teskeid_event_attendance_memberships AS membership
    JOIN public.teskeid_event_guests AS guest
      ON guest.event_id = membership.event_id
     AND guest.id = membership.event_guest_id
     AND guest.status = 'active'
     AND guest.linked_user_id = membership.user_id
    JOIN public.teskeid_event_participations AS participation
      ON participation.event_id = membership.event_id
     AND participation.event_guest_id = membership.event_guest_id
     AND participation.recipient_user_id = membership.user_id
     AND participation.access_state = 'active'
    JOIN public.teskeid_event_participation_rsvp_v3 AS decision
      ON decision.event_id = participation.event_id
     AND decision.event_guest_id = participation.event_guest_id
     AND decision.identity_generation = participation.identity_generation
     AND decision.decision_version = participation.rsvp_version
    WHERE membership.event_id = v_input.event_id
      AND membership.user_id = v_input.viewer_actor_id
  ) THEN
    RAISE EXCEPTION 'sql157_probe_two_active_event_attendees_required';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.expense_group_members AS member
    WHERE member.group_id = v_group_id
      AND member.user_id = v_input.viewer_actor_id
      AND member.status = 'active'
  ) THEN
    RAISE EXCEPTION 'sql157_probe_viewer_must_not_be_expense_member';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.expense_claim_disputes AS dispute
    JOIN public.expense_group_members AS member
      ON member.id = dispute.member_id
     AND member.group_id = dispute.group_id
    WHERE dispute.group_id = v_group_id
      AND dispute.expense_id = v_input.expense_id
      AND member.user_id = v_input.manager_actor_id
      AND dispute.disputed_user_id = v_input.manager_actor_id
      AND dispute.status = 'disputed'
  ) THEN
    RAISE EXCEPTION 'sql157_probe_manager_must_be_undisputed';
  END IF;

  SELECT pg_catalog.count(*) INTO v_link_count
  FROM public.teskeid_event_expense_links AS link
  WHERE link.event_id = v_input.event_id;
  SELECT pg_catalog.count(*) INTO v_group_expense_count
  FROM public.expenses AS expense WHERE expense.group_id = v_group_id;
  SELECT pg_catalog.count(*),
    COALESCE(pg_catalog.sum(payment.amount_minor), 0)
  INTO v_payment_count, v_payment_total
  FROM public.expense_payments AS payment
  WHERE payment.group_id = v_group_id
    AND payment.expense_id = v_input.expense_id;
  IF v_link_count <> 1 OR v_group_expense_count <> 1
     OR v_payment_count NOT BETWEEN 1 AND 50
     OR v_payment_total <> (
       SELECT expense.total_minor FROM public.expenses AS expense
       WHERE expense.id = v_input.expense_id
     ) THEN
    RAISE EXCEPTION 'sql157_probe_minimal_valid_fixture_required';
  END IF;

  SELECT pg_catalog.count(*) INTO v_request_count
  FROM public.teskeid_event_mutation_requests AS request
  WHERE request.actor_user_id IN (
      v_input.manager_actor_id, v_input.viewer_actor_id
    )
    AND request.request_id IN (
      '15700000-0000-0000-0000-000000000001',
      '15700000-0000-0000-0000-000000000002',
      '15700000-0000-0000-0000-000000000003',
      '15700000-0000-0000-0000-000000000004'
    );
  IF v_request_count <> 0 THEN
    RAISE EXCEPTION 'sql157_probe_reserved_request_id_collision';
  END IF;

  PERFORM pg_catalog.set_config(
    'teskeid.sql157_probe.manager_actor_id',
    v_input.manager_actor_id::text, true
  );
  PERFORM pg_catalog.set_config(
    'teskeid.sql157_probe.viewer_actor_id',
    v_input.viewer_actor_id::text, true
  );
  PERFORM pg_catalog.set_config(
    'teskeid.sql157_probe.event_id', v_input.event_id::text, true
  );
  PERFORM pg_catalog.set_config(
    'teskeid.sql157_probe.expense_id', v_input.expense_id::text, true
  );
  PERFORM pg_catalog.set_config(
    'teskeid.sql157_probe.title',
    (SELECT expense.title FROM public.expenses AS expense
     WHERE expense.id = v_input.expense_id), true
  );
  PERFORM pg_catalog.set_config(
    'teskeid.sql157_probe.total_minor',
    (SELECT expense.total_minor::text FROM public.expenses AS expense
     WHERE expense.id = v_input.expense_id), true
  );
  PERFORM pg_catalog.set_config(
    'teskeid.sql157_probe.currency',
    (SELECT expense.currency FROM public.expenses AS expense
     WHERE expense.id = v_input.expense_id), true
  );
  PERFORM pg_catalog.set_config(
    'teskeid.sql157_probe.initial_revision',
    (SELECT link.link_revision::text
     FROM public.teskeid_event_expense_links AS link
     WHERE link.event_id = v_input.event_id
       AND link.expense_id = v_input.expense_id), true
  );
END;
$probe_preflight$;

-- Match the application boundary: RPCs are invoked by service_role, while the
-- SECURITY DEFINER functions retain their exact server-authoritative checks.
SET LOCAL ROLE service_role;

DO $probe_behavior$
DECLARE
  v_manager_id uuid := pg_catalog.current_setting(
    'teskeid.sql157_probe.manager_actor_id'
  )::uuid;
  v_viewer_id uuid := pg_catalog.current_setting(
    'teskeid.sql157_probe.viewer_actor_id'
  )::uuid;
  v_event_id uuid := pg_catalog.current_setting(
    'teskeid.sql157_probe.event_id'
  )::uuid;
  v_expense_id uuid := pg_catalog.current_setting(
    'teskeid.sql157_probe.expense_id'
  )::uuid;
  v_expected_title text := pg_catalog.current_setting(
    'teskeid.sql157_probe.title'
  );
  v_expected_total bigint := pg_catalog.current_setting(
    'teskeid.sql157_probe.total_minor'
  )::bigint;
  v_expected_currency text := pg_catalog.current_setting(
    'teskeid.sql157_probe.currency'
  );
  v_initial_revision bigint := pg_catalog.current_setting(
    'teskeid.sql157_probe.initial_revision'
  )::bigint;
  v_private_result jsonb;
  v_public_result jsonb;
  v_replay_result jsonb;
  v_manager_activity jsonb;
  v_viewer_activity jsonb;
  v_summary jsonb;
  v_private_revision bigint;
  v_error text;
BEGIN
  IF current_user <> 'service_role' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'sql157_probe_service_role_boundary_failed';
  END IF;

  SELECT public.teskeid_event_set_expense_visibility(
    v_manager_id,
    '15700000-0000-0000-0000-000000000001',
    v_expense_id,
    v_event_id,
    v_initial_revision,
    'participants_only'
  ) INTO v_private_result;
  IF v_private_result->>'visibility' <> 'participants_only'
     OR v_private_result->>'event_id' <> v_event_id::text
     OR v_private_result->>'expense_id' <> v_expense_id::text
     OR (v_private_result->>'link_revision') !~ '^[1-9][0-9]*$' THEN
    RAISE EXCEPTION 'sql157_probe_private_write_contract_failed';
  END IF;
  v_private_revision := (v_private_result->>'link_revision')::bigint;

  SELECT public.teskeid_event_get_expense_activity_v2(
    v_manager_id, v_event_id
  ) INTO v_manager_activity;
  IF v_manager_activity - ARRAY['status', 'expenses', 'positions']::text[]
       <> '{}'::jsonb
     OR v_manager_activity->>'status' <> 'ready'
     OR pg_catalog.jsonb_array_length(
       v_manager_activity->'expenses'
     ) <> 1
     OR pg_catalog.jsonb_array_length(
       v_manager_activity->'positions'
     ) < 1 THEN
    RAISE EXCEPTION 'sql157_probe_private_participant_projection_failed';
  END IF;

  SELECT public.teskeid_event_get_expense_activity_v2(
    v_viewer_id, v_event_id
  ) INTO v_viewer_activity;
  IF v_viewer_activity <> pg_catalog.jsonb_build_object(
       'status', 'none', 'expenses', '[]'::jsonb, 'positions', '[]'::jsonb
     ) THEN
    RAISE EXCEPTION 'sql157_probe_private_nonparticipant_leak';
  END IF;

  BEGIN
    PERFORM public.teskeid_event_get_expense_link_management_v2(
      v_viewer_id, v_expense_id
    );
    RAISE EXCEPTION 'sql157_probe_expected_management_denial_missing';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
    IF v_error = 'sql157_probe_expected_management_denial_missing' THEN
      RAISE;
    END IF;
    IF v_error <> 'expense_update_not_allowed' THEN
      RAISE EXCEPTION 'sql157_probe_wrong_management_denial:%', v_error;
    END IF;
  END;

  BEGIN
    PERFORM public.teskeid_event_set_expense_visibility(
      v_viewer_id,
      '15700000-0000-0000-0000-000000000003',
      v_expense_id,
      v_event_id,
      v_private_revision,
      'all_event'
    );
    RAISE EXCEPTION 'sql157_probe_expected_write_denial_missing';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
    IF v_error = 'sql157_probe_expected_write_denial_missing' THEN
      RAISE;
    END IF;
    IF v_error <> 'expense_update_not_allowed' THEN
      RAISE EXCEPTION 'sql157_probe_wrong_write_denial:%', v_error;
    END IF;
  END;

  SELECT public.teskeid_event_set_expense_visibility(
    v_manager_id,
    '15700000-0000-0000-0000-000000000002',
    v_expense_id,
    v_event_id,
    v_private_revision,
    'all_event'
  ) INTO v_public_result;
  IF v_public_result->>'visibility' <> 'all_event'
     OR (v_public_result->>'link_revision')::bigint
          <> v_private_revision + 1 THEN
    RAISE EXCEPTION 'sql157_probe_public_write_contract_failed';
  END IF;

  SELECT public.teskeid_event_get_expense_activity_v2(
    v_viewer_id, v_event_id
  ) INTO v_viewer_activity;
  IF v_viewer_activity - ARRAY['status', 'expenses', 'positions']::text[]
       <> '{}'::jsonb
     OR v_viewer_activity->>'status' <> 'ready'
     OR pg_catalog.jsonb_array_length(
       v_viewer_activity->'expenses'
     ) <> 1
     OR v_viewer_activity->'positions' <> '[]'::jsonb THEN
    RAISE EXCEPTION 'sql157_probe_all_event_projection_failed';
  END IF;
  v_summary := v_viewer_activity->'expenses'->0;
  IF pg_catalog.jsonb_typeof(v_summary) <> 'object'
     OR v_summary - ARRAY['title', 'total_minor', 'currency']::text[]
          <> '{}'::jsonb
     OR v_summary->>'title' IS DISTINCT FROM v_expected_title
     OR (v_summary->>'total_minor')::bigint IS DISTINCT FROM v_expected_total
     OR v_summary->>'currency' IS DISTINCT FROM v_expected_currency THEN
    RAISE EXCEPTION 'sql157_probe_attendee_safe_summary_contract_failed';
  END IF;

  SELECT public.teskeid_event_set_expense_visibility(
    v_manager_id,
    '15700000-0000-0000-0000-000000000002',
    v_expense_id,
    v_event_id,
    v_private_revision,
    'all_event'
  ) INTO v_replay_result;
  IF v_replay_result IS DISTINCT FROM v_public_result THEN
    RAISE EXCEPTION 'sql157_probe_lost_response_replay_failed';
  END IF;

  BEGIN
    PERFORM public.teskeid_event_set_expense_visibility(
      v_manager_id,
      '15700000-0000-0000-0000-000000000004',
      v_expense_id,
      v_event_id,
      v_private_revision,
      'participants_only'
    );
    RAISE EXCEPTION 'sql157_probe_expected_stale_revision_missing';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
    IF v_error = 'sql157_probe_expected_stale_revision_missing' THEN
      RAISE;
    END IF;
    IF v_error <> 'teskeid_event_link_revision_conflict' THEN
      RAISE EXCEPTION 'sql157_probe_wrong_stale_revision_error:%', v_error;
    END IF;
  END;

  RAISE NOTICE 'sql157_closed_beta_smoke_ok';
END;
$probe_behavior$;

RESET ROLE;
ROLLBACK;
