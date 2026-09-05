-- SQL173 RECOVERY: installation/catalog recovery only.
--
-- This transaction never deletes an Expense or another application row. It is
-- admitted only while SQL173 is exact and has no runtime tombstone or active
-- authorization state. A real deletion permanently closes this recovery path.

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

DO $recovery_lock$
BEGIN
  -- Runtime mutation takes this exact transaction-scoped lock before its
  -- request/tombstone state. This lock remains held through recovery COMMIT.
  PERFORM pg_catalog.pg_advisory_xact_lock(173, 107);
END;
$recovery_lock$;

DO $recovery_runtime_precheck$
BEGIN
  IF EXISTS (SELECT 1 FROM public.expense_deleted_expense_tombstones)
     OR EXISTS (SELECT 1 FROM public.expense_hard_delete_authorizations) THEN
    RAISE EXCEPTION 'expense_sql173_recovery_runtime_state_present';
  END IF;
END;
$recovery_runtime_precheck$;

DO $recovery_installed_catalog$
BEGIN
  IF pg_catalog.to_regclass('public.expense_unconfirmed_publications') IS NULL THEN
    RAISE EXCEPTION 'expense_sql173_missing_prerequisites:expense_unconfirmed_publications';
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
    FROM (VALUES ('relationship_sources', true), ('expense_mutation_requests', false))
      AS expected(relation_name, service_dml)
    JOIN pg_catalog.pg_class AS relation
      ON relation.oid = pg_catalog.to_regclass('public.' || expected.relation_name)
    WHERE NOT (
      SELECT pg_catalog.count(*) = CASE WHEN expected.service_dml THEN 12 ELSE 8 END
        AND pg_catalog.count(*) FILTER (
          WHERE acl.grantee = pg_catalog.to_regrole('postgres')::oid
            AND acl.grantor = pg_catalog.to_regrole('postgres')::oid
            AND acl.privilege_type = ANY(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'])
            AND NOT acl.is_grantable) = 8
        AND pg_catalog.count(*) FILTER (
          WHERE acl.grantee = pg_catalog.to_regrole('service_role')::oid
            AND acl.grantor = pg_catalog.to_regrole('postgres')::oid
            AND acl.privilege_type = ANY(ARRAY['SELECT','INSERT','UPDATE','DELETE'])
            AND NOT acl.is_grantable) = CASE WHEN expected.service_dml THEN 4 ELSE 0 END
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
          AND NOT actual.connoinherit
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

  IF pg_catalog.to_regclass('public.expense_deleted_expense_tombstones') IS NULL
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
$recovery_installed_catalog$;

-- Recheck while the same transaction-scoped advisory lock is still held.
DO $recovery_runtime_recheck$
BEGIN
  IF EXISTS (SELECT 1 FROM public.expense_deleted_expense_tombstones)
     OR EXISTS (SELECT 1 FROM public.expense_hard_delete_authorizations) THEN
    RAISE EXCEPTION 'expense_sql173_recovery_runtime_state_present';
  END IF;
END;
$recovery_runtime_recheck$;

DROP FUNCTION public.expense_delete_own_unsettled_expense(uuid,uuid,bigint,uuid);
DROP FUNCTION public.expense_get_own_delete_capability(uuid,uuid);
DROP FUNCTION public.expense_insert_relationship_source(uuid,uuid,uuid,uuid);
DROP FUNCTION public.expense_hard_delete_receipts_classified(uuid,uuid,boolean,uuid[]);
DROP FUNCTION public.expense_hard_delete_receipt_shape_known(text,jsonb);
DROP TRIGGER relationship_sources_expense_live_context_guard ON public.relationship_sources;
DROP FUNCTION public.expense_validate_relationship_source_live_context();

CREATE OR REPLACE FUNCTION public.expense_revisions_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.actor_user_id IS NOT NULL
     AND NEW.actor_user_id IS NULL
     AND (to_jsonb(NEW) - 'actor_user_id') = (to_jsonb(OLD) - 'actor_user_id') THEN
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

DROP FUNCTION public.expense_hard_delete_authorized(uuid);

DROP TRIGGER expense_unconfirmed_finalizations_expense_reference_guard
  ON public.expense_unconfirmed_finalizations;
DROP FUNCTION public.expense_validate_finalization_expense_reference();

ALTER TABLE public.expense_unconfirmed_finalizations
  ADD CONSTRAINT expense_unconfirmed_finalizations_expense_fk
  FOREIGN KEY (group_id, expense_id)
  REFERENCES public.expenses(group_id, id)
  NOT VALID;
ALTER TABLE public.expense_unconfirmed_finalizations
  VALIDATE CONSTRAINT expense_unconfirmed_finalizations_expense_fk;

DROP TRIGGER expenses_deleted_id_reuse_guard ON public.expenses;
DROP FUNCTION public.expense_reject_deleted_id_reuse();
DROP TRIGGER expense_deleted_tombstones_immutable_guard
  ON public.expense_deleted_expense_tombstones;
DROP FUNCTION public.expense_deleted_tombstone_immutable();

DROP TABLE public.expense_hard_delete_authorizations;
DROP TABLE public.expense_deleted_expense_tombstones;

DO $recovery_predecessor_catalog$
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
    FROM (VALUES ('relationship_sources', true), ('expense_mutation_requests', false))
      AS expected(relation_name, service_dml)
    JOIN pg_catalog.pg_class AS relation
      ON relation.oid = pg_catalog.to_regclass('public.' || expected.relation_name)
    WHERE NOT (
      SELECT pg_catalog.count(*) = CASE WHEN expected.service_dml THEN 12 ELSE 8 END
        AND pg_catalog.count(*) FILTER (
          WHERE acl.grantee = pg_catalog.to_regrole('postgres')::oid
            AND acl.grantor = pg_catalog.to_regrole('postgres')::oid
            AND acl.privilege_type = ANY(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'])
            AND NOT acl.is_grantable) = 8
        AND pg_catalog.count(*) FILTER (
          WHERE acl.grantee = pg_catalog.to_regrole('service_role')::oid
            AND acl.grantor = pg_catalog.to_regrole('postgres')::oid
            AND acl.privilege_type = ANY(ARRAY['SELECT','INSERT','UPDATE','DELETE'])
            AND NOT acl.is_grantable) = CASE WHEN expected.service_dml THEN 4 ELSE 0 END
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
$recovery_predecessor_catalog$;

COMMIT;
