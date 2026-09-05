-- SQL173 REHEARSAL: read-only exact predecessor/installation validation.
--
-- This artifact deliberately does not call the runtime deletion RPC and does
-- not mutate application rows. True delete semantics require a separately
-- approved disposable non-Production fixture through the reviewed UI path.
WITH
expected_fks(
  relation_schema,
  relation_name,
  constraint_name,
  exact_definition,
  present_when_installed,
  is_deferrable,
  is_initially_deferred
) AS (
  VALUES
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
  ('public','expense_edit_revision_bindings','expense_edit_revision_bindings_draft_id_fkey','FOREIGN KEY (draft_id) REFERENCES expense_private_drafts(id) ON DELETE RESTRICT',true,false,false)
),
expected_triggers(
  relation_name,
  trigger_name,
  function_signature,
  trigger_type,
  is_constraint,
  is_deferrable,
  is_initially_deferred,
  update_columns,
  has_when,
  present_in_predecessor
) AS (
  VALUES
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
  ('relationship_sources','relationship_sources_expense_live_context_guard','public.expense_validate_relationship_source_live_context()',23::smallint,false,false,false,ARRAY['relationship_id','source_id','source_type']::text[],false,false)
),
relevant_trigger_relations(relation_name) AS (
  VALUES
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
  ('teskeid_event_expense_participant_sources'),('expense_unconfirmed_finalizations')
),
fk_delete_targets(relation_name) AS (
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
expected_prerequisite_relations(relation_name) AS (
  VALUES
    ('expense_activity'),('expense_activity_audience'),('expense_claim_disputes'),
    ('expense_edit_revision_bindings'),('expense_event_contexts'),
    ('expense_event_participants'),('expense_group_members'),('expense_groups'),
    ('expense_member_identity_bindings'),('expense_member_invitations'),
    ('expense_member_name_revisions'),('expense_obligations'),
    ('expense_payment_preference_assignments'),('expense_payments'),
    ('expense_private_drafts'),('expense_unconfirmed_publications'),('expense_repayment_allocations'),
    ('expense_repayments'),('expense_revisions'),
    ('expense_settlement_batch_items'),('expense_share_collaborators'),
    ('expense_shares'),('expenses'),('recent_events'),
    ('relationship_circle_expense_contexts'),('relationship_sources'),('expense_mutation_requests'),
    ('teskeid_event_expense_links'),
    ('teskeid_event_expense_participant_sources'),
    ('expense_unconfirmed_finalizations'),('relationships')
),
prerequisite_state AS (
  SELECT pg_catalog.count(*) = 31
    AND COALESCE(pg_catalog.bool_and(
      pg_catalog.to_regclass(
        pg_catalog.format('public.%I', expected.relation_name)
      ) IS NOT NULL
    ), false)
    AND pg_catalog.to_regprocedure('public.expense_assert_beta_actor(uuid)') IS NOT NULL
    AND pg_catalog.to_regprocedure('public.expense_begin_request(uuid,uuid,text,text)') IS NOT NULL
    AND pg_catalog.to_regprocedure('public.expense_finish_request(uuid,uuid,jsonb)') IS NOT NULL AS ok
  FROM expected_prerequisite_relations AS expected
),
relationship_source_constraint_state AS (
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
    ), false) AS ok
  FROM (VALUES
    ('relationship_sources_relationship_id_source_type_source_id_key', 'u', 'UNIQUE (relationship_id, source_type, source_id)', true),
    ('relationship_sources_source_type_check', 'c', 'CHECK ((source_type = ANY (ARRAY[''loans''::text, ''expenses''::text])))', false)
  ) AS expected(constraint_name, constraint_type, exact_definition, no_inherit)
  LEFT JOIN pg_catalog.pg_constraint AS constraint_row
    ON constraint_row.conrelid = pg_catalog.to_regclass('public.relationship_sources')
   AND constraint_row.conname = expected.constraint_name
),
existing_relation_acl_state AS (
  SELECT pg_catalog.count(*) = 2
    AND COALESCE(pg_catalog.bool_and((
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
    )), false) AS ok
  FROM (VALUES
    ('relationship_sources', true),
    ('expense_mutation_requests', false)
  ) AS expected(relation_name, service_dml)
  JOIN pg_catalog.pg_class AS relation
    ON relation.oid = pg_catalog.to_regclass('public.' || expected.relation_name)
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
),
predecessor_fk_state AS (
  SELECT pg_catalog.count(*) = 48
    AND COALESCE(pg_catalog.bool_and(
      expected.relation_schema IS NOT NULL
      AND actual.relation_schema IS NOT NULL
      AND actual.exact_definition = expected.exact_definition
      AND actual.convalidated
      AND actual.condeferrable = expected.is_deferrable
      AND actual.condeferred = expected.is_initially_deferred
    ), false) AS ok
  FROM expected_fks AS expected
  FULL JOIN actual_fks AS actual
    USING (relation_schema, relation_name, constraint_name)
),
installed_fk_state AS (
  SELECT pg_catalog.count(*) = 47
    AND COALESCE(pg_catalog.bool_and(
      expected.relation_schema IS NOT NULL
      AND actual.relation_schema IS NOT NULL
      AND actual.exact_definition = expected.exact_definition
      AND actual.convalidated
      AND actual.condeferrable = expected.is_deferrable
      AND actual.condeferred = expected.is_initially_deferred
    ), false) AS ok
  FROM (
    SELECT *
    FROM expected_fks
    WHERE present_when_installed
  ) AS expected
  FULL JOIN actual_fks AS actual
    USING (relation_schema, relation_name, constraint_name)
),
actual_triggers AS MATERIALIZED (
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
  JOIN relevant_trigger_relations AS relevant
    ON relevant.relation_name = relation.relname
  JOIN pg_catalog.pg_proc AS routine
    ON routine.oid = trigger_row.tgfoid
  JOIN pg_catalog.pg_namespace AS function_namespace
    ON function_namespace.oid = routine.pronamespace
  WHERE NOT trigger_row.tgisinternal
    AND trigger_row.tgenabled <> 'D'
),
predecessor_trigger_state AS (
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
    ), false) AS ok
  FROM (
    SELECT *
    FROM expected_triggers
    WHERE present_in_predecessor
  ) AS expected
  FULL JOIN actual_triggers AS actual
    USING (relation_name, trigger_name)
),
installed_trigger_state AS (
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
    ), false) AS ok
  FROM expected_triggers AS expected
  FULL JOIN actual_triggers AS actual
    USING (relation_name, trigger_name)
),
expected_sql173_function_identities(
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
),
predecessor_source_state AS (
  SELECT pg_catalog.count(routine.oid) = 3
    AND COALESCE(pg_catalog.bool_and(
      pg_catalog.md5(
        pg_catalog.replace(routine.prosrc, E'\r\n', E'\n')
      ) = expected.source_md5
    ), false) AS ok
  FROM (VALUES
    ('public.expense_revisions_immutable()', 'ed60ad79162d83e2e2586d9450791534'),
    ('public.expense_member_name_revision_immutable()', '38c4fa17868c3a9b11fcbb038c4b11ec'),
    ('public.expense_guard_share_collaborator_mutation()', '0a441bb99e791e29fac6d9162027d343')
  ) AS expected(signature, source_md5)
  LEFT JOIN pg_catalog.pg_proc AS routine
    ON routine.oid = pg_catalog.to_regprocedure(expected.signature)
),
installed_source_state AS (
  SELECT pg_catalog.count(routine.oid) = 13
    AND COALESCE(pg_catalog.bool_and(
      pg_catalog.md5(
        pg_catalog.replace(routine.prosrc, E'\r\n', E'\n')
      ) = expected.source_md5
      AND routine.prosecdef = expected.security_definer
      AND routine.provolatile::text = expected.volatility
      AND routine.proconfig = ARRAY['search_path=""']::text[]
      AND pg_catalog.pg_get_userbyid(routine.proowner) = 'postgres'
      AND language.lanname = expected.language_name
    ), false) AS ok
  FROM (VALUES
    ('public.expense_deleted_tombstone_immutable()', '4eb040d0bdeb874c2cb22c844bab1ca4', false, 'v', 'plpgsql'),
    ('public.expense_reject_deleted_id_reuse()', '0d0da15e31183448a4382466e84c216c', true, 'v', 'plpgsql'),
    ('public.expense_validate_finalization_expense_reference()', '3124b6233c3045627463f49487a49c59', true, 'v', 'plpgsql'),
    ('public.expense_hard_delete_authorized(uuid)', '9381e225abe7cea9f582afb62c774d00', true, 'v', 'sql'),
    ('public.expense_revisions_immutable()', '01e24a341ffc1f83be0c92235ba76a6b', false, 'v', 'plpgsql'),
    ('public.expense_member_name_revision_immutable()', '756c28d816b3ad4f5eb66209cb061b94', true, 'v', 'plpgsql'),
    ('public.expense_guard_share_collaborator_mutation()', '6dc57dd8a7871fed6299d345ddda3df7', true, 'v', 'plpgsql'),
    ('public.expense_validate_relationship_source_live_context()', 'de5c6904c63278360cf0f2c9796bb5c7', true, 'v', 'plpgsql'),
    ('public.expense_insert_relationship_source(uuid,uuid,uuid,uuid)', 'e2415ab3ef58b15709627f530f0f6003', true, 'v', 'plpgsql'),
    ('public.expense_hard_delete_receipt_shape_known(text,jsonb)', 'edb8a21d01ffdbbb8e9aa2b94c7c2594', true, 'i', 'sql'),
    ('public.expense_hard_delete_receipts_classified(uuid,uuid,boolean,uuid[])', '9def695d70fc38b63011cb2bd12e2e67', true, 's', 'plpgsql'),
    ('public.expense_get_own_delete_capability(uuid,uuid)', 'ffbd530e2f759d85809a34045ac15a1e', true, 's', 'plpgsql'),
    ('public.expense_delete_own_unsettled_expense(uuid,uuid,bigint,uuid)', '41bc44fc718a17fc4fc8c0777e0a0a67', true, 'v', 'plpgsql')
  ) AS expected(signature, source_md5, security_definer, volatility, language_name)
  LEFT JOIN pg_catalog.pg_proc AS routine
    ON routine.oid = pg_catalog.to_regprocedure(expected.signature)
  LEFT JOIN pg_catalog.pg_language AS language
    ON language.oid = routine.prolang
),
expected_rpc_metadata(
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
),
rpc_metadata_state AS (
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
    ), false) AS ok
  FROM expected_rpc_metadata AS expected
  JOIN pg_catalog.pg_proc AS routine
    ON routine.oid = pg_catalog.to_regprocedure(expected.signature)
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = routine.pronamespace
  JOIN pg_catalog.pg_language AS language
    ON language.oid = routine.prolang
),
expected_function_acl(signature, service_execute) AS (
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
),
function_acl_state AS (
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
    )), false) AS ok
  FROM expected_function_acl AS expected
  JOIN pg_catalog.pg_proc AS routine
    ON routine.oid = pg_catalog.to_regprocedure(expected.signature)
),
expected_private_columns(
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
),
private_relation_state AS (
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
    ), false) AS ok
  FROM pg_catalog.pg_class AS relation
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
   AND namespace.nspname = 'public'
  WHERE relation.relname IN (
    'expense_deleted_expense_tombstones',
    'expense_hard_delete_authorizations'
  )
),
object_state AS (
  SELECT
    pg_catalog.to_regclass('public.expense_deleted_expense_tombstones') IS NOT NULL AS tombstones_present,
    pg_catalog.to_regclass('public.expense_hard_delete_authorizations') IS NOT NULL AS authorizations_present,
    pg_catalog.to_regprocedure('public.expense_deleted_tombstone_immutable()') IS NOT NULL AS tombstone_guard_function_present,
    pg_catalog.to_regprocedure('public.expense_reject_deleted_id_reuse()') IS NOT NULL AS reuse_guard_function_present,
    pg_catalog.to_regprocedure('public.expense_validate_finalization_expense_reference()') IS NOT NULL AS finalization_guard_function_present,
    pg_catalog.to_regprocedure('public.expense_hard_delete_authorized(uuid)') IS NOT NULL AS authorization_function_present,
    pg_catalog.to_regprocedure('public.expense_validate_relationship_source_live_context()') IS NOT NULL AS source_guard_function_present,
    pg_catalog.to_regprocedure('public.expense_insert_relationship_source(uuid,uuid,uuid,uuid)') IS NOT NULL AS source_rpc_present,
    pg_catalog.to_regprocedure('public.expense_hard_delete_receipt_shape_known(text,jsonb)') IS NOT NULL AS receipt_shape_function_present,
    pg_catalog.to_regprocedure('public.expense_hard_delete_receipts_classified(uuid,uuid,boolean,uuid[])') IS NOT NULL AS receipts_classified_function_present,
    pg_catalog.to_regprocedure('public.expense_get_own_delete_capability(uuid,uuid)') IS NOT NULL AS capability_present,
    pg_catalog.to_regprocedure('public.expense_delete_own_unsettled_expense(uuid,uuid,bigint,uuid)') IS NOT NULL AS mutation_present
),
exact_state AS (
  SELECT
    (SELECT ok FROM prerequisite_state) AS prerequisites_ok,
    (SELECT ok FROM relationship_source_constraint_state) AS relationship_source_constraints_exact,
    (SELECT ok FROM existing_relation_acl_state) AS existing_relation_acls_exact,
    (SELECT ok FROM predecessor_fk_state) AS predecessor_fks_exact,
    (SELECT ok FROM installed_fk_state) AS installed_fks_exact,
    (SELECT ok FROM predecessor_trigger_state) AS predecessor_triggers_exact,
    (SELECT ok FROM installed_trigger_state) AS installed_triggers_exact,
    (SELECT ok FROM predecessor_source_state)
      AND (SELECT ok FROM predecessor_function_identity_state) AS predecessor_sources_exact,
    (SELECT ok FROM installed_source_state)
      AND (SELECT ok FROM installed_function_identity_state) AS installed_sources_exact,
    (SELECT ok FROM rpc_metadata_state) AS rpc_metadata_exact,
    (SELECT ok FROM function_acl_state) AS function_acls_exact,
    (SELECT ok FROM private_relation_state)
      AND (SELECT ok FROM private_column_state)
      AND (SELECT ok FROM private_constraint_state)
      AND (SELECT ok FROM private_index_state) AS private_relations_exact,
    object_state.*
  FROM object_state
),
classified AS (
  SELECT exact_state.*,
    NOT tombstones_present
      AND NOT authorizations_present
      AND NOT tombstone_guard_function_present
      AND NOT reuse_guard_function_present
      AND NOT finalization_guard_function_present
      AND NOT authorization_function_present
      AND NOT source_guard_function_present
      AND NOT source_rpc_present
      AND NOT receipt_shape_function_present
      AND NOT receipts_classified_function_present
      AND NOT capability_present
      AND NOT mutation_present AS adapter_absent,
    tombstones_present
      AND authorizations_present
      AND tombstone_guard_function_present
      AND reuse_guard_function_present
      AND finalization_guard_function_present
      AND authorization_function_present
      AND source_guard_function_present
      AND source_rpc_present
      AND receipt_shape_function_present
      AND receipts_classified_function_present
      AND capability_present
      AND mutation_present AS adapter_present
  FROM exact_state
),
checks AS (
  SELECT classified.*,
    prerequisites_ok
      AND relationship_source_constraints_exact
      AND existing_relation_acls_exact
      AND adapter_absent
      AND predecessor_fks_exact
      AND predecessor_triggers_exact
      AND predecessor_sources_exact AS predecessor_shape,
    prerequisites_ok
      AND relationship_source_constraints_exact
      AND existing_relation_acls_exact
      AND adapter_present
      AND installed_fks_exact
      AND installed_triggers_exact
      AND installed_sources_exact
      AND rpc_metadata_exact
      AND function_acls_exact
      AND private_relations_exact AS installed_shape
  FROM classified
)
SELECT
  prerequisites_ok,
  relationship_source_constraints_exact,
  predecessor_fks_exact,
  installed_fks_exact,
  predecessor_triggers_exact,
  installed_triggers_exact,
  predecessor_sources_exact,
  installed_sources_exact,
  adapter_absent,
  adapter_present,
  CASE
    WHEN predecessor_shape
      THEN 'NON_DESTRUCTIVE_PREDECESSOR_REHEARSAL_PASS'
    WHEN installed_shape
      THEN 'NON_DESTRUCTIVE_INSTALLED_REHEARSAL_PASS'
    ELSE 'REHEARSAL_DRIFT_STOP'
  END AS rehearsal_state
FROM checks;
