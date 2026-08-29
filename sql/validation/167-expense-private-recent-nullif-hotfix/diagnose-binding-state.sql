BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = '';
SET LOCAL timezone = 'UTC';

DO $diagnostic$
DECLARE
  v_expense_input constant text := '<REPLACE_WITH_EXACT_EXPENSE_UUID>';
  v_member_input constant text := '<REPLACE_WITH_EXACT_MEMBER_UUID>';
  v_relationship_input constant text := '<REPLACE_WITH_EXACT_RELATIONSHIP_UUID>';
  v_expected_version_input constant text :=
    '<REPLACE_WITH_EXPECTED_PRE_BIND_FINANCIAL_VERSION_OR_EMPTY>';
  v_expense_id uuid;
  v_member_id uuid;
  v_relationship_id uuid;
  v_expected_pre_version bigint;
  v_group_id uuid;
  v_actor_id uuid;
  v_target_user_id uuid;
  v_member_user_id uuid;
  v_financial_version bigint := 0;
  v_context_exact boolean := false;
  v_actor_authority_count bigint := 0;
  v_target_account_exists boolean := false;
  v_proof_count bigint := 0;
  v_exact_proof_count bigint := 0;
  v_duplicate_count bigint := 0;
  v_pending_invitation_count bigint := 0;
  v_provenance_count bigint := 0;
  v_dispute_count bigint := 0;
  v_classification text := 'STOP_PARTIAL_OR_AMBIGUOUS_BINDING_STATE';
  v_evidence_token text;
BEGIN
  <<classify>>
  BEGIN
    IF v_expense_input !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      OR v_member_input !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      OR v_relationship_input !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      OR (pg_catalog.btrim(v_expected_version_input) <> ''
        AND v_expected_version_input !~ '^[0-9]+$')
    THEN
      EXIT classify;
    END IF;

    v_expense_id := v_expense_input::uuid;
    v_member_id := v_member_input::uuid;
    v_relationship_id := v_relationship_input::uuid;
    IF pg_catalog.btrim(v_expected_version_input) <> '' THEN
      v_expected_pre_version := v_expected_version_input::bigint;
    END IF;

    SELECT expense.group_id, group_row.financial_version,
      member.user_id, relationship.owner_id, relationship.counterpart_user_id,
      expense.status = 'active'
        AND group_row.kind = 'one_off'
        AND group_row.status <> 'closed'
        AND member.status = 'active'
        AND member.role <> 'owner'
        AND relationship.counterpart_user_id IS NOT NULL
        AND relationship.counterpart_user_id <> relationship.owner_id
    INTO v_group_id, v_financial_version, v_member_user_id,
      v_actor_id, v_target_user_id, v_context_exact
    FROM public.expenses AS expense
    JOIN public.expense_groups AS group_row ON group_row.id = expense.group_id
    JOIN public.expense_group_members AS member
      ON member.group_id = group_row.id AND member.id = v_member_id
    JOIN public.relationships AS relationship ON relationship.id = v_relationship_id
    WHERE expense.id = v_expense_id;

    IF v_group_id IS NULL OR NOT COALESCE(v_context_exact, false) THEN
      EXIT classify;
    END IF;

    SELECT pg_catalog.count(*) INTO v_actor_authority_count
    FROM public.expense_group_members AS actor_member
    WHERE actor_member.group_id = v_group_id
      AND actor_member.user_id = v_actor_id
      AND actor_member.status = 'active'
      AND actor_member.role IN ('owner','admin')
      AND public.expense_active_member_role(v_actor_id, v_group_id)
        IN ('owner','admin');

    SELECT EXISTS (
      SELECT 1 FROM auth.users AS account WHERE account.id = v_target_user_id
    ) INTO v_target_account_exists;

    SELECT pg_catalog.count(*) INTO v_proof_count
    FROM public.expense_member_identity_bindings AS proof
    WHERE proof.group_id = v_group_id
      AND proof.member_id = v_member_id;

    SELECT pg_catalog.count(*) INTO v_exact_proof_count
    FROM public.expense_member_identity_bindings AS proof
    WHERE proof.group_id = v_group_id
      AND proof.member_id = v_member_id
      AND proof.target_user_id = v_target_user_id
      AND proof.proof_kind = 'relationship'
      AND proof.relationship_id = v_relationship_id;

    SELECT pg_catalog.count(*) INTO v_duplicate_count
    FROM public.expense_group_members AS represented
    WHERE represented.group_id = v_group_id
      AND represented.id <> v_member_id
      AND represented.user_id = v_target_user_id
      AND represented.status IN ('active','invited');

    SELECT pg_catalog.count(*) INTO v_pending_invitation_count
    FROM public.expense_member_invitations AS invitation
    WHERE invitation.group_id = v_group_id
      AND invitation.member_id = v_member_id
      AND invitation.status = 'pending';

    SELECT pg_catalog.count(*) INTO v_provenance_count
    FROM public.teskeid_event_expense_participant_sources AS source
    WHERE source.group_id = v_group_id
      AND source.expense_id = v_expense_id
      AND source.expense_member_id = v_member_id;

    SELECT pg_catalog.count(*) INTO v_dispute_count
    FROM public.expense_claim_disputes AS dispute
    WHERE dispute.group_id = v_group_id AND dispute.status = 'disputed';

    IF v_actor_authority_count = 1
      AND v_target_account_exists
      AND v_member_user_id IS NULL
      AND v_expected_pre_version IS NULL
      AND v_proof_count = 0
      AND v_duplicate_count = 0
      AND v_provenance_count = 0
      AND v_dispute_count = 0
    THEN
      v_classification := 'READY_NO_PARTIAL_BINDING';
    ELSIF v_actor_authority_count = 1
      AND v_target_account_exists
      AND v_member_user_id = v_target_user_id
      AND v_expected_pre_version IS NOT NULL
      AND v_financial_version = v_expected_pre_version + 1
      AND v_proof_count = 1
      AND v_exact_proof_count = 1
      AND v_duplicate_count = 0
      AND v_pending_invitation_count = 0
      AND v_provenance_count = 0
      AND v_dispute_count = 0
    THEN
      v_classification := 'BOUND_EXACTLY_ONCE';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_classification := 'STOP_PARTIAL_OR_AMBIGUOUS_BINDING_STATE';
  END classify;

  v_evidence_token := pg_catalog.md5(pg_catalog.concat_ws(
    '|', 'sql167-binding-state-v1', v_classification,
    COALESCE(v_expense_id::text, ''::text),
    COALESCE(v_member_id::text, ''::text),
    COALESCE(v_relationship_id::text, ''::text),
    COALESCE(v_actor_id::text, ''::text),
    COALESCE(v_target_user_id::text, ''::text),
    v_financial_version::text, v_proof_count::text,
    v_exact_proof_count::text,
    v_duplicate_count::text, v_pending_invitation_count::text,
    v_provenance_count::text, v_dispute_count::text
  ));

  PERFORM pg_catalog.set_config(
    'teskeid.sql167_binding_state_result',
    pg_catalog.jsonb_build_object(
      'classification', v_classification,
      'context_exact', COALESCE(v_context_exact, false),
      'actor_authority_exact', v_actor_authority_count = 1,
      'target_account_exists', v_target_account_exists,
      'member_unregistered', v_member_user_id IS NULL,
      'member_bound_to_target', v_member_user_id = v_target_user_id,
      'proof_count', v_proof_count,
      'exact_proof_count', v_exact_proof_count,
      'duplicate_count', v_duplicate_count,
      'pending_invitation_count', v_pending_invitation_count,
      'provenance_count', v_provenance_count,
      'dispute_count', v_dispute_count,
      'financial_version', v_financial_version,
      'evidence_token', v_evidence_token
    )::text,
    true
  );
END;
$diagnostic$;

SELECT pg_catalog.current_setting(
  'teskeid.sql167_binding_state_result', true
)::jsonb AS diagnostic;

ROLLBACK;
