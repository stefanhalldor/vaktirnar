-- SQL131 owner-private expense events postflight -- READ ONLY.
-- Run immediately after SQL131. Require postconditions_ok=true and compare
-- baseline row counts with the preflight output.

BEGIN;
SET TRANSACTION READ ONLY;

WITH expected_relations(name) AS (
  VALUES ('expense_event_contexts'), ('expense_event_participants')
), relation_contract AS (
  SELECT
    pg_catalog.count(relation.oid) = pg_catalog.count(*)
      AND pg_catalog.bool_and(
        relation.relrowsecurity
        AND relation.relforcerowsecurity
        AND pg_catalog.pg_get_userbyid(relation.relowner) = 'postgres'
      ) AS rls_force_owner_ok,
    pg_catalog.bool_and(NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policy AS policy
      WHERE policy.polrelid = relation.oid
    )) AS no_policies_ok,
    pg_catalog.bool_and(
      NOT EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(
          COALESCE(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
        ) AS privilege
        LEFT JOIN pg_catalog.pg_roles AS grantee
          ON grantee.oid = privilege.grantee
        WHERE privilege.grantee = 0
           OR grantee.rolname IN ('anon', 'authenticated', 'service_role')
      )
      AND NOT EXISTS (
        SELECT 1
        FROM (VALUES
          ('anon'::name), ('authenticated'::name), ('service_role'::name)
        ) AS role_row(role_name)
        WHERE pg_catalog.has_table_privilege(role_row.role_name, relation.oid, 'SELECT')
           OR pg_catalog.has_table_privilege(role_row.role_name, relation.oid, 'INSERT')
           OR pg_catalog.has_table_privilege(role_row.role_name, relation.oid, 'UPDATE')
           OR pg_catalog.has_table_privilege(role_row.role_name, relation.oid, 'DELETE')
           OR pg_catalog.has_table_privilege(role_row.role_name, relation.oid, 'TRUNCATE')
           OR pg_catalog.has_table_privilege(role_row.role_name, relation.oid, 'REFERENCES')
           OR pg_catalog.has_table_privilege(role_row.role_name, relation.oid, 'TRIGGER')
           OR pg_catalog.has_any_column_privilege(role_row.role_name, relation.oid, 'SELECT')
           OR pg_catalog.has_any_column_privilege(role_row.role_name, relation.oid, 'INSERT')
           OR pg_catalog.has_any_column_privilege(role_row.role_name, relation.oid, 'UPDATE')
           OR pg_catalog.has_any_column_privilege(role_row.role_name, relation.oid, 'REFERENCES')
      )
    ) AS no_effective_table_or_column_privileges_ok
  FROM expected_relations AS expected
  LEFT JOIN pg_catalog.pg_class AS relation
    ON relation.oid = pg_catalog.to_regclass('public.' || expected.name)
), expected_constraints(table_name, constraint_name, tokens) AS (
  VALUES
    ('expense_event_contexts', 'expense_event_contexts_pkey',
      ARRAY['PRIMARY KEY', 'group_id']),
    ('expense_event_contexts', 'expense_event_contexts_group_fk',
      ARRAY['FOREIGN KEY', 'expense_groups', 'ON DELETE RESTRICT']),
    ('expense_event_contexts', 'expense_event_contexts_owner_fk',
      ARRAY['FOREIGN KEY', 'auth.users', 'ON DELETE RESTRICT']),
    ('expense_event_participants', 'expense_event_participants_pkey',
      ARRAY['PRIMARY KEY', 'group_id', 'member_id']),
    ('expense_event_participants', 'expense_event_participants_position_check',
      ARRAY['position', '0', '48']),
    ('expense_event_participants', 'expense_event_participants_position_key',
      ARRAY['UNIQUE', 'group_id', 'position', 'DEFERRABLE INITIALLY DEFERRED']),
    ('expense_event_participants', 'expense_event_participants_linked_user_key',
      ARRAY['UNIQUE', 'group_id', 'linked_user_id', 'DEFERRABLE INITIALLY DEFERRED']),
    ('expense_event_participants', 'expense_event_participants_context_fk',
      ARRAY['FOREIGN KEY', 'expense_event_contexts', 'ON DELETE CASCADE',
        'DEFERRABLE INITIALLY DEFERRED']),
    ('expense_event_participants', 'expense_event_participants_member_fk',
      ARRAY['FOREIGN KEY', 'expense_group_members', 'group_id', 'member_id',
        'ON DELETE RESTRICT', 'DEFERRABLE INITIALLY DEFERRED']),
    ('expense_event_participants', 'expense_event_participants_linked_user_fk',
      ARRAY['FOREIGN KEY', 'auth.users', 'ON DELETE SET NULL',
        'DEFERRABLE INITIALLY DEFERRED'])
), constraint_contract AS (
  SELECT pg_catalog.count(constraint_row.oid) = pg_catalog.count(*)
    AND pg_catalog.bool_and(
      constraint_row.convalidated
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.unnest(expected.tokens) AS token
        WHERE pg_catalog.strpos(
          pg_catalog.pg_get_constraintdef(constraint_row.oid), token
        ) = 0
      )
    ) AS critical_constraints_ok
  FROM expected_constraints AS expected
  LEFT JOIN pg_catalog.pg_constraint AS constraint_row
    ON constraint_row.conrelid = pg_catalog.to_regclass(
      'public.' || expected.table_name
    )
   AND constraint_row.conname = expected.constraint_name
), expected_indexes(index_name, tokens) AS (
  VALUES
    ('expense_event_contexts_owner_created_idx',
      ARRAY['expense_event_contexts', 'owner_user_id', 'created_at DESC', 'group_id DESC']),
    ('expense_event_participants_linked_user_idx',
      ARRAY['expense_event_participants', 'linked_user_id', 'WHERE (linked_user_id IS NOT NULL)'])
), index_contract AS (
  SELECT pg_catalog.count(index_row.indexrelid) = pg_catalog.count(*)
    AND pg_catalog.bool_and(NOT EXISTS (
      SELECT 1
      FROM pg_catalog.unnest(expected.tokens) AS token
      WHERE pg_catalog.strpos(
        pg_catalog.pg_get_indexdef(index_row.indexrelid), token
      ) = 0
    )) AS critical_indexes_ok
  FROM expected_indexes AS expected
  LEFT JOIN pg_catalog.pg_class AS index_relation
    ON index_relation.oid = pg_catalog.to_regclass('public.' || expected.index_name)
  LEFT JOIN pg_catalog.pg_index AS index_row
    ON index_row.indexrelid = index_relation.oid
), expected_functions(signature, return_type, service_execute) AS (
  VALUES
    ('public.expense_has_beta_access(uuid)', 'boolean', false),
    ('public.expense_assert_beta_actor(uuid)', 'void', false),
    ('public.expense_active_member_role(uuid,uuid)', 'text', false),
    ('public.expense_begin_request(uuid,uuid,text,text)', 'jsonb', false),
    ('public.expense_finish_request(uuid,uuid,jsonb)', 'void', false),
    ('public.expense_create_group(uuid,uuid,text,text,text,text,boolean,jsonb)', 'jsonb', true),
    ('public.expense_terminalize_member_invitations(uuid[],text)', 'integer', false),
    ('public.expense_create_unified_participant_invitation(uuid,uuid,uuid,text,uuid,text)', 'uuid', false),
    ('public.expense_link_guest_member_email(uuid,uuid,uuid,text,uuid)', 'jsonb', true),
    ('public.expense_remove_group_member(uuid,uuid,uuid,uuid)', 'jsonb', true),
    ('public.expense_rename_guest_member(uuid,uuid,uuid,text,uuid)', 'jsonb', true),
    ('public.expense_cancel_member_invitation(uuid,uuid,uuid)', 'jsonb', true),
    ('public.expense_respond_scoped_member_invitation(uuid,uuid,text,uuid)', 'jsonb', true),
    ('public.expense_event_valid_label(text,integer,integer)', 'boolean', false),
    ('public.expense_event_has_beta_access(uuid)', 'boolean', false),
    ('public.expense_event_assert_actor(uuid)', 'void', false),
    ('public.expense_event_assert_integrity(uuid)', 'void', false),
    ('public.expense_event_integrity_trigger()', 'trigger', false),
    ('public.expense_event_group_integrity_trigger()', 'trigger', false),
    ('public.expense_event_context_immutable()', 'trigger', false),
    ('public.expense_event_participant_immutable()', 'trigger', false),
    ('public.expense_event_roster_frozen()', 'trigger', false),
    ('public.expense_event_invitation_blocked()', 'trigger', false),
    ('public.expense_create_event_context(uuid,uuid,text,jsonb)', 'jsonb', true),
    ('public.expense_list_event_contexts(uuid)', 'record', true),
    ('public.expense_get_event_context(uuid,uuid)', 'jsonb', true),
    ('public.expense_is_event_context(uuid,uuid)', 'boolean', true),
    ('public.expense_prepare_account_deletion(uuid)', 'jsonb', true)
), function_contract AS (
  SELECT
    pg_catalog.count(procedure_row.oid) = pg_catalog.count(*)
      AND pg_catalog.bool_and(
        procedure_row.prosecdef
        AND procedure_row.prorettype = pg_catalog.to_regtype(expected.return_type)
        AND pg_catalog.pg_get_userbyid(procedure_row.proowner) = 'postgres'
        AND EXISTS (
          SELECT 1
          FROM pg_catalog.unnest(
            COALESCE(procedure_row.proconfig, ARRAY[]::text[])
          ) AS setting
          WHERE setting IN ('search_path=', 'search_path=""')
        )
        AND NOT pg_catalog.has_function_privilege(
          'anon', procedure_row.oid, 'EXECUTE'
        )
        AND NOT pg_catalog.has_function_privilege(
          'authenticated', procedure_row.oid, 'EXECUTE'
        )
        AND pg_catalog.has_function_privilege(
          'service_role', procedure_row.oid, 'EXECUTE'
        ) = expected.service_execute
        AND NOT EXISTS (
          SELECT 1
          FROM pg_catalog.aclexplode(
            COALESCE(
              procedure_row.proacl,
              pg_catalog.acldefault('f', procedure_row.proowner)
            )
          ) AS privilege
          LEFT JOIN pg_catalog.pg_roles AS grantee
            ON grantee.oid = privilege.grantee
          WHERE privilege.privilege_type = 'EXECUTE'
            AND privilege.grantee <> procedure_row.proowner
            AND (
              NOT expected.service_execute
              OR grantee.rolname IS DISTINCT FROM 'service_role'
              OR privilege.is_grantable
            )
        )
      ) AS sql131_function_acl_owner_ok
  FROM expected_functions AS expected
  LEFT JOIN pg_catalog.pg_proc AS procedure_row
    ON procedure_row.oid = pg_catalog.to_regprocedure(expected.signature)
), overload_contract AS (
  SELECT NOT EXISTS (
    SELECT procedure_row.proname
    FROM pg_catalog.pg_proc AS procedure_row
    JOIN pg_catalog.pg_namespace AS namespace_row
      ON namespace_row.oid = procedure_row.pronamespace
    WHERE namespace_row.nspname = 'public'
      AND procedure_row.proname IN (
        'expense_event_valid_label',
        'expense_event_has_beta_access',
        'expense_event_assert_actor',
        'expense_event_assert_integrity',
        'expense_event_integrity_trigger',
        'expense_event_group_integrity_trigger',
        'expense_event_context_immutable',
        'expense_event_participant_immutable',
        'expense_event_roster_frozen',
        'expense_event_invitation_blocked',
        'expense_create_event_context',
        'expense_list_event_contexts',
        'expense_get_event_context',
        'expense_is_event_context',
        'expense_prepare_account_deletion'
      )
    GROUP BY procedure_row.proname
    HAVING pg_catalog.count(*) <> 1
  ) AS no_unexpected_event_overloads_ok
), expected_triggers(
  table_name, trigger_name, function_signature, deferred, trigger_type
) AS (
  VALUES
    ('expense_event_contexts', 'expense_event_context_integrity_deferred',
      'public.expense_event_integrity_trigger()', true, 29::smallint),
    ('expense_event_participants', 'expense_event_participant_integrity_deferred',
      'public.expense_event_integrity_trigger()', true, 29::smallint),
    ('expense_groups', 'expense_event_group_integrity_deferred',
      'public.expense_event_group_integrity_trigger()', true, 25::smallint),
    ('expense_event_contexts', 'expense_event_context_immutable_guard',
      'public.expense_event_context_immutable()', false, 19::smallint),
    ('expense_event_participants', 'expense_event_participant_immutable_guard',
      'public.expense_event_participant_immutable()', false, 19::smallint),
    ('expense_group_members', 'expense_event_group_members_frozen_guard',
      'public.expense_event_roster_frozen()', false, 31::smallint),
    ('expense_member_invitations', 'expense_event_member_invitations_guard',
      'public.expense_event_invitation_blocked()', false, 23::smallint)
), trigger_contract AS (
  SELECT pg_catalog.count(trigger_row.oid) = pg_catalog.count(*)
    AND pg_catalog.bool_and(
      NOT trigger_row.tgisinternal
      AND trigger_row.tgenabled <> 'D'
      AND trigger_row.tgfoid = pg_catalog.to_regprocedure(
        expected.function_signature
      )
      AND trigger_row.tgdeferrable = expected.deferred
      AND trigger_row.tginitdeferred = expected.deferred
      AND trigger_row.tgtype = expected.trigger_type
    ) AS exact_trigger_bindings_ok
  FROM expected_triggers AS expected
  LEFT JOIN pg_catalog.pg_trigger AS trigger_row
    ON trigger_row.tgrelid = pg_catalog.to_regclass(
      'public.' || expected.table_name
    )
   AND trigger_row.tgname = expected.trigger_name
), feature_contract AS (
  SELECT pg_catalog.count(*) = 1
    AND pg_catalog.bool_and(
      constraint_row.convalidated
      AND pg_catalog.strpos(
        pg_catalog.pg_get_expr(
          constraint_row.conbin,
          constraint_row.conrelid
        ),
        'utlagt-og-endurgreitt'
      ) > 0
      AND pg_catalog.strpos(
        pg_catalog.pg_get_expr(
          constraint_row.conbin,
          constraint_row.conrelid
        ),
        'afmaeli-og-vidburdir'
      ) > 0
    ) AS feature_union_ok
  FROM pg_catalog.pg_constraint AS constraint_row
  WHERE constraint_row.conrelid = pg_catalog.to_regclass('public.feature_access')
    AND constraint_row.conname = 'feature_access_feature_key_check'
), data_contract AS (
  SELECT
    (SELECT pg_catalog.count(*) FROM public.expense_event_contexts)
      AS context_rows,
    (SELECT pg_catalog.count(*) FROM public.expense_event_participants)
      AS participant_rows,
    NOT EXISTS (
      SELECT 1
      FROM public.expense_event_contexts AS context_row
      LEFT JOIN public.expense_groups AS group_row
        ON group_row.id = context_row.group_id
      WHERE group_row.id IS NULL
         OR group_row.kind <> 'group'
         OR group_row.description IS NOT NULL
         OR group_row.emoji IS NOT NULL
         OR group_row.default_currency <> 'ISK'
         OR NOT group_row.default_include_creator
         OR group_row.created_by IS DISTINCT FROM context_row.owner_user_id
    ) AS no_invalid_context_rows,
    NOT EXISTS (
      SELECT 1
      FROM public.expense_event_contexts AS context_row
      WHERE (
        SELECT pg_catalog.count(*)
        FROM public.expense_group_members AS owner_member
        WHERE owner_member.group_id = context_row.group_id
          AND owner_member.user_id = context_row.owner_user_id
          AND owner_member.role = 'owner'
          AND owner_member.status = 'active'
      ) <> 1
         OR EXISTS (
           SELECT 1
           FROM public.expense_group_members AS other_member
           WHERE other_member.group_id = context_row.group_id
             AND NOT (
               other_member.user_id IS NOT DISTINCT FROM context_row.owner_user_id
               AND other_member.role = 'owner'
               AND other_member.status = 'active'
             )
             AND (
               other_member.user_id IS NOT NULL
               OR other_member.role <> 'member'
               OR other_member.status <> 'active'
             )
         )
    ) AS exact_owner_and_guest_membership_ok,
    NOT EXISTS (
      SELECT 1
      FROM public.expense_event_participants AS participant
      JOIN public.expense_event_contexts AS context_row
        ON context_row.group_id = participant.group_id
      LEFT JOIN public.expense_group_members AS member
        ON member.group_id = participant.group_id
       AND member.id = participant.member_id
      WHERE member.id IS NULL
         OR member.user_id IS NOT NULL
         OR member.role <> 'member'
         OR member.status <> 'active'
         OR participant.linked_user_id = context_row.owner_user_id
    ) AS participant_financial_separation_ok,
    NOT EXISTS (
      SELECT 1
      FROM public.expense_event_participants AS participant
      JOIN public.expense_group_members AS financial_member
        ON financial_member.group_id = participant.group_id
       AND financial_member.user_id = participant.linked_user_id
       AND financial_member.status IN ('active', 'invited')
      WHERE participant.linked_user_id IS NOT NULL
    ) AS linked_users_not_financial_members_ok,
    NOT EXISTS (
      SELECT 1
      FROM public.expense_event_contexts AS context_row
      JOIN public.expense_member_invitations AS invitation
        ON invitation.group_id = context_row.group_id
    ) AS no_event_invitations_ok,
    NOT EXISTS (
      SELECT 1
      FROM public.expense_event_contexts AS context_row
      JOIN public.expense_share_collaborators AS collaboration
        ON collaboration.group_id = context_row.group_id
    ) AS no_event_share_collaborators_ok,
    NOT EXISTS (
      SELECT 1
      FROM public.expense_event_contexts AS context_row
      WHERE (
        SELECT pg_catalog.count(*)
        FROM public.expense_group_members AS member
        WHERE member.group_id = context_row.group_id
      ) NOT BETWEEN 1 AND 50
         OR (
           SELECT pg_catalog.count(*)
           FROM public.expense_event_participants AS participant
           WHERE participant.group_id = context_row.group_id
         ) <> (
           SELECT pg_catalog.count(*) - 1
           FROM public.expense_group_members AS member
           WHERE member.group_id = context_row.group_id
         )
         OR EXISTS (
           SELECT 1
           FROM public.expense_group_members AS member
           WHERE member.group_id = context_row.group_id
             AND member.role <> 'owner'
             AND NOT EXISTS (
               SELECT 1
               FROM public.expense_event_participants AS participant
               WHERE participant.group_id = member.group_id
                 AND participant.member_id = member.id
             )
         )
         OR EXISTS (
           SELECT 1
           FROM public.expense_event_participants AS participant
           WHERE participant.group_id = context_row.group_id
           GROUP BY participant.group_id
           HAVING pg_catalog.min(participant.position) <> 0
              OR pg_catalog.max(participant.position) <> pg_catalog.count(*) - 1
         )
    ) AS complete_contiguous_rosters_ok
), account_deletion_contract AS (
  SELECT COALESCE((
    SELECT pg_catalog.strpos(procedure_row.prosrc, 'expense_event_participants') > 0
    AND pg_catalog.strpos(procedure_row.prosrc, 'expense_event_contexts') > 0
    AND pg_catalog.strpos(
      procedure_row.prosrc, '''afmaeli-og-vidburdir'''
    ) > 0
    AND pg_catalog.strpos(
      procedure_row.prosrc,
      'UP' || 'DATE public.expense_event_participants'
    ) > 0
    AND pg_catalog.strpos(
      procedure_row.prosrc,
      'UP' || 'DATE public.expense_event_participants'
    ) < pg_catalog.strpos(
      procedure_row.prosrc,
      'DE' || 'LETE FROM public.expense_event_contexts'
    )
    AND pg_catalog.strpos(
      procedure_row.prosrc,
      'DE' || 'LETE FROM public.expense_event_contexts'
    ) < pg_catalog.strpos(
      procedure_row.prosrc,
      'UP' || 'DATE public.expense_group_members'
    )
    AND pg_catalog.strpos(
      procedure_row.prosrc,
      'DE' || 'LETE FROM public.expense_payment_preferences'
    ) > 0
    AND pg_catalog.strpos(
      procedure_row.prosrc,
      'public.expense_terminalize_member_invitations'
    ) > 0
    AND pg_catalog.strpos(
      procedure_row.prosrc, '''invitations_scrubbed'''
    ) > 0
    FROM pg_catalog.pg_proc AS procedure_row
    WHERE procedure_row.oid = pg_catalog.to_regprocedure(
      'public.expense_prepare_account_deletion(uuid)'
    )
  ), false) AS account_deletion_event_order_and_parity_ok
), counts AS (
  SELECT
    (SELECT pg_catalog.count(*) FROM public.expense_groups) AS group_rows,
    (SELECT pg_catalog.count(*) FROM public.expense_group_members) AS member_rows,
    (SELECT pg_catalog.count(*) FROM public.expenses) AS expense_rows,
    (SELECT pg_catalog.count(*) FROM public.expense_member_invitations) AS invitation_rows,
    (SELECT pg_catalog.count(*) FROM public.expense_share_collaborators) AS collaborator_rows,
    (SELECT pg_catalog.count(*) FROM public.expense_activity) AS activity_rows,
    (SELECT pg_catalog.count(*) FROM public.expense_mutation_requests) AS receipt_rows,
    (SELECT pg_catalog.count(*) FROM public.relationships) AS relationship_rows
)
SELECT
  current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.clock_timestamp() AS checked_at,
  counts.group_rows,
  counts.member_rows,
  counts.expense_rows,
  counts.invitation_rows,
  counts.collaborator_rows,
  counts.activity_rows,
  counts.receipt_rows,
  counts.relationship_rows,
  data_contract.context_rows,
  data_contract.participant_rows,
  relation_contract.rls_force_owner_ok,
  relation_contract.no_policies_ok,
  relation_contract.no_effective_table_or_column_privileges_ok,
  constraint_contract.critical_constraints_ok,
  index_contract.critical_indexes_ok,
  function_contract.sql131_function_acl_owner_ok,
  overload_contract.no_unexpected_event_overloads_ok,
  trigger_contract.exact_trigger_bindings_ok,
  feature_contract.feature_union_ok,
  data_contract.no_invalid_context_rows,
  data_contract.exact_owner_and_guest_membership_ok,
  data_contract.participant_financial_separation_ok,
  data_contract.linked_users_not_financial_members_ok,
  data_contract.no_event_invitations_ok,
  data_contract.no_event_share_collaborators_ok,
  data_contract.complete_contiguous_rosters_ok,
  account_deletion_contract.account_deletion_event_order_and_parity_ok,
  (
    data_contract.context_rows = 0
    AND data_contract.participant_rows = 0
    AND relation_contract.rls_force_owner_ok
    AND relation_contract.no_policies_ok
    AND relation_contract.no_effective_table_or_column_privileges_ok
    AND constraint_contract.critical_constraints_ok
    AND index_contract.critical_indexes_ok
    AND function_contract.sql131_function_acl_owner_ok
    AND overload_contract.no_unexpected_event_overloads_ok
    AND trigger_contract.exact_trigger_bindings_ok
    AND feature_contract.feature_union_ok
    AND data_contract.no_invalid_context_rows
    AND data_contract.exact_owner_and_guest_membership_ok
    AND data_contract.participant_financial_separation_ok
    AND data_contract.linked_users_not_financial_members_ok
    AND data_contract.no_event_invitations_ok
    AND data_contract.no_event_share_collaborators_ok
    AND data_contract.complete_contiguous_rosters_ok
    AND account_deletion_contract.account_deletion_event_order_and_parity_ok
  ) AS postconditions_ok
FROM relation_contract
CROSS JOIN constraint_contract
CROSS JOIN index_contract
CROSS JOIN function_contract
CROSS JOIN overload_contract
CROSS JOIN trigger_contract
CROSS JOIN feature_contract
CROSS JOIN data_contract
CROSS JOIN account_deletion_contract
CROSS JOIN counts;

ROLLBACK;
