-- SQL173 MIGRATION: creator-only permanent deletion of safe, unsettled expenses.
--
-- The public capability is read through a service-role RPC. The mutation is
-- serialized with the existing group/expense locks, is idempotent, and keeps
-- only an opaque expense-id tombstone plus any already-existing finalization
-- replay record. No expense title, amount, participant, email or payload is
-- added to retained state.
--
-- Installation changes schema, functions, triggers and exact ACL/RLS catalog
-- state. It does not change auth configuration and never invokes runtime
-- deletion or inserts, updates or deletes an existing application-data row.

BEGIN;

-- Transaction-local exact catalog manifests are shared by the predecessor
-- gate and the installed-state postflight. They never touch application data.
CREATE TEMP TABLE expense_sql173_expected_fks (
  relation_schema text NOT NULL,
  relation_name text NOT NULL,
  constraint_name text NOT NULL,
  exact_definition text NOT NULL,
  present_when_installed boolean NOT NULL,
  is_deferrable boolean NOT NULL,
  is_initially_deferred boolean NOT NULL
) ON COMMIT DROP;

INSERT INTO pg_temp.expense_sql173_expected_fks VALUES
  ('public','expense_claim_disputes','expense_claim_disputes_expense_fk','FOREIGN KEY (group_id, expense_id) REFERENCES expenses(group_id, id) ON DELETE CASCADE',true,false,false),
  ('public','expense_edit_revision_bindings','expense_edit_revision_bindings_expense_id_fkey','FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE RESTRICT',true,false,false),
  ('public','expense_member_invitations','expense_member_invitations_shared_expense_fk','FOREIGN KEY (group_id, shared_expense_id) REFERENCES expenses(group_id, id) ON DELETE RESTRICT',true,false,false),
  ('public','expense_member_name_revisions','expense_member_name_revisions_group_expense_fk','FOREIGN KEY (group_id, expense_id) REFERENCES expenses(group_id, id) ON DELETE RESTRICT',true,false,false),
  ('public','expense_payments','expense_payments_group_expense_fk','FOREIGN KEY (group_id, expense_id) REFERENCES expenses(group_id, id) ON DELETE CASCADE',true,false,false),
  ('public','expense_private_drafts','expense_private_drafts_expense_id_fkey','FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE',true,false,false),
  ('public','expense_revisions','expense_revisions_group_expense_fk','FOREIGN KEY (group_id, expense_id) REFERENCES expenses(group_id, id) ON DELETE RESTRICT',true,false,false),
  ('public','expense_share_collaborators','expense_share_collaborators_group_expense_fk','FOREIGN KEY (group_id, expense_id) REFERENCES expenses(group_id, id) ON DELETE RESTRICT',true,false,false),
  ('public','expense_shares','expense_shares_group_expense_fk','FOREIGN KEY (group_id, expense_id) REFERENCES expenses(group_id, id) ON DELETE CASCADE',true,false,false),
  ('public','expense_unconfirmed_finalizations','expense_unconfirmed_finalizations_expense_fk','FOREIGN KEY (group_id, expense_id) REFERENCES expenses(group_id, id)',false,false,false),
  ('public','teskeid_event_expense_links','teskeid_event_expense_links_expense_fk','FOREIGN KEY (group_id, expense_id) REFERENCES expenses(group_id, id) ON DELETE RESTRICT',true,false,false),
  ('public','expense_activity','expense_activity_group_id_fkey','FOREIGN KEY (group_id) REFERENCES expense_groups(id) ON DELETE RESTRICT',true,false,false),
  ('public','expense_edit_revision_bindings','expense_edit_revision_bindings_group_id_fkey','FOREIGN KEY (group_id) REFERENCES expense_groups(id) ON DELETE RESTRICT',true,false,false),
  ('public','expense_event_contexts','expense_event_contexts_group_fk','FOREIGN KEY (group_id) REFERENCES expense_groups(id) ON DELETE RESTRICT',true,false,false),
  ('public','expense_group_members','expense_group_members_group_id_fkey','FOREIGN KEY (group_id) REFERENCES expense_groups(id) ON DELETE CASCADE',true,false,false),
  ('public','expense_obligations','expense_obligations_group_id_fkey','FOREIGN KEY (group_id) REFERENCES expense_groups(id) ON DELETE RESTRICT',true,false,false),
  ('public','expense_payment_preference_assignments','expense_payment_preference_assignments_group_id_fkey','FOREIGN KEY (group_id) REFERENCES expense_groups(id) ON DELETE CASCADE',true,false,false),
  ('public','expense_private_drafts','expense_private_drafts_group_id_fkey','FOREIGN KEY (group_id) REFERENCES expense_groups(id) ON DELETE CASCADE',true,false,false),
  ('public','expense_repayments','expense_repayments_group_id_fkey','FOREIGN KEY (group_id) REFERENCES expense_groups(id) ON DELETE RESTRICT',true,false,false),
  ('public','expense_revisions','expense_revisions_group_id_fkey','FOREIGN KEY (group_id) REFERENCES expense_groups(id) ON DELETE RESTRICT',true,false,false),
  ('public','expense_settlement_batch_items','expense_settlement_batch_items_group_fk','FOREIGN KEY (group_id) REFERENCES expense_groups(id) ON DELETE RESTRICT',true,false,false),
  ('public','expenses','expenses_group_id_fkey','FOREIGN KEY (group_id) REFERENCES expense_groups(id) ON DELETE RESTRICT',true,false,false),
  ('public','relationship_circle_expense_contexts','relationship_circle_expense_contexts_group_id_fkey','FOREIGN KEY (group_id) REFERENCES expense_groups(id) ON DELETE RESTRICT',true,false,false),
  ('public','expense_member_name_revisions','expense_member_name_revisions_group_member_fk','FOREIGN KEY (group_id, member_id) REFERENCES expense_group_members(group_id, id) ON DELETE RESTRICT',true,false,false),
  ('public','expense_share_collaborators','expense_share_collaborators_group_share_member_fk','FOREIGN KEY (group_id, share_member_id) REFERENCES expense_group_members(group_id, id) ON DELETE RESTRICT',true,false,false),
  ('public','expense_share_collaborators','expense_share_collaborators_group_actor_member_fk','FOREIGN KEY (group_id, collaborator_member_id) REFERENCES expense_group_members(group_id, id) ON DELETE RESTRICT',true,false,false),
  ('public','expense_settlement_batch_items','expense_settlement_batch_items_from_member_fk','FOREIGN KEY (group_id, from_member_id) REFERENCES expense_group_members(group_id, id) ON DELETE RESTRICT',true,false,false),
  ('public','expense_settlement_batch_items','expense_settlement_batch_items_to_member_fk','FOREIGN KEY (group_id, to_member_id) REFERENCES expense_group_members(group_id, id) ON DELETE RESTRICT',true,false,false),
  ('public','expense_event_participants','expense_event_participants_member_fk','FOREIGN KEY (group_id, member_id) REFERENCES expense_group_members(group_id, id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED',true,true,true),
  ('public','teskeid_event_expense_participant_sources','teskeid_event_expense_sources_member_fk','FOREIGN KEY (group_id, expense_member_id) REFERENCES expense_group_members(group_id, id) ON DELETE RESTRICT',true,false,false),
  ('public','expense_member_identity_bindings','expense_member_identity_bindings_member_fk','FOREIGN KEY (group_id, member_id) REFERENCES expense_group_members(group_id, id) ON DELETE CASCADE',true,false,false),
  ('public','expense_claim_disputes','expense_claim_disputes_member_fk','FOREIGN KEY (group_id, member_id) REFERENCES expense_group_members(group_id, id) ON DELETE RESTRICT',true,false,false),
  ('public','expense_payments','expense_payments_group_member_fk','FOREIGN KEY (group_id, member_id) REFERENCES expense_group_members(group_id, id) ON DELETE RESTRICT',true,false,false),
  ('public','expense_shares','expense_shares_group_member_fk','FOREIGN KEY (group_id, member_id) REFERENCES expense_group_members(group_id, id) ON DELETE RESTRICT',true,false,false),
  ('public','expense_obligations','expense_obligations_group_from_member_fk','FOREIGN KEY (group_id, from_member_id) REFERENCES expense_group_members(group_id, id) ON DELETE RESTRICT',true,false,false),
  ('public','expense_obligations','expense_obligations_group_to_member_fk','FOREIGN KEY (group_id, to_member_id) REFERENCES expense_group_members(group_id, id) ON DELETE RESTRICT',true,false,false),
  ('public','expense_repayments','expense_repayments_group_from_member_fk','FOREIGN KEY (group_id, from_member_id) REFERENCES expense_group_members(group_id, id) ON DELETE RESTRICT',true,false,false),
  ('public','expense_repayments','expense_repayments_group_to_member_fk','FOREIGN KEY (group_id, to_member_id) REFERENCES expense_group_members(group_id, id) ON DELETE RESTRICT',true,false,false),
  ('public','expense_member_invitations','expense_member_invitations_group_member_fk','FOREIGN KEY (group_id, member_id) REFERENCES expense_group_members(group_id, id) ON DELETE CASCADE',true,false,false),
  ('public','expense_revisions','expense_revisions_activity_id_fkey','FOREIGN KEY (activity_id) REFERENCES expense_activity(id) ON DELETE RESTRICT',true,false,false),
  ('public','expense_member_name_revisions','expense_member_name_revisions_activity_id_fkey','FOREIGN KEY (activity_id) REFERENCES expense_activity(id) ON DELETE RESTRICT',true,false,false),
  ('public','expense_activity_audience','expense_activity_audience_activity_id_fkey','FOREIGN KEY (activity_id) REFERENCES expense_activity(id) ON DELETE CASCADE',true,false,false),
  ('public','teskeid_event_expense_participant_sources','teskeid_event_expense_sources_link_fk','FOREIGN KEY (event_id, group_id, expense_id) REFERENCES teskeid_event_expense_links(event_id, group_id, expense_id) ON DELETE CASCADE',true,false,false),
  ('public','expense_settlement_batch_items','expense_settlement_batch_items_obligation_fk','FOREIGN KEY (group_id, obligation_id) REFERENCES expense_obligations(group_id, id) ON DELETE RESTRICT',true,false,false),
  ('public','expense_repayment_allocations','expense_repayment_allocations_group_obligation_fk','FOREIGN KEY (group_id, obligation_id) REFERENCES expense_obligations(group_id, id) ON DELETE RESTRICT',true,false,false),
  ('public','expense_share_collaborators','expense_share_collaborators_expense_share_fk','FOREIGN KEY (expense_id, share_member_id) REFERENCES expense_shares(expense_id, member_id) ON DELETE RESTRICT',true,false,false),
  ('public','expense_member_invitations','expense_member_invitations_shared_share_fk','FOREIGN KEY (shared_expense_id, shared_share_member_id) REFERENCES expense_shares(expense_id, member_id) ON DELETE RESTRICT',true,false,false),
  ('public','expense_edit_revision_bindings','expense_edit_revision_bindings_draft_id_fkey','FOREIGN KEY (draft_id) REFERENCES expense_private_drafts(id) ON DELETE RESTRICT',true,false,false);

CREATE TEMP TABLE expense_sql173_expected_triggers (
  relation_name text NOT NULL,
  trigger_name text NOT NULL,
  function_signature text NOT NULL,
  trigger_type smallint NOT NULL,
  is_constraint boolean NOT NULL,
  is_deferrable boolean NOT NULL,
  is_initially_deferred boolean NOT NULL,
  update_columns text[] NOT NULL,
  has_when boolean NOT NULL,
  present_in_predecessor boolean NOT NULL
) ON COMMIT DROP;

INSERT INTO pg_temp.expense_sql173_expected_triggers VALUES
  ('expense_group_members','expense_event_group_members_frozen_guard','public.expense_event_roster_frozen()',31::smallint,false,false,false,ARRAY[]::text[],false,true),
  ('expense_group_members','expense_group_members_cancel_batches_before_unlink','public.expense_cancel_batches_before_user_unlink()',19::smallint,false,false,false,ARRAY['user_id']::text[],true,true),
  ('expense_group_members','expense_group_members_touch_updated_at','public.expense_touch_updated_at()',19::smallint,false,false,false,ARRAY[]::text[],false,true),
  ('expense_group_members','expense_tes24_edit_member_authority_guard','public.expense_guard_edit_revision_member_authority_v1()',19::smallint,false,false,false,ARRAY['role','status','user_id']::text[],false,true),
  ('expense_group_members','teskeid_event_cleanup_attendee_expense_links_before_unlink','public.teskeid_event_cleanup_attendee_expense_links()',19::smallint,false,false,false,ARRAY['user_id']::text[],true,true),
  ('expense_group_members','teskeid_event_expense_members_integrity_deferred','public.teskeid_event_financial_parent_integrity_trigger()',25::smallint,true,true,true,ARRAY[]::text[],false,true),
  ('expense_event_contexts','expense_event_context_immutable_guard','public.expense_event_context_immutable()',19::smallint,false,false,false,ARRAY[]::text[],false,true),
  ('expense_event_contexts','expense_event_context_integrity_deferred','public.expense_event_integrity_trigger()',29::smallint,true,true,true,ARRAY[]::text[],false,true),
  ('expense_event_participants','expense_event_participant_immutable_guard','public.expense_event_participant_immutable()',19::smallint,false,false,false,ARRAY[]::text[],false,true),
  ('expense_event_participants','expense_event_participant_integrity_deferred','public.expense_event_integrity_trigger()',29::smallint,true,true,true,ARRAY[]::text[],false,true),
  ('expense_groups','expense_event_group_integrity_deferred','public.expense_event_group_integrity_trigger()',25::smallint,true,true,true,ARRAY[]::text[],false,true),
  ('expense_groups','expense_groups_touch_updated_at','public.expense_touch_updated_at()',19::smallint,false,false,false,ARRAY[]::text[],false,true),
  ('expense_groups','expense_tes24_edit_group_lifecycle_guard','public.expense_guard_edit_revision_group_lifecycle_v1()',19::smallint,false,false,false,ARRAY['status']::text[],false,true),
  ('expense_groups','teskeid_event_expense_groups_integrity_deferred','public.teskeid_event_financial_parent_integrity_trigger()',25::smallint,true,true,true,ARRAY[]::text[],false,true),
  ('expense_member_invitations','expense_event_member_invitations_guard','public.expense_event_invitation_blocked()',23::smallint,false,false,false,ARRAY[]::text[],false,true),
  ('expense_member_invitations','expense_member_invitations_touch_updated_at','public.expense_touch_updated_at()',19::smallint,false,false,false,ARRAY[]::text[],false,true),
  ('expense_member_name_revisions','expense_member_name_revisions_immutable_guard','public.expense_member_name_revision_immutable()',27::smallint,false,false,false,ARRAY[]::text[],false,true),
  ('expense_payment_preference_assignments','expense_preference_assignments_touch_updated_at','public.expense_touch_updated_at()',19::smallint,false,false,false,ARRAY[]::text[],false,true),
  ('expense_private_drafts','expense_sql159_finalized_draft_insert_guard','public.expense_sql159_guard_private_draft_insert()',7::smallint,false,false,false,ARRAY[]::text[],false,true),
  ('expense_private_drafts','expense_sql159_private_draft_delete_guard','public.expense_sql159_guard_private_draft_delete()',11::smallint,false,false,false,ARRAY[]::text[],false,true),
  ('expense_repayments','expense_repayments_batch_guard','public.expense_guard_batch_repayment_mutation()',19::smallint,false,false,false,ARRAY[]::text[],false,true),
  ('expense_repayments','expense_repayments_dispute_guard','public.expense_guard_disputed_settlement()',23::smallint,false,false,false,ARRAY['status']::text[],false,true),
  ('expense_repayments','expense_repayments_encrypted_snapshot','public.expense_attach_encrypted_payment_snapshot()',7::smallint,false,false,false,ARRAY[]::text[],false,true),
  ('expense_repayments','expense_repayments_review_guard','public.expense_guard_new_reported_repayment()',7::smallint,false,false,false,ARRAY[]::text[],false,true),
  ('expense_repayments','expense_repayments_touch_updated_at','public.expense_touch_updated_at()',19::smallint,false,false,false,ARRAY[]::text[],false,true),
  ('expense_repayments','expense_tes24_repayment_confirmation_guard','public.expense_guard_repayment_confirmation_eligibility_v1()',19::smallint,false,false,false,ARRAY['status']::text[],false,true),
  ('expense_revisions','expense_revisions_immutable_guard','public.expense_revisions_immutable()',27::smallint,false,false,false,ARRAY[]::text[],false,true),
  ('expense_settlement_batch_items','expense_settlement_batch_items_immutable_guard','public.expense_guard_settlement_batch_item_mutation()',27::smallint,false,false,false,ARRAY[]::text[],false,true),
  ('expense_share_collaborators','expense_share_collaborators_immutable_guard','public.expense_guard_share_collaborator_mutation()',27::smallint,false,false,false,ARRAY[]::text[],false,true),
  ('expenses','expense_tes24_edit_expense_lifecycle_guard','public.expense_guard_edit_revision_expense_lifecycle_v1()',19::smallint,false,false,false,ARRAY[]::text[],false,true),
  ('expenses','expenses_touch_updated_at','public.expense_touch_updated_at()',19::smallint,false,false,false,ARRAY[]::text[],false,true),
  ('expenses','teskeid_event_expenses_integrity_deferred','public.teskeid_event_financial_parent_integrity_trigger()',29::smallint,true,true,true,ARRAY[]::text[],false,true),
  ('teskeid_event_expense_links','teskeid_event_expense_links_immutable_guard','public.teskeid_event_guard_expense_link_visibility_update()',19::smallint,false,false,false,ARRAY[]::text[],false,true),
  ('teskeid_event_expense_links','teskeid_event_expense_links_integrity_deferred','public.teskeid_event_expense_link_integrity_trigger()',21::smallint,true,true,true,ARRAY[]::text[],false,true),
  ('teskeid_event_expense_participant_sources','teskeid_event_expense_sources_immutable_guard','public.teskeid_event_immutable_history()',19::smallint,false,false,false,ARRAY[]::text[],false,true),
  ('expense_deleted_expense_tombstones','expense_deleted_tombstones_immutable_guard','public.expense_deleted_tombstone_immutable()',27::smallint,false,false,false,ARRAY[]::text[],false,false),
  ('expenses','expenses_deleted_id_reuse_guard','public.expense_reject_deleted_id_reuse()',7::smallint,false,false,false,ARRAY[]::text[],false,false),
  ('expense_unconfirmed_finalizations','expense_unconfirmed_finalizations_expense_reference_guard','public.expense_validate_finalization_expense_reference()',23::smallint,false,false,false,ARRAY['expense_id','group_id']::text[],false,false),
  ('relationship_sources','relationship_sources_expense_live_context_guard','public.expense_validate_relationship_source_live_context()',23::smallint,false,false,false,ARRAY['relationship_id','source_id','source_type']::text[],false,false);

CREATE TEMP TABLE expense_sql173_relevant_trigger_relations (
  relation_name text PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO pg_temp.expense_sql173_relevant_trigger_relations VALUES
  ('expense_activity'),('expense_activity_audience'),('expense_claim_disputes'),
  ('expense_deleted_expense_tombstones'),('expense_edit_revision_bindings'),
  ('expense_event_contexts'),('expense_event_participants'),
  ('expense_group_members'),('expense_groups'),('expense_hard_delete_authorizations'),
  ('expense_member_identity_bindings'),('expense_member_invitations'),
  ('expense_member_name_revisions'),('expense_obligations'),
  ('expense_payment_preference_assignments'),('expense_payments'),
  ('expense_private_drafts'),('expense_repayment_allocations'),('expense_repayments'),('expense_revisions'),
  ('expense_settlement_batch_items'),('expense_share_collaborators'),('expense_shares'),
  ('expenses'),('recent_events'),('relationship_circle_expense_contexts'),
  ('relationship_sources'),('expense_mutation_requests'),('teskeid_event_expense_links'),
  ('teskeid_event_expense_participant_sources'),('expense_unconfirmed_finalizations');

DO $preflight$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF pg_catalog.to_regclass('public.expenses') IS NULL THEN v_missing := pg_catalog.array_append(v_missing, 'expenses'); END IF;
  IF pg_catalog.to_regclass('public.expense_groups') IS NULL THEN v_missing := pg_catalog.array_append(v_missing, 'expense_groups'); END IF;
  IF pg_catalog.to_regclass('public.expense_group_members') IS NULL THEN v_missing := pg_catalog.array_append(v_missing, 'expense_group_members'); END IF;
  IF pg_catalog.to_regclass('public.expense_activity_audience') IS NULL THEN v_missing := pg_catalog.array_append(v_missing, 'expense_activity_audience'); END IF;
  IF pg_catalog.to_regclass('public.expense_claim_disputes') IS NULL THEN v_missing := pg_catalog.array_append(v_missing, 'expense_claim_disputes'); END IF;
  IF pg_catalog.to_regclass('public.expense_private_drafts') IS NULL THEN v_missing := pg_catalog.array_append(v_missing, 'expense_private_drafts'); END IF;
  IF pg_catalog.to_regclass('public.expense_unconfirmed_publications') IS NULL THEN v_missing := pg_catalog.array_append(v_missing, 'expense_unconfirmed_publications'); END IF;
  IF pg_catalog.to_regclass('public.expense_edit_revision_bindings') IS NULL THEN v_missing := pg_catalog.array_append(v_missing, 'expense_edit_revision_bindings'); END IF;
  IF pg_catalog.to_regclass('public.expense_revisions') IS NULL THEN v_missing := pg_catalog.array_append(v_missing, 'expense_revisions'); END IF;
  IF pg_catalog.to_regclass('public.expense_member_name_revisions') IS NULL THEN v_missing := pg_catalog.array_append(v_missing, 'expense_member_name_revisions'); END IF;
  IF pg_catalog.to_regclass('public.expense_member_identity_bindings') IS NULL THEN v_missing := pg_catalog.array_append(v_missing, 'expense_member_identity_bindings'); END IF;
  IF pg_catalog.to_regclass('public.expense_share_collaborators') IS NULL THEN v_missing := pg_catalog.array_append(v_missing, 'expense_share_collaborators'); END IF;
  IF pg_catalog.to_regclass('public.expense_shares') IS NULL THEN v_missing := pg_catalog.array_append(v_missing, 'expense_shares'); END IF;
  IF pg_catalog.to_regclass('public.expense_payments') IS NULL THEN v_missing := pg_catalog.array_append(v_missing, 'expense_payments'); END IF;
  IF pg_catalog.to_regclass('public.expense_member_invitations') IS NULL THEN v_missing := pg_catalog.array_append(v_missing, 'expense_member_invitations'); END IF;
  IF pg_catalog.to_regclass('public.expense_activity') IS NULL THEN v_missing := pg_catalog.array_append(v_missing, 'expense_activity'); END IF;
  IF pg_catalog.to_regclass('public.recent_events') IS NULL THEN v_missing := pg_catalog.array_append(v_missing, 'recent_events'); END IF;
  IF pg_catalog.to_regclass('public.expense_obligations') IS NULL THEN v_missing := pg_catalog.array_append(v_missing, 'expense_obligations'); END IF;
  IF pg_catalog.to_regclass('public.expense_payment_preference_assignments') IS NULL THEN v_missing := pg_catalog.array_append(v_missing, 'expense_payment_preference_assignments'); END IF;
  IF pg_catalog.to_regclass('public.expense_repayments') IS NULL THEN v_missing := pg_catalog.array_append(v_missing, 'expense_repayments'); END IF;
  IF pg_catalog.to_regclass('public.expense_repayment_allocations') IS NULL THEN v_missing := pg_catalog.array_append(v_missing, 'expense_repayment_allocations'); END IF;
  IF pg_catalog.to_regclass('public.expense_settlement_batch_items') IS NULL THEN v_missing := pg_catalog.array_append(v_missing, 'expense_settlement_batch_items'); END IF;
  IF pg_catalog.to_regclass('public.expense_unconfirmed_finalizations') IS NULL THEN v_missing := pg_catalog.array_append(v_missing, 'expense_unconfirmed_finalizations'); END IF;
  IF pg_catalog.to_regclass('public.teskeid_event_expense_links') IS NULL THEN v_missing := pg_catalog.array_append(v_missing, 'teskeid_event_expense_links'); END IF;
  IF pg_catalog.to_regclass('public.teskeid_event_expense_participant_sources') IS NULL THEN v_missing := pg_catalog.array_append(v_missing, 'teskeid_event_expense_participant_sources'); END IF;
  IF pg_catalog.to_regclass('public.expense_event_contexts') IS NULL THEN v_missing := pg_catalog.array_append(v_missing, 'expense_event_contexts'); END IF;
  IF pg_catalog.to_regclass('public.expense_event_participants') IS NULL THEN v_missing := pg_catalog.array_append(v_missing, 'expense_event_participants'); END IF;
  IF pg_catalog.to_regclass('public.relationship_circle_expense_contexts') IS NULL THEN v_missing := pg_catalog.array_append(v_missing, 'relationship_circle_expense_contexts'); END IF;
  IF pg_catalog.to_regclass('public.relationships') IS NULL THEN v_missing := pg_catalog.array_append(v_missing, 'relationships'); END IF;
  IF pg_catalog.to_regclass('public.relationship_sources') IS NULL THEN v_missing := pg_catalog.array_append(v_missing, 'relationship_sources'); END IF;
  IF pg_catalog.to_regclass('public.expense_mutation_requests') IS NULL THEN v_missing := pg_catalog.array_append(v_missing, 'expense_mutation_requests'); END IF;
  IF pg_catalog.to_regprocedure('public.expense_assert_beta_actor(uuid)') IS NULL THEN v_missing := pg_catalog.array_append(v_missing, 'expense_assert_beta_actor'); END IF;
  IF pg_catalog.to_regprocedure('public.expense_begin_request(uuid,uuid,text,text)') IS NULL THEN v_missing := pg_catalog.array_append(v_missing, 'expense_begin_request'); END IF;
  IF pg_catalog.to_regprocedure('public.expense_finish_request(uuid,uuid,jsonb)') IS NULL THEN v_missing := pg_catalog.array_append(v_missing, 'expense_finish_request'); END IF;
  IF pg_catalog.cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'expense_sql173_missing_prerequisites:%', pg_catalog.array_to_string(v_missing, ',');
  END IF;

  IF (
    SELECT pg_catalog.count(*) = 2
      AND COALESCE(pg_catalog.bool_and(
        constraint_row.oid IS NOT NULL
        AND constraint_row.contype::text = expected.constraint_type
        AND pg_catalog.pg_get_constraintdef(constraint_row.oid) = expected.exact_definition
        AND constraint_row.convalidated
        AND NOT constraint_row.condeferrable
        AND NOT constraint_row.condeferred
        AND constraint_row.connoinherit = expected.no_inherit
        AND constraint_row.conislocal
        AND constraint_row.coninhcount = 0
      ), false)
    FROM (VALUES
      ('relationship_sources_relationship_id_source_type_source_id_key', 'u', 'UNIQUE (relationship_id, source_type, source_id)', true),
      ('relationship_sources_source_type_check', 'c', 'CHECK ((source_type = ANY (ARRAY[''loans''::text, ''expenses''::text])))', false)
    ) AS expected(constraint_name, constraint_type, exact_definition, no_inherit)
    LEFT JOIN pg_catalog.pg_constraint AS constraint_row
      ON constraint_row.conrelid = 'public.relationship_sources'::pg_catalog.regclass
     AND constraint_row.conname = expected.constraint_name
  ) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'expense_sql173_relationship_source_constraint_drift';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('relationship_sources', true),
      ('expense_mutation_requests', false)
    ) AS expected(relation_name, service_dml)
    JOIN pg_catalog.pg_class AS relation
      ON relation.oid = pg_catalog.to_regclass('public.' || expected.relation_name)
    WHERE NOT (
      SELECT pg_catalog.count(*) = CASE WHEN expected.service_dml THEN 12 ELSE 8 END
        AND pg_catalog.count(*) FILTER (
          WHERE acl.grantee = pg_catalog.to_regrole('postgres')::oid
            AND acl.grantor = pg_catalog.to_regrole('postgres')::oid
            AND acl.privilege_type = ANY(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'])
            AND NOT acl.is_grantable
        ) = 8
        AND pg_catalog.count(*) FILTER (
          WHERE acl.grantee = pg_catalog.to_regrole('service_role')::oid
            AND acl.grantor = pg_catalog.to_regrole('postgres')::oid
            AND acl.privilege_type = ANY(ARRAY['SELECT','INSERT','UPDATE','DELETE'])
            AND NOT acl.is_grantable
        ) = CASE WHEN expected.service_dml THEN 4 ELSE 0 END
      FROM pg_catalog.aclexplode(
        COALESCE(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
      ) AS acl
    )
  ) THEN
    RAISE EXCEPTION 'expense_sql173_existing_relation_acl_drift';
  END IF;

  IF (
    WITH expected_sql173_function_identities(
  function_name, signature, present_in_predecessor
) AS (VALUES
  ('expense_deleted_tombstone_immutable', 'public.expense_deleted_tombstone_immutable()', false),
  ('expense_reject_deleted_id_reuse', 'public.expense_reject_deleted_id_reuse()', false),
  ('expense_validate_finalization_expense_reference', 'public.expense_validate_finalization_expense_reference()', false),
  ('expense_hard_delete_authorized', 'public.expense_hard_delete_authorized(uuid)', false),
  ('expense_revisions_immutable', 'public.expense_revisions_immutable()', true),
  ('expense_member_name_revision_immutable', 'public.expense_member_name_revision_immutable()', true),
  ('expense_guard_share_collaborator_mutation', 'public.expense_guard_share_collaborator_mutation()', true),
  ('expense_validate_relationship_source_live_context', 'public.expense_validate_relationship_source_live_context()', false),
  ('expense_insert_relationship_source', 'public.expense_insert_relationship_source(uuid,uuid,uuid,uuid)', false),
  ('expense_hard_delete_receipt_shape_known', 'public.expense_hard_delete_receipt_shape_known(text,jsonb)', false),
  ('expense_hard_delete_receipts_classified', 'public.expense_hard_delete_receipts_classified(uuid,uuid,boolean,uuid[])', false),
  ('expense_get_own_delete_capability', 'public.expense_get_own_delete_capability(uuid,uuid)', false),
  ('expense_delete_own_unsettled_expense', 'public.expense_delete_own_unsettled_expense(uuid,uuid,bigint,uuid)', false)
),
actual_sql173_function_identities AS MATERIALIZED (
  SELECT routine.proname::text AS function_name,
    routine.oid AS function_oid
  FROM pg_catalog.pg_proc AS routine
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = routine.pronamespace
   AND namespace.nspname = 'public'
  WHERE routine.proname IN (
    SELECT expected.function_name
    FROM expected_sql173_function_identities AS expected
  )
),
predecessor_function_identity_state AS (
  SELECT pg_catalog.count(*) = 3
    AND COALESCE(pg_catalog.bool_and(
      expected.signature IS NOT NULL
      AND actual.function_oid = pg_catalog.to_regprocedure(expected.signature)
    ), false) AS ok
  FROM (
    SELECT * FROM expected_sql173_function_identities
    WHERE present_in_predecessor
  ) AS expected
  FULL JOIN actual_sql173_function_identities AS actual
    USING (function_name)
),
installed_function_identity_state AS (
  SELECT pg_catalog.count(*) = 13
    AND COALESCE(pg_catalog.bool_and(
      expected.signature IS NOT NULL
      AND actual.function_oid = pg_catalog.to_regprocedure(expected.signature)
    ), false) AS ok
  FROM expected_sql173_function_identities AS expected
  FULL JOIN actual_sql173_function_identities AS actual
    USING (function_name)
)
    SELECT (SELECT ok FROM predecessor_function_identity_state)
  ) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'expense_sql173_predecessor_function_identity_drift';
  END IF;

  IF pg_catalog.to_regclass('public.expense_deleted_expense_tombstones') IS NOT NULL
     OR pg_catalog.to_regclass('public.expense_hard_delete_authorizations') IS NOT NULL
     OR pg_catalog.to_regprocedure('public.expense_deleted_tombstone_immutable()') IS NOT NULL
     OR pg_catalog.to_regprocedure('public.expense_reject_deleted_id_reuse()') IS NOT NULL
     OR pg_catalog.to_regprocedure('public.expense_validate_finalization_expense_reference()') IS NOT NULL
     OR pg_catalog.to_regprocedure('public.expense_hard_delete_authorized(uuid)') IS NOT NULL
     OR pg_catalog.to_regprocedure('public.expense_validate_relationship_source_live_context()') IS NOT NULL
     OR pg_catalog.to_regprocedure('public.expense_insert_relationship_source(uuid,uuid,uuid,uuid)') IS NOT NULL
     OR pg_catalog.to_regprocedure('public.expense_hard_delete_receipt_shape_known(text,jsonb)') IS NOT NULL
     OR pg_catalog.to_regprocedure('public.expense_hard_delete_receipts_classified(uuid,uuid,boolean,uuid[])') IS NOT NULL
     OR pg_catalog.to_regprocedure('public.expense_get_own_delete_capability(uuid,uuid)') IS NOT NULL
     OR pg_catalog.to_regprocedure('public.expense_delete_own_unsettled_expense(uuid,uuid,bigint,uuid)') IS NOT NULL
     OR EXISTS (
       SELECT 1 FROM pg_catalog.pg_trigger AS trigger_row
       WHERE NOT trigger_row.tgisinternal
         AND (
           (trigger_row.tgrelid = 'public.expenses'::pg_catalog.regclass
             AND trigger_row.tgname = 'expenses_deleted_id_reuse_guard')
           OR (trigger_row.tgrelid = 'public.expense_unconfirmed_finalizations'::pg_catalog.regclass
             AND trigger_row.tgname = 'expense_unconfirmed_finalizations_expense_reference_guard')
           OR (trigger_row.tgrelid = 'public.relationship_sources'::pg_catalog.regclass
             AND trigger_row.tgname = 'relationship_sources_expense_live_context_guard')
         )
     ) THEN
    RAISE EXCEPTION 'expense_sql173_object_collision';
  END IF;

  IF (
    WITH fk_delete_targets(relation_name) AS (
      VALUES
        ('recent_events'),('teskeid_event_expense_links'),
        ('teskeid_event_expense_participant_sources'),('expense_member_invitations'),
        ('expense_share_collaborators'),('expense_member_name_revisions'),
        ('expense_revisions'),('expense_activity'),('expense_activity_audience'),
        ('expenses'),('expense_claim_disputes'),('expense_payments'),('expense_shares'),
        ('expense_private_drafts'),('expense_hard_delete_authorizations'),
        ('relationship_sources'),('relationship_circle_expense_contexts'),
        ('expense_obligations'),('expense_groups'),('expense_group_members'),
        ('expense_payment_preference_assignments'),('expense_member_identity_bindings'),
        ('expense_deleted_expense_tombstones'),('expense_mutation_requests')
    ),
    actual_fks AS MATERIALIZED (
      SELECT relation_namespace.nspname::text AS relation_schema,
        relation.relname::text AS relation_name,
        constraint_row.conname::text AS constraint_name,
        pg_catalog.replace(
          pg_catalog.pg_get_constraintdef(constraint_row.oid),
          'public.',
          ''
        ) AS exact_definition,
        constraint_row.convalidated,
        constraint_row.condeferrable,
        constraint_row.condeferred
      FROM pg_catalog.pg_constraint AS constraint_row
      JOIN pg_catalog.pg_class AS relation
        ON relation.oid = constraint_row.conrelid
      JOIN pg_catalog.pg_namespace AS relation_namespace
        ON relation_namespace.oid = relation.relnamespace
      JOIN pg_catalog.pg_class AS referenced_relation
        ON referenced_relation.oid = constraint_row.confrelid
      JOIN pg_catalog.pg_namespace AS referenced_namespace
        ON referenced_namespace.oid = referenced_relation.relnamespace
       AND referenced_namespace.nspname = 'public'
      JOIN fk_delete_targets AS target
        ON target.relation_name = referenced_relation.relname
      WHERE constraint_row.contype = 'f'
    )
    SELECT pg_catalog.count(*) = 48
      AND COALESCE(pg_catalog.bool_and(
        expected.relation_schema IS NOT NULL
        AND actual.relation_schema IS NOT NULL
        AND actual.exact_definition = expected.exact_definition
        AND actual.convalidated
        AND actual.condeferrable = expected.is_deferrable
        AND actual.condeferred = expected.is_initially_deferred
      ), false)
    FROM pg_temp.expense_sql173_expected_fks AS expected
    FULL JOIN actual_fks AS actual
      USING (relation_schema, relation_name, constraint_name)
  ) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'expense_sql173_predecessor_fk_catalog_drift';
  END IF;

  IF (
    WITH actual_triggers AS MATERIALIZED (
      SELECT relation.relname::text AS relation_name,
        trigger_row.tgname::text AS trigger_name,
        pg_catalog.format(
          '%s.%s(%s)',
          function_namespace.nspname,
          routine.proname,
          pg_catalog.pg_get_function_identity_arguments(routine.oid)
        ) AS function_signature,
        trigger_row.tgtype AS trigger_type,
        trigger_row.tgenabled,
        (trigger_row.tgconstraint <> 0) AS is_constraint,
        trigger_row.tgdeferrable,
        trigger_row.tginitdeferred,
        COALESCE((
          SELECT pg_catalog.array_agg(attribute.attname::text ORDER BY attribute.attname)
          FROM pg_catalog.unnest(trigger_row.tgattr::smallint[]) AS trigger_attribute(attnum)
          JOIN pg_catalog.pg_attribute AS attribute
            ON attribute.attrelid = trigger_row.tgrelid
           AND attribute.attnum = trigger_attribute.attnum
        ), ARRAY[]::text[]) AS update_columns,
        trigger_row.tgqual IS NOT NULL AS has_when,
        trigger_row.tgnargs,
        pg_catalog.octet_length(trigger_row.tgargs) AS argument_bytes,
        pg_catalog.regexp_replace(
          pg_catalog.lower(COALESCE(
            (
              pg_catalog.regexp_match(
                pg_catalog.pg_get_triggerdef(trigger_row.oid, false),
                E' WHEN \\((.*)\\) EXECUTE FUNCTION '
              )
            )[1],
            ''
          )),
          '[[:space:]()]', '', 'g'
        ) AS when_expression
      FROM pg_catalog.pg_trigger AS trigger_row
      JOIN pg_catalog.pg_class AS relation
        ON relation.oid = trigger_row.tgrelid
      JOIN pg_catalog.pg_namespace AS relation_namespace
        ON relation_namespace.oid = relation.relnamespace
       AND relation_namespace.nspname = 'public'
      JOIN pg_temp.expense_sql173_relevant_trigger_relations AS relevant
        ON relevant.relation_name = relation.relname
      JOIN pg_catalog.pg_proc AS routine
        ON routine.oid = trigger_row.tgfoid
      JOIN pg_catalog.pg_namespace AS function_namespace
        ON function_namespace.oid = routine.pronamespace
      WHERE NOT trigger_row.tgisinternal
        AND trigger_row.tgenabled <> 'D'
    )
    SELECT pg_catalog.count(*) = 35
      AND COALESCE(pg_catalog.bool_and(
        expected.relation_name IS NOT NULL
        AND actual.relation_name IS NOT NULL
        AND actual.function_signature = expected.function_signature
        AND actual.trigger_type = expected.trigger_type
        AND actual.tgenabled = 'O'
        AND actual.is_constraint = expected.is_constraint
        AND actual.tgdeferrable = expected.is_deferrable
        AND actual.tginitdeferred = expected.is_initially_deferred
        AND actual.update_columns = expected.update_columns
        AND actual.has_when = expected.has_when
        AND actual.tgnargs = 0
        AND actual.argument_bytes = 0
        AND (NOT expected.has_when OR actual.when_expression =
          'old.user_idisnotnullandnew.user_idisnull')
      ), false)
    FROM (
      SELECT *
      FROM pg_temp.expense_sql173_expected_triggers
      WHERE present_in_predecessor
    ) AS expected
    FULL JOIN actual_triggers AS actual
      USING (relation_name, trigger_name)
  ) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'expense_sql173_predecessor_trigger_catalog_drift';
  END IF;
  IF (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
      FROM pg_catalog.pg_proc AS routine
      WHERE routine.oid = 'public.expense_revisions_immutable()'::pg_catalog.regprocedure)
       <> 'ed60ad79162d83e2e2586d9450791534'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.expense_member_name_revision_immutable()'::pg_catalog.regprocedure)
       <> '38c4fa17868c3a9b11fcbb038c4b11ec'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.expense_guard_share_collaborator_mutation()'::pg_catalog.regprocedure)
       <> '0a441bb99e791e29fac6d9162027d343' THEN
    RAISE EXCEPTION 'expense_sql173_predecessor_immutable_source_drift';
  END IF;
END;
$preflight$;

CREATE TABLE public.expense_deleted_expense_tombstones (
  expense_id uuid PRIMARY KEY,
  deleted_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);
ALTER TABLE public.expense_deleted_expense_tombstones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_deleted_expense_tombstones FORCE ROW LEVEL SECURITY;
ALTER TABLE public.expense_deleted_expense_tombstones OWNER TO postgres;
REVOKE ALL ON TABLE public.expense_deleted_expense_tombstones
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE public.expense_hard_delete_authorizations (
  backend_pid integer NOT NULL,
  transaction_id bigint NOT NULL,
  expense_id uuid NOT NULL,
  PRIMARY KEY (backend_pid, transaction_id, expense_id)
);
ALTER TABLE public.expense_hard_delete_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_hard_delete_authorizations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.expense_hard_delete_authorizations OWNER TO postgres;
REVOKE ALL ON TABLE public.expense_hard_delete_authorizations
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.expense_deleted_tombstone_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION 'expense_deleted_tombstone_immutable';
END;
$function$;

CREATE TRIGGER expense_deleted_tombstones_immutable_guard
BEFORE UPDATE OR DELETE ON public.expense_deleted_expense_tombstones
FOR EACH ROW EXECUTE FUNCTION public.expense_deleted_tombstone_immutable();

CREATE OR REPLACE FUNCTION public.expense_reject_deleted_id_reuse()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  -- Match the delete path's group -> per-ID order. This prevents an insert
  -- from passing the tombstone read before a concurrent delete commits,
  -- without inverting the canonical group-row lock order.
  PERFORM 1
  FROM public.expense_groups AS group_row
  WHERE group_row.id = NEW.group_id
  FOR SHARE;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(NEW.id::text, 173107)
  );
  IF EXISTS (
    SELECT 1 FROM public.expense_deleted_expense_tombstones AS tombstone
    WHERE tombstone.expense_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'expense_deleted_id_reuse';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER expenses_deleted_id_reuse_guard
BEFORE INSERT ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.expense_reject_deleted_id_reuse();

ALTER TABLE public.expense_unconfirmed_finalizations
  DROP CONSTRAINT expense_unconfirmed_finalizations_expense_fk;

CREATE OR REPLACE FUNCTION public.expense_validate_finalization_expense_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT EXISTS (
      SELECT 1 FROM public.expenses AS expense
      WHERE expense.group_id = NEW.group_id AND expense.id = NEW.expense_id
    ) AND NOT EXISTS (
      SELECT 1 FROM public.expense_deleted_expense_tombstones AS tombstone
      WHERE tombstone.expense_id = NEW.expense_id
    ) THEN
    RAISE EXCEPTION 'expense_finalization_expense_reference_invalid';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER expense_unconfirmed_finalizations_expense_reference_guard
BEFORE INSERT OR UPDATE OF group_id, expense_id
ON public.expense_unconfirmed_finalizations
FOR EACH ROW EXECUTE FUNCTION public.expense_validate_finalization_expense_reference();

CREATE OR REPLACE FUNCTION public.expense_hard_delete_authorized(p_expense_id uuid)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.expense_hard_delete_authorizations AS delete_auth
    WHERE delete_auth.backend_pid = pg_catalog.pg_backend_pid()
      AND delete_auth.transaction_id = pg_catalog.txid_current()
      AND delete_auth.expense_id = p_expense_id
  );
$function$;

-- Preserve the previous account-deletion-only UPDATE carve-out. DELETE is
-- admitted solely inside the exact SQL173 transaction capability.
CREATE OR REPLACE FUNCTION public.expense_revisions_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'DELETE' AND public.expense_hard_delete_authorized(OLD.expense_id) THEN
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.actor_user_id IS NOT NULL
     AND NEW.actor_user_id IS NULL
     AND (pg_catalog.to_jsonb(NEW) - 'actor_user_id') = (pg_catalog.to_jsonb(OLD) - 'actor_user_id') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'expense_revision_immutable';
END;
$function$;

CREATE OR REPLACE FUNCTION public.expense_member_name_revision_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'DELETE' AND public.expense_hard_delete_authorized(OLD.expense_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'expense_member_name_revision_immutable';
END;
$function$;

CREATE OR REPLACE FUNCTION public.expense_guard_share_collaborator_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF public.expense_hard_delete_authorized(OLD.expense_id) THEN
      RETURN OLD;
    END IF;
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
$function$;

-- The table keeps its existing service-role DML because Loans still use that
-- path. Enforce the Expense branch at the database boundary so no current,
-- legacy or in-flight direct writer can bypass the live provenance contract.
CREATE OR REPLACE FUNCTION public.expense_validate_relationship_source_live_context()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_group_id uuid;
  v_member_user_id uuid;
  v_relationship_owner_id uuid;
BEGIN
  IF NEW.source_type <> 'expenses' THEN
    IF TG_OP = 'UPDATE' AND OLD.source_type = 'expenses' THEN
      RAISE EXCEPTION 'relationship_expense_source_invalid';
    END IF;
    RETURN NEW;
  END IF;

  SELECT member.group_id INTO v_group_id
  FROM public.expense_group_members AS member
  WHERE member.id = NEW.source_id;
  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'relationship_expense_source_invalid';
  END IF;

  PERFORM 1
  FROM public.expense_groups AS group_row
  WHERE group_row.id = v_group_id
    AND group_row.status IN ('active', 'settling', 'settled')
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'relationship_expense_source_invalid';
  END IF;

  SELECT member.user_id INTO v_member_user_id
  FROM public.expense_group_members AS member
  WHERE member.group_id = v_group_id
    AND member.id = NEW.source_id
    AND member.status = 'active'
    AND member.user_id IS NOT NULL
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'relationship_expense_source_invalid';
  END IF;

  PERFORM 1
  FROM public.expenses AS expense
  WHERE expense.group_id = v_group_id
    AND expense.status = 'active'
  ORDER BY expense.id
  LIMIT 1
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'relationship_expense_source_invalid';
  END IF;

  SELECT relationship.owner_id
  INTO v_relationship_owner_id
  FROM public.relationships AS relationship
  WHERE relationship.id = NEW.relationship_id
    AND relationship.counterpart_user_id = v_member_user_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'relationship_expense_source_invalid';
  END IF;

  PERFORM 1
  FROM public.expense_member_invitations AS invitation
  WHERE invitation.group_id = v_group_id
    AND invitation.member_id = NEW.source_id
    AND invitation.status = 'accepted'
    AND invitation.invited_by = v_relationship_owner_id
    AND (
      invitation.relationship_id IS NULL
      OR invitation.relationship_id = NEW.relationship_id
    )
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'relationship_expense_source_invalid';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER relationship_sources_expense_live_context_guard
BEFORE INSERT OR UPDATE OF relationship_id, source_type, source_id
ON public.relationship_sources
FOR EACH ROW
EXECUTE FUNCTION public.expense_validate_relationship_source_live_context();

-- Keep Expense relationship provenance serialized behind the canonical
-- group-first lock. This closes the late-insert race with dedicated one-off
-- group deletion while leaving the existing Loans source path unchanged.
CREATE OR REPLACE FUNCTION public.expense_insert_relationship_source(
  p_owner_user_id uuid,
  p_relationship_id uuid,
  p_group_id uuid,
  p_member_id uuid
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member_user_id uuid;
BEGIN
  IF p_owner_user_id IS NULL OR p_relationship_id IS NULL
     OR p_group_id IS NULL OR p_member_id IS NULL THEN
    RAISE EXCEPTION 'relationship_expense_source_invalid';
  END IF;

  PERFORM 1
  FROM public.expense_groups AS group_row
  WHERE group_row.id = p_group_id
    AND group_row.status IN ('active', 'settling', 'settled')
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'relationship_expense_source_invalid';
  END IF;

  SELECT member.user_id
  INTO v_member_user_id
  FROM public.expense_group_members AS member
  WHERE member.group_id = p_group_id
    AND member.id = p_member_id
    AND member.status = 'active'
    AND member.user_id IS NOT NULL
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'relationship_expense_source_invalid';
  END IF;

  PERFORM 1
  FROM public.relationships AS relationship
  WHERE relationship.id = p_relationship_id
    AND relationship.owner_id = p_owner_user_id
    AND relationship.counterpart_user_id = v_member_user_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'relationship_expense_source_invalid';
  END IF;

  PERFORM 1
  FROM public.expense_member_invitations AS invitation
  WHERE invitation.group_id = p_group_id
    AND invitation.member_id = p_member_id
    AND invitation.status = 'accepted'
    AND invitation.invited_by = p_owner_user_id
    AND (
      invitation.relationship_id IS NULL
      OR invitation.relationship_id = p_relationship_id
    )
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'relationship_expense_source_invalid';
  END IF;

  INSERT INTO public.relationship_sources(relationship_id, source_type, source_id)
  VALUES (p_relationship_id, 'expenses', p_member_id)
  ON CONFLICT (relationship_id, source_type, source_id) DO NOTHING;
END;
$function$;

-- Exact historical/current result-key inventory for receipt shapes that can
-- carry an Expense, one-off group/member or finalized/edit draft identifier.
-- Unknown shapes fail closed before any receipt or application row is deleted.
CREATE OR REPLACE FUNCTION public.expense_hard_delete_receipt_shape_known(
  p_operation text,
  p_result jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  WITH actual(keys) AS (
    SELECT COALESCE(
      pg_catalog.array_agg(key_name ORDER BY key_name),
      ARRAY[]::text[]
    )
    FROM pg_catalog.jsonb_object_keys(
      CASE WHEN pg_catalog.jsonb_typeof(p_result) = 'object'
        THEN p_result ELSE '{}'::jsonb END
    ) AS key_name
  ),
  expected(operation, keys) AS (VALUES
    ('expense_add_group_member', ARRAY[]::text[]),
    ('expense_respond_group_invitation', ARRAY[]::text[]),
    ('expense_leave_group', ARRAY[]::text[]),
    ('expense_remove_group_member', ARRAY[]::text[]),
    ('expense_set_group_status', ARRAY[]::text[]),
    ('expense_create_group', ARRAY['group_id']::text[]),
    ('expense_create_expense', ARRAY['expense_id','group_id']::text[]),
    ('expense_create_expense_with_identity', ARRAY['expense_id','financial_version','group_id','invitation_ids']::text[]),
    ('expense_update_expense', ARRAY['changed','expense_id','financial_version','group_id']::text[]),
    ('expense_update_expense', ARRAY['changed','expense_id','financial_version','group_id','reported_repayments_need_review','revision_id','settlement_reopened']::text[]),
    ('expense_update_expense_with_identity', ARRAY['changed','expense_id','financial_version','group_id','invitation_ids']::text[]),
    ('expense_update_expense_with_identity', ARRAY['changed','expense_id','financial_version','group_id','invitation_ids','reported_repayments_need_review','revision_id','settlement_reopened']::text[]),
    ('expense_add_participant_with_identity', ARRAY['financial_version','member_id']::text[]),
    ('expense_add_participant_with_identity', ARRAY['financial_version','invitation_id','member_id']::text[]),
    ('expense_add_share_collaborator', ARRAY['collaboration_id','expense_id','group_id','invitation_id','member_id','share_member_id']::text[]),
    ('expense_add_share_collaborator', ARRAY['collaboration_id','expense_id','financial_version','group_id','member_id','share_member_id']::text[]),
    ('expense_add_share_collaborator', ARRAY['collaboration_id','expense_id','financial_version','group_id','invitation_id','member_id','share_member_id']::text[]),
    ('expense_rename_guest_member', ARRAY['changed','display_name','expense_id','group_id','member_id']::text[]),
    ('expense_rename_guest_member', ARRAY['activity_id','changed','display_name','expense_id','group_id','member_id']::text[]),
    ('expense_bind_member_event_identity', ARRAY['event_id','expense_id','financial_version','group_id','member_id']::text[]),
    ('expense_bind_member_relationship_identity_v1', ARRAY['expense_id','financial_version','group_id','member_id']::text[]),
    ('expense_dispute_claim', ARRAY['expense_id','financial_version','group_id','member_id','status']::text[]),
    ('expense_link_guest_member_email', ARRAY['created','group_id','invitation_id','member_id','status']::text[]),
    ('expense_link_guest_member_email', ARRAY['activity_id','created','group_id','invitation_id','member_id','status']::text[]),
    ('expense_link_guest_member_email', ARRAY['created','group_id','invitation_id','member_id','pending','status']::text[]),
    ('expense_link_guest_member_email', ARRAY['activity_id','created','group_id','invitation_id','member_id','pending','status']::text[]),
    ('expense_respond_member_invitation', ARRAY['invitation_id','status']::text[]),
    ('expense_respond_member_invitation', ARRAY['accepted','counterpart_user_id','financial_version','group_id','invitation_id','invited_by','member_id','status']::text[]),
    ('expense_respond_member_invitation', ARRAY['counterpart_user_id','financial_version','group_id','invitation_id','invited_by','member_id','status']::text[]),
    ('expense_respond_member_invitation', ARRAY['counterpart_user_id','financial_version','group_id','invitation_id','invited_by','member_id','participant_source','status']::text[]),
    ('expense_respond_scoped_member_invitation', ARRAY['counterpart_user_id','financial_version','group_id','invitation_id','invited_by','member_id','participant_source','status']::text[]),
    ('expense_finalize_private_draft_v1', ARRAY['confirmed','contract_version','draft_id','expense_id','group_id','invitation_ids','state']::text[]),
    ('expense_share_private_draft_v1', ARRAY['allocation_state','contract_version','draft_id','draft_version','publication_id','publication_version','shareable_fingerprint','state']::text[]),
    ('expense_unshare_private_draft_v1', ARRAY['contract_version','draft_id','draft_version','publication_id','publication_version','state']::text[]),
    ('expense_set_private_draft_event_relation_v1', ARRAY['contract_version','draft_id','draft_version','event_id','event_roster_revision','previous_draft_version','previous_event_id','previous_event_roster_revision','previous_publication_version','privacy_fail_closed','publication_id','publication_version','state','visibility']::text[]),
    ('expense_share_edit_revision_v1', ARRAY['allocation_state','contract_version','draft_id','draft_version','publication_id','publication_version','shareable_fingerprint','state']::text[]),
    ('expense_unshare_edit_revision_v1', ARRAY['contract_version','draft_id','draft_version','publication_id','publication_version','state']::text[]),
    ('expense_open_edit_revision_v1', ARRAY['contract_version','draft_id','draft_version','expense_id','financial_version','group_id','publication_version','state']::text[]),
    ('expense_discard_edit_revision_v1', ARRAY['contract_version','expense_id','financial_version','group_id','state']::text[]),
    ('expense_reconfirm_edit_revision_v1', ARRAY['contract_version','expense_id','financial_version','group_id','invitation_ids','state']::text[]),
    ('expense_reconfirm_edit_revision_v1', ARRAY['changed','contract_version','expense_id','financial_version','group_id','invitation_ids','reported_repayments_need_review','revision_id','settlement_reopened','state']::text[]),
    ('expense_share_edit_revision_v1', ARRAY['allocation_state','contract_version','draft_id','draft_version','incomplete','publication_id','publication_version','shareable_fingerprint','shared_draft','state']::text[]),
    ('expense_unshare_edit_revision_v1', ARRAY['contract_version','draft_id','draft_version','private_draft','publication_id','publication_version','state']::text[]),
    ('expense_open_edit_revision_v1', ARRAY['contract_version','draft_id','draft_version','edit_revision_open','expense_id','financial_version','group_id','publication_version','state']::text[]),
    ('expense_discard_edit_revision_v1', ARRAY['contract_version','discarded','expense_id','financial_version','group_id','state']::text[]),
    ('expense_reconfirm_edit_revision_v1', ARRAY['contract_version','expense_id','financial_version','group_id','invitation_ids','state','unchanged_reconfirmed']::text[]),
    ('expense_report_repayment', ARRAY['group_id','repayment_id']::text[]),
    ('expense_record_received_repayment', ARRAY['group_id','repayment_id']::text[]),
    ('expense_transition_repayment', ARRAY['group_id']::text[]),
    ('expense_cancel_expense', ARRAY['group_id']::text[]),
    ('expense_propose_settlement_batch', ARRAY['batch_id','group_ids','proposed','status']::text[]),
    ('expense_transition_settlement_batch', ARRAY['batch_id','group_ids','status']::text[]),
    ('expense_cancel_member_invitation', ARRAY['invitation_id','status']::text[]),
    ('expense_create_event_context', ARRAY['event_id']::text[]),
    ('expense_save_payment_preference', ARRAY['preference_id','version']::text[]),
    ('expense_deactivate_payment_preference', ARRAY['preference_id','version']::text[]),
    ('save_payment_profile_v2', ARRAY['profile_id','version']::text[]),
    ('clear_payment_profile_v2', ARRAY['cleared']::text[]),
    ('convert_legacy_payment_profile_v2', ARRAY['converted_snapshots','profile_id','version']::text[]),
    ('expense_delete_own_unsettled_expense', ARRAY['deleted','financial_version','group_id']::text[])
  )
  SELECT p_result IS NOT NULL
    AND pg_catalog.jsonb_typeof(p_result) = 'object'
    AND EXISTS (
      SELECT 1 FROM expected, actual
      WHERE expected.operation = p_operation
        AND expected.keys = actual.keys
    );
$function$;

CREATE OR REPLACE FUNCTION public.expense_hard_delete_receipts_classified(
  p_expense_id uuid,
  p_group_id uuid,
  p_one_off boolean,
  p_invitation_ids uuid[]
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_group_member_ids uuid[] := ARRAY[]::uuid[];
  v_receipt_draft_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF p_expense_id IS NULL OR p_group_id IS NULL OR p_one_off IS NULL
     OR p_invitation_ids IS NULL
     OR pg_catalog.array_position(p_invitation_ids, NULL) IS NOT NULL THEN
    RETURN false;
  END IF;

  IF p_one_off THEN
    SELECT COALESCE(
      pg_catalog.array_agg(member.id ORDER BY member.id),
      ARRAY[]::uuid[]
    ) INTO v_group_member_ids
    FROM public.expense_group_members AS member
    WHERE member.group_id = p_group_id;
  END IF;

  SELECT COALESCE(
    pg_catalog.array_agg(source.draft_id ORDER BY source.draft_id),
    ARRAY[]::uuid[]
  ) INTO v_receipt_draft_ids
  FROM (
    SELECT finalization.draft_id
    FROM public.expense_unconfirmed_finalizations AS finalization
    WHERE finalization.expense_id = p_expense_id
    UNION
    SELECT (request.result->>'draft_id')::uuid
    FROM public.expense_mutation_requests AS request
    WHERE request.result->>'expense_id' = p_expense_id::text
      AND request.result ? 'draft_id'
      AND request.result->>'draft_id'
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND public.expense_hard_delete_receipt_shape_known(
        request.operation, request.result
      )
  ) AS source;

  RETURN NOT EXISTS (
    SELECT 1
    FROM public.expense_mutation_requests AS request
    WHERE request.result IS NOT NULL
      AND (
        request.result->>'expense_id' = p_expense_id::text
        OR (p_one_off AND request.result->>'group_id' = p_group_id::text)
        OR (p_one_off
          AND COALESCE(request.result->'group_ids', '[]'::jsonb) ? p_group_id::text)
        OR (p_one_off AND EXISTS (
          SELECT 1 FROM pg_catalog.unnest(v_group_member_ids) AS member_id
          WHERE request.result->>'member_id' = member_id::text
             OR request.result->>'share_member_id' = member_id::text
        ))
        OR EXISTS (
          SELECT 1 FROM pg_catalog.unnest(v_receipt_draft_ids) AS draft_id
          WHERE request.result->>'draft_id' = draft_id::text
        )
        OR EXISTS (
          SELECT 1 FROM pg_catalog.unnest(p_invitation_ids) AS invitation_id
          WHERE request.result->>'invitation_id' = invitation_id::text
             OR COALESCE(request.result->'invitation_ids', '[]'::jsonb)
                  ? invitation_id::text
        )
      )
      AND NOT public.expense_hard_delete_receipt_shape_known(
        request.operation, request.result
      )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.expense_get_own_delete_capability(
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
  v_expense public.expenses%ROWTYPE;
  v_group public.expense_groups%ROWTYPE;
  v_reason text;
  v_invitation_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  SELECT expense.* INTO v_expense
  FROM public.expenses AS expense
  WHERE expense.id = p_expense_id;

  IF v_expense.id IS NULL OR v_expense.created_by IS DISTINCT FROM p_actor_id THEN
    RETURN pg_catalog.jsonb_build_object('visible', false);
  END IF;

  SELECT group_row.* INTO v_group
  FROM public.expense_groups AS group_row
  WHERE group_row.id = v_expense.group_id;

  SELECT COALESCE(
    pg_catalog.array_agg(invitation.id ORDER BY invitation.id),
    ARRAY[]::uuid[]
  ) INTO v_invitation_ids
  FROM public.expense_member_invitations AS invitation
  WHERE invitation.shared_expense_id = v_expense.id
     OR (v_group.kind = 'one_off' AND invitation.group_id = v_group.id);

  v_reason := CASE
    WHEN v_group.id IS NULL OR v_group.status <> 'active' OR v_expense.status <> 'active'
      THEN 'not_active'
    WHEN v_group.financial_version >= 9007199254740991
      THEN 'unsafe_context'
    WHEN v_group.kind = 'one_off' AND (
      v_group.created_by IS DISTINCT FROM p_actor_id
      OR
      EXISTS (
        SELECT 1 FROM public.expense_event_contexts AS event_context
        WHERE event_context.group_id = v_group.id
      )
      OR (SELECT pg_catalog.count(*) FROM public.expenses AS group_expense
          WHERE group_expense.group_id = v_group.id) <> 1
    ) THEN 'unsafe_context'
    WHEN EXISTS (
      SELECT 1 FROM public.expense_claim_disputes AS dispute
      WHERE dispute.group_id = v_group.id
        AND dispute.expense_id = v_expense.id
    ) THEN 'unsafe_context'
    WHEN NOT public.expense_hard_delete_receipts_classified(
      v_expense.id, v_group.id, v_group.kind = 'one_off', v_invitation_ids
    ) THEN 'unsafe_context'
    WHEN EXISTS (
      SELECT 1 FROM public.expense_edit_revision_bindings AS binding
      WHERE binding.expense_id = v_expense.id
         OR (v_group.kind = 'one_off' AND binding.group_id = v_group.id)
    ) OR EXISTS (
      SELECT 1 FROM public.expense_private_drafts AS draft
      WHERE draft.expense_id = v_expense.id
         OR (v_group.kind = 'one_off' AND draft.group_id = v_group.id)
    ) OR (v_group.kind = 'one_off' AND EXISTS (
      SELECT 1 FROM public.expense_unconfirmed_publications AS publication
      WHERE publication.group_id = v_group.id
    ))
    THEN 'open_revision'
    WHEN EXISTS (
      SELECT 1 FROM public.expense_repayments AS repayment
      WHERE repayment.group_id = v_group.id
    ) OR EXISTS (
      SELECT 1 FROM public.expense_settlement_batch_items AS item
      WHERE item.group_id = v_group.id
    ) OR EXISTS (
      SELECT 1 FROM public.expense_obligations AS obligation
      WHERE obligation.group_id = v_group.id
    ) THEN 'settlement_history'
    ELSE NULL
  END;

  RETURN pg_catalog.jsonb_build_object(
    'visible', true,
    'allowed', v_reason IS NULL,
    'reason', v_reason,
    'expected_financial_version', v_group.financial_version
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.expense_delete_own_unsettled_expense(
  p_actor_id uuid,
  p_expense_id uuid,
  p_expected_financial_version bigint,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_expense public.expenses%ROWTYPE;
  v_group public.expense_groups%ROWTYPE;
  v_fingerprint text;
  v_replay jsonb;
  v_result jsonb;
  v_activity_ids uuid[] := ARRAY[]::uuid[];
  v_group_member_ids uuid[] := ARRAY[]::uuid[];
  v_receipt_draft_ids uuid[] := ARRAY[]::uuid[];
  v_invitation_ids uuid[] := ARRAY[]::uuid[];
  v_group_expense_count integer;
  v_final_financial_version bigint;
BEGIN
  PERFORM public.expense_assert_beta_actor(p_actor_id);
  IF p_expense_id IS NULL OR p_expected_financial_version IS NULL
     OR p_expected_financial_version < 0
     OR p_expected_financial_version >= 9007199254740991 THEN
    RAISE EXCEPTION 'expense_invalid_input';
  END IF;

  -- SQL173 recovery takes this same transaction-scoped lock before inspecting
  -- or removing catalog state. No runtime tombstone can be created while
  -- recovery is passing its empty-state gate.
  PERFORM pg_catalog.pg_advisory_xact_lock(173, 107);

  v_fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'expenseId', p_expense_id,
    'expectedFinancialVersion', p_expected_financial_version
  )::text);
  v_replay := public.expense_begin_request(
    p_actor_id, p_request_id, 'expense_delete_own_unsettled_expense', v_fingerprint
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  -- Every normal Expense request writer takes RowExclusive on this private
  -- table before it acquires a group lock. Upgrade here before the group lock
  -- to drain those writers without lock-order inversion, then retain the lock
  -- through receipt cleanup and commit.
  LOCK TABLE public.expense_mutation_requests IN SHARE ROW EXCLUSIVE MODE;

  SELECT expense.* INTO v_expense
  FROM public.expenses AS expense
  WHERE expense.id = p_expense_id
    AND expense.created_by = p_actor_id;
  IF v_expense.id IS NULL THEN RAISE EXCEPTION 'expense_delete_not_allowed'; END IF;

  SELECT group_row.* INTO v_group
  FROM public.expense_groups AS group_row
  WHERE group_row.id = v_expense.group_id
  FOR UPDATE;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_expense_id::text, 173107)
  );
  SELECT expense.* INTO v_expense
  FROM public.expenses AS expense
  WHERE expense.id = p_expense_id
  FOR UPDATE;

  IF v_expense.id IS NULL OR v_expense.created_by IS DISTINCT FROM p_actor_id
     OR v_expense.group_id IS DISTINCT FROM v_group.id
     OR v_group.id IS NULL OR v_group.status <> 'active'
     OR v_expense.status <> 'active' THEN
    RAISE EXCEPTION 'expense_delete_not_allowed';
  END IF;
  IF v_group.financial_version <> p_expected_financial_version
     OR v_group.financial_version >= 9007199254740991 THEN
    RAISE EXCEPTION 'expense_financial_version_conflict';
  END IF;
  IF v_group.kind = 'one_off' THEN
    IF v_group.created_by IS DISTINCT FROM p_actor_id THEN
      RAISE EXCEPTION 'expense_delete_one_off_owner_conflict';
    END IF;
    SELECT pg_catalog.count(*)::integer INTO v_group_expense_count
    FROM public.expenses AS group_expense
    WHERE group_expense.group_id = v_group.id;
    IF v_group_expense_count <> 1 THEN
      RAISE EXCEPTION 'expense_delete_one_off_shape_conflict';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.expense_event_contexts AS event_context
      WHERE event_context.group_id = v_group.id
    ) THEN
      RAISE EXCEPTION 'expense_delete_legacy_event_context';
    END IF;

    SELECT COALESCE(
      pg_catalog.array_agg(locked_member.id ORDER BY locked_member.id),
      ARRAY[]::uuid[]
    )
    INTO v_group_member_ids
    FROM (
      SELECT member.id
      FROM public.expense_group_members AS member
      WHERE member.group_id = v_group.id
      ORDER BY member.id
      FOR UPDATE
    ) AS locked_member;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.expense_claim_disputes AS dispute
    WHERE dispute.group_id = v_group.id
      AND dispute.expense_id = v_expense.id
  ) THEN
    RAISE EXCEPTION 'expense_delete_not_allowed';
  END IF;
  IF EXISTS (
      SELECT 1 FROM public.expense_edit_revision_bindings AS binding
      WHERE binding.expense_id = v_expense.id
         OR (v_group.kind = 'one_off' AND binding.group_id = v_group.id)
    ) OR EXISTS (
      SELECT 1 FROM public.expense_private_drafts AS draft
      WHERE draft.expense_id = v_expense.id
         OR (v_group.kind = 'one_off' AND draft.group_id = v_group.id)
    ) OR (v_group.kind = 'one_off' AND EXISTS (
      SELECT 1 FROM public.expense_unconfirmed_publications AS publication
      WHERE publication.group_id = v_group.id
    ))
    THEN
    RAISE EXCEPTION 'expense_delete_open_revision';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.expense_repayments AS repayment
    WHERE repayment.group_id = v_group.id
    ) OR EXISTS (
      SELECT 1 FROM public.expense_settlement_batch_items AS item
      WHERE item.group_id = v_group.id
    ) OR EXISTS (
      SELECT 1 FROM public.expense_obligations AS obligation
      WHERE obligation.group_id = v_group.id
  ) THEN
    RAISE EXCEPTION 'expense_delete_settlement_history';
  END IF;

  -- Freeze lazy invitation-event synchronization before snapshotting IDs.
  -- The request-table lock above already drained canonical mutation writers.
  LOCK TABLE public.recent_events IN SHARE MODE;

  SELECT COALESCE(
    pg_catalog.array_agg(invitation.id ORDER BY invitation.id),
    ARRAY[]::uuid[]
  )
  INTO v_invitation_ids
  FROM public.expense_member_invitations AS invitation
  WHERE invitation.shared_expense_id = v_expense.id
     OR (v_group.kind = 'one_off' AND invitation.group_id = v_group.id);

  IF NOT public.expense_hard_delete_receipts_classified(
    p_expense_id => v_expense.id,
    p_group_id => v_group.id,
    p_one_off => v_group.kind = 'one_off',
    p_invitation_ids => v_invitation_ids
  ) THEN
    RAISE EXCEPTION 'expense_delete_receipt_shape_unknown';
  END IF;

  SELECT COALESCE(
    pg_catalog.array_agg(source.draft_id ORDER BY source.draft_id),
    ARRAY[]::uuid[]
  ) INTO v_receipt_draft_ids
  FROM (
    SELECT finalization.draft_id
    FROM public.expense_unconfirmed_finalizations AS finalization
    WHERE finalization.expense_id = v_expense.id
    UNION
    SELECT (request.result->>'draft_id')::uuid
    FROM public.expense_mutation_requests AS request
    WHERE request.result->>'expense_id' = v_expense.id::text
      AND request.result ? 'draft_id'
      AND request.result->>'draft_id'
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND public.expense_hard_delete_receipt_shape_known(
        request.operation, request.result
      )
  ) AS source;

  SELECT COALESCE(pg_catalog.array_agg(activity.id), ARRAY[]::uuid[])
  INTO v_activity_ids
  FROM public.expense_activity AS activity
  WHERE (v_group.kind = 'one_off' AND activity.group_id = v_group.id)
     OR (activity.entity_type = 'expense' AND activity.entity_id = v_expense.id)
     OR (activity.entity_type = 'expense_member_invitation'
       AND activity.entity_id = ANY(v_invitation_ids));

  INSERT INTO public.expense_deleted_expense_tombstones(expense_id)
  VALUES (v_expense.id);
  INSERT INTO public.expense_hard_delete_authorizations(
    backend_pid, transaction_id, expense_id
  ) VALUES (
    pg_catalog.pg_backend_pid(), pg_catalog.txid_current(), v_expense.id
  );

  DELETE FROM public.expense_mutation_requests AS receipt
  WHERE NOT (
      receipt.actor_user_id = p_actor_id
      AND receipt.request_id = p_request_id
    )
    AND receipt.result IS NOT NULL
     AND (
       receipt.result->>'expense_id' = v_expense.id::text
       OR (v_group.kind = 'one_off' AND receipt.result->>'group_id' = v_group.id::text)
       OR (v_group.kind = 'one_off'
         AND COALESCE(receipt.result->'group_ids', '[]'::jsonb) ? v_group.id::text)
       OR (v_group.kind = 'one_off' AND EXISTS (
         SELECT 1 FROM pg_catalog.unnest(v_group_member_ids) AS member_id
         WHERE receipt.result->>'member_id' = member_id::text
            OR receipt.result->>'share_member_id' = member_id::text
       ))
       OR EXISTS (
         SELECT 1 FROM pg_catalog.unnest(v_receipt_draft_ids) AS draft_id
         WHERE receipt.result->>'draft_id' = draft_id::text
       )
       OR EXISTS (
         SELECT 1 FROM pg_catalog.unnest(v_invitation_ids) AS invitation_id
         WHERE receipt.result->>'invitation_id' = invitation_id::text
            OR COALESCE(receipt.result->'invitation_ids', '[]'::jsonb)
                 ? invitation_id::text
       )
     );

  DELETE FROM public.recent_events AS recent
  WHERE recent.source = 'expenses'
    AND (
      (recent.entity_type = 'expense' AND recent.entity_id = v_expense.id)
      OR recent.event_key = ANY(
        SELECT 'expenses:activity:' || activity_id::text
        FROM pg_catalog.unnest(v_activity_ids) AS activity_id
      )
    );
  DELETE FROM public.teskeid_event_expense_links AS link
  WHERE link.expense_id = v_expense.id;
  DELETE FROM public.expense_member_invitations AS invitation
  WHERE invitation.shared_expense_id = v_expense.id
     OR (v_group.kind = 'one_off' AND invitation.group_id = v_group.id);
  DELETE FROM public.expense_share_collaborators AS collaborator
  WHERE collaborator.expense_id = v_expense.id
     OR (v_group.kind = 'one_off' AND collaborator.group_id = v_group.id);
  DELETE FROM public.expense_member_name_revisions AS revision
  WHERE revision.expense_id = v_expense.id
     OR (v_group.kind = 'one_off' AND revision.group_id = v_group.id);
  DELETE FROM public.expense_revisions AS revision
  WHERE revision.expense_id = v_expense.id
     OR (v_group.kind = 'one_off' AND revision.group_id = v_group.id);
  DELETE FROM public.expense_activity AS activity
  WHERE activity.id = ANY(v_activity_ids);
  DELETE FROM public.expenses AS expense
  WHERE expense.id = v_expense.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'expense_delete_conflict'; END IF;

  UPDATE public.expense_groups AS group_row
  SET financial_version = group_row.financial_version + 1
  WHERE group_row.id = v_group.id
    AND group_row.financial_version = p_expected_financial_version
    AND group_row.financial_version < 9007199254740991
  RETURNING group_row.financial_version INTO v_final_financial_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'expense_financial_version_conflict'; END IF;

  IF v_group.kind = 'one_off' THEN
    DELETE FROM public.relationship_sources AS source
    WHERE source.source_type = 'expenses'
      AND source.source_id = ANY(v_group_member_ids);
    DELETE FROM public.relationship_circle_expense_contexts AS circle_context
    WHERE circle_context.group_id = v_group.id;
    DELETE FROM public.expense_groups AS group_row
    WHERE group_row.id = v_group.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'expense_delete_group_conflict'; END IF;
  END IF;

  DELETE FROM public.expense_hard_delete_authorizations AS delete_auth
  WHERE delete_auth.backend_pid = pg_catalog.pg_backend_pid()
    AND delete_auth.transaction_id = pg_catalog.txid_current()
    AND delete_auth.expense_id = v_expense.id;

  IF EXISTS (SELECT 1 FROM public.expenses WHERE id = v_expense.id)
     OR EXISTS (SELECT 1 FROM public.expense_revisions WHERE expense_id = v_expense.id)
     OR EXISTS (SELECT 1 FROM public.expense_member_name_revisions WHERE expense_id = v_expense.id)
     OR EXISTS (SELECT 1 FROM public.expense_share_collaborators WHERE expense_id = v_expense.id)
     OR EXISTS (SELECT 1 FROM public.expense_member_invitations WHERE shared_expense_id = v_expense.id)
     OR EXISTS (SELECT 1 FROM public.teskeid_event_expense_links WHERE expense_id = v_expense.id)
     OR EXISTS (SELECT 1 FROM public.expense_activity WHERE id = ANY(v_activity_ids))
      OR EXISTS (SELECT 1 FROM public.recent_events WHERE source = 'expenses' AND entity_type = 'expense' AND entity_id = v_expense.id)
      OR EXISTS (
        SELECT 1
        FROM public.expense_mutation_requests AS receipt
        WHERE NOT (
            receipt.actor_user_id = p_actor_id
            AND receipt.request_id = p_request_id
          )
          AND receipt.result IS NOT NULL
           AND (
             receipt.result->>'expense_id' = v_expense.id::text
             OR (v_group.kind = 'one_off' AND receipt.result->>'group_id' = v_group.id::text)
             OR (v_group.kind = 'one_off'
               AND COALESCE(receipt.result->'group_ids', '[]'::jsonb) ? v_group.id::text)
             OR (v_group.kind = 'one_off' AND EXISTS (
               SELECT 1 FROM pg_catalog.unnest(v_group_member_ids) AS member_id
               WHERE receipt.result->>'member_id' = member_id::text
                  OR receipt.result->>'share_member_id' = member_id::text
             ))
             OR EXISTS (
               SELECT 1 FROM pg_catalog.unnest(v_receipt_draft_ids) AS draft_id
               WHERE receipt.result->>'draft_id' = draft_id::text
             )
             OR EXISTS (
               SELECT 1 FROM pg_catalog.unnest(v_invitation_ids) AS invitation_id
               WHERE receipt.result->>'invitation_id' = invitation_id::text
                  OR COALESCE(receipt.result->'invitation_ids', '[]'::jsonb)
                       ? invitation_id::text
             )
           )
      )
     OR EXISTS (
       SELECT 1 FROM public.recent_events AS recent
       WHERE recent.event_key = ANY(
         SELECT 'expenses:activity:' || activity_id::text
         FROM pg_catalog.unnest(v_activity_ids) AS activity_id
       )
     )
     OR (v_group.kind = 'one_off' AND EXISTS (
       SELECT 1 FROM public.expense_groups WHERE id = v_group.id
     ))
     OR (v_group.kind = 'one_off' AND EXISTS (
       SELECT 1
       FROM public.relationship_sources AS source
       WHERE source.source_type = 'expenses'
         AND source.source_id = ANY(v_group_member_ids)
     ))
     OR (v_group.kind = 'one_off' AND EXISTS (
       SELECT 1 FROM public.expense_unconfirmed_publications AS publication
       WHERE publication.group_id = v_group.id
     ))
     OR NOT EXISTS (SELECT 1 FROM public.expense_deleted_expense_tombstones WHERE expense_id = v_expense.id)
     OR public.expense_hard_delete_authorized(v_expense.id) THEN
    RAISE EXCEPTION 'expense_delete_postcondition_failed';
  END IF;

  v_result := pg_catalog.jsonb_build_object(
    'deleted', true,
    'group_id', v_group.id,
    'financial_version', v_final_financial_version
  );
  PERFORM public.expense_finish_request(p_actor_id, p_request_id, v_result);
  RETURN v_result;
END;
$function$;

ALTER FUNCTION public.expense_deleted_tombstone_immutable() OWNER TO postgres;
ALTER FUNCTION public.expense_reject_deleted_id_reuse() OWNER TO postgres;
ALTER FUNCTION public.expense_validate_finalization_expense_reference() OWNER TO postgres;
ALTER FUNCTION public.expense_hard_delete_authorized(uuid) OWNER TO postgres;
ALTER FUNCTION public.expense_revisions_immutable() OWNER TO postgres;
ALTER FUNCTION public.expense_member_name_revision_immutable() OWNER TO postgres;
ALTER FUNCTION public.expense_guard_share_collaborator_mutation() OWNER TO postgres;
ALTER FUNCTION public.expense_validate_relationship_source_live_context() OWNER TO postgres;
ALTER FUNCTION public.expense_insert_relationship_source(uuid,uuid,uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.expense_hard_delete_receipt_shape_known(text,jsonb) OWNER TO postgres;
ALTER FUNCTION public.expense_hard_delete_receipts_classified(uuid,uuid,boolean,uuid[]) OWNER TO postgres;
ALTER FUNCTION public.expense_get_own_delete_capability(uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.expense_delete_own_unsettled_expense(uuid,uuid,bigint,uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.expense_deleted_tombstone_immutable() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_reject_deleted_id_reuse() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_validate_finalization_expense_reference() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_hard_delete_authorized(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_revisions_immutable() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_member_name_revision_immutable() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_guard_share_collaborator_mutation() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_validate_relationship_source_live_context() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_insert_relationship_source(uuid,uuid,uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_hard_delete_receipt_shape_known(text,jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_hard_delete_receipts_classified(uuid,uuid,boolean,uuid[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_get_own_delete_capability(uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expense_delete_own_unsettled_expense(uuid,uuid,bigint,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expense_insert_relationship_source(uuid,uuid,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_get_own_delete_capability(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.expense_delete_own_unsettled_expense(uuid,uuid,bigint,uuid) TO service_role;

DO $postflight$
BEGIN
  IF (
    SELECT pg_catalog.count(*) = 2
      AND COALESCE(pg_catalog.bool_and(
        constraint_row.oid IS NOT NULL
        AND constraint_row.contype::text = expected.constraint_type
        AND pg_catalog.pg_get_constraintdef(constraint_row.oid) = expected.exact_definition
        AND constraint_row.convalidated
        AND NOT constraint_row.condeferrable
        AND NOT constraint_row.condeferred
        AND constraint_row.connoinherit = expected.no_inherit
        AND constraint_row.conislocal
        AND constraint_row.coninhcount = 0
      ), false)
    FROM (VALUES
      ('relationship_sources_relationship_id_source_type_source_id_key', 'u', 'UNIQUE (relationship_id, source_type, source_id)', true),
      ('relationship_sources_source_type_check', 'c', 'CHECK ((source_type = ANY (ARRAY[''loans''::text, ''expenses''::text])))', false)
    ) AS expected(constraint_name, constraint_type, exact_definition, no_inherit)
    LEFT JOIN pg_catalog.pg_constraint AS constraint_row
      ON constraint_row.conrelid = 'public.relationship_sources'::pg_catalog.regclass
     AND constraint_row.conname = expected.constraint_name
  ) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'expense_sql173_relationship_source_constraint_drift';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('relationship_sources', true),
      ('expense_mutation_requests', false)
    ) AS expected(relation_name, service_dml)
    JOIN pg_catalog.pg_class AS relation
      ON relation.oid = pg_catalog.to_regclass('public.' || expected.relation_name)
    WHERE NOT (
      SELECT pg_catalog.count(*) = CASE WHEN expected.service_dml THEN 12 ELSE 8 END
        AND pg_catalog.count(*) FILTER (
          WHERE acl.grantee = pg_catalog.to_regrole('postgres')::oid
            AND acl.grantor = pg_catalog.to_regrole('postgres')::oid
            AND acl.privilege_type = ANY(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'])
            AND NOT acl.is_grantable
        ) = 8
        AND pg_catalog.count(*) FILTER (
          WHERE acl.grantee = pg_catalog.to_regrole('service_role')::oid
            AND acl.grantor = pg_catalog.to_regrole('postgres')::oid
            AND acl.privilege_type = ANY(ARRAY['SELECT','INSERT','UPDATE','DELETE'])
            AND NOT acl.is_grantable
        ) = CASE WHEN expected.service_dml THEN 4 ELSE 0 END
      FROM pg_catalog.aclexplode(
        COALESCE(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
      ) AS acl
    )
  ) THEN
    RAISE EXCEPTION 'expense_sql173_existing_relation_acl_drift';
  END IF;

  IF (
    WITH fk_delete_targets(relation_name) AS (
      VALUES
        ('recent_events'),('teskeid_event_expense_links'),
        ('teskeid_event_expense_participant_sources'),('expense_member_invitations'),
        ('expense_share_collaborators'),('expense_member_name_revisions'),
        ('expense_revisions'),('expense_activity'),('expense_activity_audience'),
        ('expenses'),('expense_claim_disputes'),('expense_payments'),('expense_shares'),
        ('expense_private_drafts'),('expense_hard_delete_authorizations'),
        ('relationship_sources'),('relationship_circle_expense_contexts'),
        ('expense_obligations'),('expense_groups'),('expense_group_members'),
        ('expense_payment_preference_assignments'),('expense_member_identity_bindings'),
        ('expense_deleted_expense_tombstones'),('expense_mutation_requests')
    ),
    actual_fks AS MATERIALIZED (
      SELECT relation_namespace.nspname::text AS relation_schema,
        relation.relname::text AS relation_name,
        constraint_row.conname::text AS constraint_name,
        pg_catalog.replace(
          pg_catalog.pg_get_constraintdef(constraint_row.oid),
          'public.',
          ''
        ) AS exact_definition,
        constraint_row.convalidated,
        constraint_row.condeferrable,
        constraint_row.condeferred
      FROM pg_catalog.pg_constraint AS constraint_row
      JOIN pg_catalog.pg_class AS relation
        ON relation.oid = constraint_row.conrelid
      JOIN pg_catalog.pg_namespace AS relation_namespace
        ON relation_namespace.oid = relation.relnamespace
      JOIN pg_catalog.pg_class AS referenced_relation
        ON referenced_relation.oid = constraint_row.confrelid
      JOIN pg_catalog.pg_namespace AS referenced_namespace
        ON referenced_namespace.oid = referenced_relation.relnamespace
       AND referenced_namespace.nspname = 'public'
      JOIN fk_delete_targets AS target
        ON target.relation_name = referenced_relation.relname
      WHERE constraint_row.contype = 'f'
    )
    SELECT pg_catalog.count(*) = 47
      AND COALESCE(pg_catalog.bool_and(
        expected.relation_schema IS NOT NULL
        AND actual.relation_schema IS NOT NULL
        AND actual.exact_definition = expected.exact_definition
        AND actual.convalidated
        AND actual.condeferrable = expected.is_deferrable
        AND actual.condeferred = expected.is_initially_deferred
      ), false)
    FROM (
      SELECT *
      FROM pg_temp.expense_sql173_expected_fks
      WHERE present_when_installed
    ) AS expected
    FULL JOIN actual_fks AS actual
      USING (relation_schema, relation_name, constraint_name)
  ) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'expense_sql173_installed_fk_catalog_drift';
  END IF;

  IF (
    WITH actual_triggers AS MATERIALIZED (
      SELECT relation.relname::text AS relation_name,
        trigger_row.tgname::text AS trigger_name,
        pg_catalog.format(
          '%s.%s(%s)',
          function_namespace.nspname,
          routine.proname,
          pg_catalog.pg_get_function_identity_arguments(routine.oid)
        ) AS function_signature,
        trigger_row.tgtype AS trigger_type,
        trigger_row.tgenabled,
        (trigger_row.tgconstraint <> 0) AS is_constraint,
        trigger_row.tgdeferrable,
        trigger_row.tginitdeferred,
        COALESCE((
          SELECT pg_catalog.array_agg(attribute.attname::text ORDER BY attribute.attname)
          FROM pg_catalog.unnest(trigger_row.tgattr::smallint[]) AS trigger_attribute(attnum)
          JOIN pg_catalog.pg_attribute AS attribute
            ON attribute.attrelid = trigger_row.tgrelid
           AND attribute.attnum = trigger_attribute.attnum
        ), ARRAY[]::text[]) AS update_columns,
        trigger_row.tgqual IS NOT NULL AS has_when,
        trigger_row.tgnargs,
        pg_catalog.octet_length(trigger_row.tgargs) AS argument_bytes,
        pg_catalog.regexp_replace(
          pg_catalog.lower(COALESCE(
            (
              pg_catalog.regexp_match(
                pg_catalog.pg_get_triggerdef(trigger_row.oid, false),
                E' WHEN \\((.*)\\) EXECUTE FUNCTION '
              )
            )[1],
            ''
          )),
          '[[:space:]()]', '', 'g'
        ) AS when_expression
      FROM pg_catalog.pg_trigger AS trigger_row
      JOIN pg_catalog.pg_class AS relation
        ON relation.oid = trigger_row.tgrelid
      JOIN pg_catalog.pg_namespace AS relation_namespace
        ON relation_namespace.oid = relation.relnamespace
       AND relation_namespace.nspname = 'public'
      JOIN pg_temp.expense_sql173_relevant_trigger_relations AS relevant
        ON relevant.relation_name = relation.relname
      JOIN pg_catalog.pg_proc AS routine
        ON routine.oid = trigger_row.tgfoid
      JOIN pg_catalog.pg_namespace AS function_namespace
        ON function_namespace.oid = routine.pronamespace
      WHERE NOT trigger_row.tgisinternal
        AND trigger_row.tgenabled <> 'D'
    )
    SELECT pg_catalog.count(*) = 39
      AND COALESCE(pg_catalog.bool_and(
        expected.relation_name IS NOT NULL
        AND actual.relation_name IS NOT NULL
        AND actual.function_signature = expected.function_signature
        AND actual.trigger_type = expected.trigger_type
        AND actual.tgenabled = 'O'
        AND actual.is_constraint = expected.is_constraint
        AND actual.tgdeferrable = expected.is_deferrable
        AND actual.tginitdeferred = expected.is_initially_deferred
        AND actual.update_columns = expected.update_columns
        AND actual.has_when = expected.has_when
        AND actual.tgnargs = 0
        AND actual.argument_bytes = 0
        AND (NOT expected.has_when OR actual.when_expression =
          'old.user_idisnotnullandnew.user_idisnull')
      ), false)
    FROM pg_temp.expense_sql173_expected_triggers AS expected
    FULL JOIN actual_triggers AS actual
      USING (relation_name, trigger_name)
  ) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'expense_sql173_installed_trigger_catalog_drift';
  END IF;

  IF (
    WITH expected_sql173_function_identities(
  function_name, signature, present_in_predecessor
) AS (VALUES
  ('expense_deleted_tombstone_immutable', 'public.expense_deleted_tombstone_immutable()', false),
  ('expense_reject_deleted_id_reuse', 'public.expense_reject_deleted_id_reuse()', false),
  ('expense_validate_finalization_expense_reference', 'public.expense_validate_finalization_expense_reference()', false),
  ('expense_hard_delete_authorized', 'public.expense_hard_delete_authorized(uuid)', false),
  ('expense_revisions_immutable', 'public.expense_revisions_immutable()', true),
  ('expense_member_name_revision_immutable', 'public.expense_member_name_revision_immutable()', true),
  ('expense_guard_share_collaborator_mutation', 'public.expense_guard_share_collaborator_mutation()', true),
  ('expense_validate_relationship_source_live_context', 'public.expense_validate_relationship_source_live_context()', false),
  ('expense_insert_relationship_source', 'public.expense_insert_relationship_source(uuid,uuid,uuid,uuid)', false),
  ('expense_hard_delete_receipt_shape_known', 'public.expense_hard_delete_receipt_shape_known(text,jsonb)', false),
  ('expense_hard_delete_receipts_classified', 'public.expense_hard_delete_receipts_classified(uuid,uuid,boolean,uuid[])', false),
  ('expense_get_own_delete_capability', 'public.expense_get_own_delete_capability(uuid,uuid)', false),
  ('expense_delete_own_unsettled_expense', 'public.expense_delete_own_unsettled_expense(uuid,uuid,bigint,uuid)', false)
),
actual_sql173_function_identities AS MATERIALIZED (
  SELECT routine.proname::text AS function_name,
    routine.oid AS function_oid
  FROM pg_catalog.pg_proc AS routine
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = routine.pronamespace
   AND namespace.nspname = 'public'
  WHERE routine.proname IN (
    SELECT expected.function_name
    FROM expected_sql173_function_identities AS expected
  )
),
predecessor_function_identity_state AS (
  SELECT pg_catalog.count(*) = 3
    AND COALESCE(pg_catalog.bool_and(
      expected.signature IS NOT NULL
      AND actual.function_oid = pg_catalog.to_regprocedure(expected.signature)
    ), false) AS ok
  FROM (
    SELECT * FROM expected_sql173_function_identities
    WHERE present_in_predecessor
  ) AS expected
  FULL JOIN actual_sql173_function_identities AS actual
    USING (function_name)
),
installed_function_identity_state AS (
  SELECT pg_catalog.count(*) = 13
    AND COALESCE(pg_catalog.bool_and(
      expected.signature IS NOT NULL
      AND actual.function_oid = pg_catalog.to_regprocedure(expected.signature)
    ), false) AS ok
  FROM expected_sql173_function_identities AS expected
  FULL JOIN actual_sql173_function_identities AS actual
    USING (function_name)
)
    SELECT (SELECT ok FROM installed_function_identity_state)
  ) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'expense_sql173_installed_function_identity_drift';
  END IF;

  IF (
    WITH expected_rpc_metadata(
      signature, argument_names, volatility, return_type,
      security_definer, language_name
    ) AS (
      VALUES
        ('public.expense_deleted_tombstone_immutable()', NULL::text[], 'v', 'trigger', false, 'plpgsql'),
        ('public.expense_reject_deleted_id_reuse()', NULL::text[], 'v', 'trigger', true, 'plpgsql'),
        ('public.expense_validate_finalization_expense_reference()', NULL::text[], 'v', 'trigger', true, 'plpgsql'),
        ('public.expense_hard_delete_authorized(uuid)', ARRAY['p_expense_id']::text[], 'v', 'boolean', true, 'sql'),
        ('public.expense_revisions_immutable()', NULL::text[], 'v', 'trigger', false, 'plpgsql'),
        ('public.expense_member_name_revision_immutable()', NULL::text[], 'v', 'trigger', true, 'plpgsql'),
        ('public.expense_guard_share_collaborator_mutation()', NULL::text[], 'v', 'trigger', true, 'plpgsql'),
        ('public.expense_validate_relationship_source_live_context()', NULL::text[], 'v', 'trigger', true, 'plpgsql'),
        ('public.expense_insert_relationship_source(uuid,uuid,uuid,uuid)', ARRAY['p_owner_user_id','p_relationship_id','p_group_id','p_member_id']::text[], 'v', 'void', true, 'plpgsql'),
        ('public.expense_hard_delete_receipt_shape_known(text,jsonb)', ARRAY['p_operation','p_result']::text[], 'i', 'boolean', true, 'sql'),
        ('public.expense_hard_delete_receipts_classified(uuid,uuid,boolean,uuid[])', ARRAY['p_expense_id','p_group_id','p_one_off','p_invitation_ids']::text[], 's', 'boolean', true, 'plpgsql'),
        ('public.expense_get_own_delete_capability(uuid,uuid)', ARRAY['p_actor_id','p_expense_id']::text[], 's', 'jsonb', true, 'plpgsql'),
        ('public.expense_delete_own_unsettled_expense(uuid,uuid,bigint,uuid)', ARRAY['p_actor_id','p_expense_id','p_expected_financial_version','p_request_id']::text[], 'v', 'jsonb', true, 'plpgsql')
    )
    SELECT pg_catalog.count(*) = 13
      AND COALESCE(pg_catalog.bool_and(
        namespace.nspname = 'public'
        AND routine.prokind = 'f'
        AND routine.prosecdef = expected.security_definer
        AND NOT routine.proleakproof
        AND routine.provolatile::text = expected.volatility
        AND routine.proparallel = 'u'
        AND NOT routine.proretset
        AND NOT routine.proisstrict
        AND routine.proconfig = ARRAY['search_path=""']::text[]
        AND pg_catalog.pg_get_userbyid(routine.proowner) = 'postgres'
        AND language.lanname = expected.language_name
        AND pg_catalog.format_type(routine.prorettype, NULL) = expected.return_type
        AND routine.proargnames IS NOT DISTINCT FROM expected.argument_names
        AND routine.proargmodes IS NULL
        AND routine.proallargtypes IS NULL
        AND routine.pronargdefaults = 0
      ), false)
    FROM expected_rpc_metadata AS expected
    JOIN pg_catalog.pg_proc AS routine
      ON routine.oid = pg_catalog.to_regprocedure(expected.signature)
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = routine.pronamespace
    JOIN pg_catalog.pg_language AS language
      ON language.oid = routine.prolang
  ) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'expense_sql173_rpc_metadata_drift';
  END IF;

  IF (
    WITH expected_function_acl(signature, service_execute) AS (
      VALUES
        ('public.expense_deleted_tombstone_immutable()', false),
        ('public.expense_reject_deleted_id_reuse()', false),
        ('public.expense_validate_finalization_expense_reference()', false),
        ('public.expense_hard_delete_authorized(uuid)', false),
        ('public.expense_revisions_immutable()', false),
        ('public.expense_member_name_revision_immutable()', false),
        ('public.expense_guard_share_collaborator_mutation()', false),
        ('public.expense_validate_relationship_source_live_context()', false),
        ('public.expense_insert_relationship_source(uuid,uuid,uuid,uuid)', true),
        ('public.expense_hard_delete_receipt_shape_known(text,jsonb)', false),
        ('public.expense_hard_delete_receipts_classified(uuid,uuid,boolean,uuid[])', false),
        ('public.expense_get_own_delete_capability(uuid,uuid)', true),
        ('public.expense_delete_own_unsettled_expense(uuid,uuid,bigint,uuid)', true)
    )
    SELECT pg_catalog.count(*) = 13
      AND COALESCE(pg_catalog.bool_and((
        SELECT pg_catalog.count(*) = CASE WHEN expected.service_execute THEN 2 ELSE 1 END
          AND pg_catalog.count(*) FILTER (
            WHERE acl.grantee = pg_catalog.to_regrole('postgres')::oid
              AND acl.grantor = pg_catalog.to_regrole('postgres')::oid
              AND acl.privilege_type = 'EXECUTE'
              AND NOT acl.is_grantable
          ) = 1
          AND pg_catalog.count(*) FILTER (
            WHERE acl.grantee = pg_catalog.to_regrole('service_role')::oid
              AND acl.grantor = pg_catalog.to_regrole('postgres')::oid
              AND acl.privilege_type = 'EXECUTE'
              AND NOT acl.is_grantable
          ) = CASE WHEN expected.service_execute THEN 1 ELSE 0 END
        FROM pg_catalog.aclexplode(
          COALESCE(
            routine.proacl,
            pg_catalog.acldefault('f', routine.proowner)
          )
        ) AS acl
      )), false)
    FROM expected_function_acl AS expected
    JOIN pg_catalog.pg_proc AS routine
      ON routine.oid = pg_catalog.to_regprocedure(expected.signature)
  ) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'expense_sql173_function_acl_drift';
  END IF;

  IF (
    SELECT pg_catalog.count(*) = 2
      AND COALESCE(pg_catalog.bool_and(
        relation.relkind = 'r'
        AND relation.relpersistence = 'p'
        AND NOT relation.relispartition
        AND relation.relreplident = 'd'
        AND relation.reltablespace = 0
        AND pg_catalog.cardinality(COALESCE(
          relation.reloptions, ARRAY[]::text[]
        )) = 0
        AND relation.relrowsecurity
        AND relation.relforcerowsecurity
        AND pg_catalog.pg_get_userbyid(relation.relowner) = 'postgres'
        AND COALESCE(
          relation.relacl,
          pg_catalog.acldefault('r', relation.relowner)
        ) = pg_catalog.acldefault('r', relation.relowner)
        AND NOT EXISTS (
          SELECT 1
          FROM pg_catalog.pg_policy AS policy_row
          WHERE policy_row.polrelid = relation.oid
        )
      ), false)
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
     AND namespace.nspname = 'public'
    WHERE relation.relname IN (
      'expense_deleted_expense_tombstones',
      'expense_hard_delete_authorizations'
    )
  ) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'expense_sql173_private_relation_drift';
  END IF;

  IF (
    WITH expected_private_columns(
      relation_name, ordinal_position, column_name, data_type,
      is_not_null, default_expression
    ) AS (VALUES
      ('expense_deleted_expense_tombstones', 1::smallint, 'expense_id', 'uuid', true, NULL::text),
      ('expense_deleted_expense_tombstones', 2::smallint, 'deleted_at', 'timestamp with time zone', true, 'now()'),
      ('expense_hard_delete_authorizations', 1::smallint, 'backend_pid', 'integer', true, NULL::text),
      ('expense_hard_delete_authorizations', 2::smallint, 'transaction_id', 'bigint', true, NULL::text),
      ('expense_hard_delete_authorizations', 3::smallint, 'expense_id', 'uuid', true, NULL::text)
    ),
    actual_private_columns AS MATERIALIZED (
      SELECT relation.relname::text AS relation_name,
        attribute.attnum AS ordinal_position,
        attribute.attname::text AS column_name,
        pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) AS data_type,
        attribute.attnotnull AS is_not_null,
        CASE WHEN attribute_default.oid IS NULL THEN NULL::text ELSE
          pg_catalog.replace(
            pg_catalog.pg_get_expr(attribute_default.adbin, attribute_default.adrelid),
            'pg_catalog.', ''
          )
        END AS default_expression,
        attribute.attidentity,
        attribute.attgenerated,
        attribute.attacl
      FROM pg_catalog.pg_attribute AS attribute
      JOIN pg_catalog.pg_class AS relation
        ON relation.oid = attribute.attrelid
      JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = relation.relnamespace
       AND namespace.nspname = 'public'
      LEFT JOIN pg_catalog.pg_attrdef AS attribute_default
        ON attribute_default.adrelid = attribute.attrelid
       AND attribute_default.adnum = attribute.attnum
      WHERE relation.relname IN (
        'expense_deleted_expense_tombstones',
        'expense_hard_delete_authorizations'
      )
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped
    ),
    private_column_state AS (
      SELECT pg_catalog.count(*) = 5
        AND COALESCE(pg_catalog.bool_and(
          expected.relation_name IS NOT NULL
          AND actual.relation_name IS NOT NULL
          AND actual.data_type = expected.data_type
          AND actual.is_not_null = expected.is_not_null
          AND actual.default_expression IS NOT DISTINCT FROM expected.default_expression
          AND actual.attidentity = ''
          AND actual.attgenerated = ''
          AND actual.attacl IS NULL
        ), false) AS ok
      FROM expected_private_columns AS expected
      FULL JOIN actual_private_columns AS actual
        USING (relation_name, ordinal_position, column_name)
    ),
    expected_private_constraints(
      relation_name, constraint_name, exact_definition
    ) AS (VALUES
      ('expense_deleted_expense_tombstones', 'expense_deleted_expense_tombstones_pkey', 'PRIMARY KEY (expense_id)'),
      ('expense_hard_delete_authorizations', 'expense_hard_delete_authorizations_pkey', 'PRIMARY KEY (backend_pid, transaction_id, expense_id)')
    ),
    actual_private_constraints AS MATERIALIZED (
      SELECT relation.relname::text AS relation_name,
        constraint_row.conname::text AS constraint_name,
        pg_catalog.pg_get_constraintdef(constraint_row.oid) AS exact_definition,
        constraint_row.contype,
        constraint_row.convalidated,
        constraint_row.condeferrable,
        constraint_row.condeferred,
        constraint_row.connoinherit,
        constraint_row.conislocal,
        constraint_row.coninhcount
      FROM pg_catalog.pg_constraint AS constraint_row
      JOIN pg_catalog.pg_class AS relation
        ON relation.oid = constraint_row.conrelid
      JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = relation.relnamespace
       AND namespace.nspname = 'public'
      WHERE relation.relname IN (
        'expense_deleted_expense_tombstones',
        'expense_hard_delete_authorizations'
      )
        AND constraint_row.contype IN ('c', 'f', 'p', 'u', 'x')
    ),
    private_constraint_state AS (
      SELECT pg_catalog.count(*) = 2
        AND COALESCE(pg_catalog.bool_and(
          expected.relation_name IS NOT NULL
          AND actual.relation_name IS NOT NULL
          AND actual.exact_definition = expected.exact_definition
          AND actual.contype = 'p'
          AND actual.convalidated
          AND NOT actual.condeferrable
          AND NOT actual.condeferred
          AND actual.connoinherit
          AND actual.conislocal
          AND actual.coninhcount = 0
        ), false) AS ok
      FROM expected_private_constraints AS expected
      FULL JOIN actual_private_constraints AS actual
        USING (relation_name, constraint_name)
    ),
    expected_private_indexes(
      relation_name, index_name, exact_definition
    ) AS (VALUES
      ('expense_deleted_expense_tombstones', 'expense_deleted_expense_tombstones_pkey', 'createuniqueindexexpense_deleted_expense_tombstones_pkeyonexpense_deleted_expense_tombstonesusingbtreeexpense_id'),
      ('expense_hard_delete_authorizations', 'expense_hard_delete_authorizations_pkey', 'createuniqueindexexpense_hard_delete_authorizations_pkeyonexpense_hard_delete_authorizationsusingbtreebackend_pid,transaction_id,expense_id')
    ),
    actual_private_indexes AS MATERIALIZED (
      SELECT relation.relname::text AS relation_name,
        index_relation.relname::text AS index_name,
        index_row.indisunique,
        index_row.indisprimary,
        index_row.indisexclusion,
        index_row.indimmediate,
        index_row.indisvalid,
        index_row.indisready,
        index_row.indislive,
        index_row.indcheckxmin,
        index_row.indisclustered,
        index_row.indisreplident,
        index_row.indnullsnotdistinct,
        index_row.indpred,
        index_row.indexprs,
        index_row.indnkeyatts,
        index_row.indnatts,
        access_method.amname,
        index_relation.relkind AS index_relkind,
        index_relation.relpersistence AS index_persistence,
        pg_catalog.pg_get_userbyid(index_relation.relowner) AS index_owner,
        index_relation.reltablespace,
        index_relation.relacl,
        index_relation.reloptions,
        pg_catalog.lower(pg_catalog.replace(pg_catalog.regexp_replace(
          pg_catalog.regexp_replace(
            pg_catalog.pg_get_indexdef(index_row.indexrelid),
            '::[a-z0-9_.]+(\[\])?', '', 'g'
          ), '[[:space:]()''"]', '', 'g'
        ), 'public.', '')) AS exact_definition
      FROM pg_catalog.pg_index AS index_row
      JOIN pg_catalog.pg_class AS relation ON relation.oid = index_row.indrelid
      JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = relation.relnamespace
       AND namespace.nspname = 'public'
      JOIN pg_catalog.pg_class AS index_relation
        ON index_relation.oid = index_row.indexrelid
      JOIN pg_catalog.pg_am AS access_method
        ON access_method.oid = index_relation.relam
      WHERE relation.relname IN (
        'expense_deleted_expense_tombstones',
        'expense_hard_delete_authorizations'
      )
    ),
    private_index_state AS (
      SELECT pg_catalog.count(*) = 2
        AND COALESCE(pg_catalog.bool_and(
          expected.relation_name IS NOT NULL
          AND actual.relation_name IS NOT NULL
          AND actual.exact_definition = expected.exact_definition
          AND actual.indisunique
          AND actual.indisprimary
          AND NOT actual.indisexclusion
          AND actual.indimmediate
          AND actual.indisvalid
          AND actual.indisready
          AND actual.indislive
          AND NOT actual.indcheckxmin
          AND NOT actual.indisclustered
          AND NOT actual.indisreplident
          AND NOT actual.indnullsnotdistinct
          AND actual.indpred IS NULL
          AND actual.indexprs IS NULL
          AND actual.indnkeyatts = actual.indnatts
          AND actual.amname = 'btree'
          AND actual.index_relkind = 'i'
          AND actual.index_persistence = 'p'
          AND actual.index_owner = 'postgres'
          AND actual.reltablespace = 0
          AND actual.relacl IS NULL
          AND pg_catalog.cardinality(COALESCE(
            actual.reloptions, ARRAY[]::text[]
          )) = 0
        ), false) AS ok
      FROM expected_private_indexes AS expected
      FULL JOIN actual_private_indexes AS actual
        USING (relation_name, index_name)
    )
    SELECT (SELECT ok FROM private_column_state)
      AND (SELECT ok FROM private_constraint_state)
      AND (SELECT ok FROM private_index_state)
  ) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'expense_sql173_private_relation_catalog_drift';
  END IF;

  IF pg_catalog.to_regclass('public.expense_unconfirmed_publications') IS NULL
     OR pg_catalog.to_regclass('public.expense_deleted_expense_tombstones') IS NULL
     OR pg_catalog.to_regclass('public.expense_hard_delete_authorizations') IS NULL
     OR pg_catalog.to_regprocedure('public.expense_deleted_tombstone_immutable()') IS NULL
     OR pg_catalog.to_regprocedure('public.expense_reject_deleted_id_reuse()') IS NULL
     OR pg_catalog.to_regprocedure('public.expense_validate_finalization_expense_reference()') IS NULL
     OR pg_catalog.to_regprocedure('public.expense_hard_delete_authorized(uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.expense_validate_relationship_source_live_context()') IS NULL
     OR pg_catalog.to_regprocedure('public.expense_insert_relationship_source(uuid,uuid,uuid,uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.expense_hard_delete_receipt_shape_known(text,jsonb)') IS NULL
     OR pg_catalog.to_regprocedure('public.expense_hard_delete_receipts_classified(uuid,uuid,boolean,uuid[])') IS NULL
     OR pg_catalog.to_regprocedure('public.expense_get_own_delete_capability(uuid,uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.expense_delete_own_unsettled_expense(uuid,uuid,bigint,uuid)') IS NULL
     OR EXISTS (
       SELECT 1 FROM pg_catalog.pg_constraint AS constraint_row
       WHERE constraint_row.conrelid = 'public.expense_unconfirmed_finalizations'::pg_catalog.regclass
         AND constraint_row.conname = 'expense_unconfirmed_finalizations_expense_fk'
     )
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.expense_deleted_tombstone_immutable()'::pg_catalog.regprocedure) <> '4eb040d0bdeb874c2cb22c844bab1ca4'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.expense_reject_deleted_id_reuse()'::pg_catalog.regprocedure) <> '0d0da15e31183448a4382466e84c216c'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.expense_validate_finalization_expense_reference()'::pg_catalog.regprocedure) <> '3124b6233c3045627463f49487a49c59'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.expense_hard_delete_authorized(uuid)'::pg_catalog.regprocedure) <> '9381e225abe7cea9f582afb62c774d00'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.expense_revisions_immutable()'::pg_catalog.regprocedure) <> '01e24a341ffc1f83be0c92235ba76a6b'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.expense_member_name_revision_immutable()'::pg_catalog.regprocedure) <> '756c28d816b3ad4f5eb66209cb061b94'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.expense_guard_share_collaborator_mutation()'::pg_catalog.regprocedure) <> '6dc57dd8a7871fed6299d345ddda3df7'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.expense_validate_relationship_source_live_context()'::pg_catalog.regprocedure) <> 'de5c6904c63278360cf0f2c9796bb5c7'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.expense_insert_relationship_source(uuid,uuid,uuid,uuid)'::pg_catalog.regprocedure) <> 'e2415ab3ef58b15709627f530f0f6003'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.expense_hard_delete_receipt_shape_known(text,jsonb)'::pg_catalog.regprocedure) <> 'edb8a21d01ffdbbb8e9aa2b94c7c2594'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.expense_hard_delete_receipts_classified(uuid,uuid,boolean,uuid[])'::pg_catalog.regprocedure) <> '9def695d70fc38b63011cb2bd12e2e67'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.expense_get_own_delete_capability(uuid,uuid)'::pg_catalog.regprocedure) <> 'ffbd530e2f759d85809a34045ac15a1e'
     OR (SELECT pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
         FROM pg_catalog.pg_proc AS routine
         WHERE routine.oid = 'public.expense_delete_own_unsettled_expense(uuid,uuid,bigint,uuid)'::pg_catalog.regprocedure) <> '41bc44fc718a17fc4fc8c0777e0a0a67'
     THEN
    RAISE EXCEPTION 'expense_sql173_postcondition_failed';
  END IF;
END;
$postflight$;

COMMIT;
