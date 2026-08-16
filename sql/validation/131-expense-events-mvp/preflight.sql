-- SQL131 owner-private expense events preflight -- READ ONLY.
-- Run only on the explicitly selected database and share the complete row.

BEGIN;
SET TRANSACTION READ ONLY;

WITH required_roles(role_name) AS (
  VALUES ('anon'), ('authenticated'), ('service_role'), ('postgres')
), role_contract AS (
  SELECT
    pg_catalog.count(present.oid) = pg_catalog.count(*) AS required_roles_ok,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_roles AS execution_role
      WHERE execution_role.rolname = current_user
        AND (execution_role.rolname = 'postgres' OR execution_role.rolsuper)
    ) AS execution_role_ok
  FROM required_roles AS required
  LEFT JOIN pg_catalog.pg_roles AS present
    ON present.rolname = required.role_name
), dependencies AS (
  SELECT
    pg_catalog.to_regclass('auth.users') IS NOT NULL AS auth_users_ok,
    pg_catalog.to_regclass('public.profiles') IS NOT NULL AS profiles_ok,
    pg_catalog.to_regclass('public.feature_access') IS NOT NULL AS feature_access_ok,
    pg_catalog.to_regclass('public.relationships') IS NOT NULL AS relationships_ok,
    pg_catalog.to_regclass('public.expense_groups') IS NOT NULL AS groups_ok,
    pg_catalog.to_regclass('public.expense_group_members') IS NOT NULL AS members_ok,
    pg_catalog.to_regclass('public.expenses') IS NOT NULL AS expenses_ok,
    pg_catalog.to_regclass('public.expense_repayments') IS NOT NULL AS repayments_ok,
    pg_catalog.to_regclass('public.expense_payment_preferences') IS NOT NULL AS preferences_ok,
    pg_catalog.to_regclass('public.expense_member_invitations') IS NOT NULL AS invitations_ok,
    pg_catalog.to_regclass('public.expense_share_collaborators') IS NOT NULL AS collaborators_ok,
    pg_catalog.to_regclass('public.expense_mutation_requests') IS NOT NULL AS receipts_ok,
    pg_catalog.to_regclass('public.expense_activity') IS NOT NULL AS activity_ok,
    pg_catalog.to_regclass('public.expense_activity_audience') IS NOT NULL AS audience_ok,
    pg_catalog.to_regclass('public.recent_events') IS NOT NULL AS recent_events_ok,
    pg_catalog.to_regprocedure('pg_catalog.gen_random_uuid()') IS NOT NULL AS uuid_ok,
    pg_catalog.to_regprocedure('public.normalize_email_canonical(text)') IS NOT NULL
      AS normalize_email_ok
), target_relations(name) AS (
  VALUES
    ('expense_event_contexts'),
    ('expense_event_participants'),
    ('expense_event_contexts_owner_created_idx'),
    ('expense_event_participants_linked_user_idx')
), target_functions(signature) AS (
  VALUES
    ('public.expense_event_valid_label(text,integer,integer)'),
    ('public.expense_event_has_beta_access(uuid)'),
    ('public.expense_event_assert_actor(uuid)'),
    ('public.expense_event_assert_integrity(uuid)'),
    ('public.expense_event_integrity_trigger()'),
    ('public.expense_event_group_integrity_trigger()'),
    ('public.expense_event_context_immutable()'),
    ('public.expense_event_participant_immutable()'),
    ('public.expense_event_roster_frozen()'),
    ('public.expense_event_invitation_blocked()'),
    ('public.expense_create_event_context(uuid,uuid,text,jsonb)'),
    ('public.expense_list_event_contexts(uuid)'),
    ('public.expense_get_event_context(uuid,uuid)'),
    ('public.expense_is_event_context(uuid,uuid)')
), target_contract AS (
  SELECT
    NOT EXISTS (
      SELECT 1 FROM target_relations AS target
      WHERE pg_catalog.to_regclass('public.' || target.name) IS NOT NULL
    )
    AND NOT EXISTS (
      SELECT 1 FROM target_functions AS target
      WHERE pg_catalog.to_regprocedure(target.signature) IS NOT NULL
    )
    AND NOT EXISTS (
      SELECT 1
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
          'expense_is_event_context'
        )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_trigger AS trigger_row
      WHERE trigger_row.tgname IN (
        'expense_event_context_integrity_deferred',
        'expense_event_participant_integrity_deferred',
        'expense_event_group_integrity_deferred',
        'expense_event_context_immutable_guard',
        'expense_event_participant_immutable_guard',
        'expense_event_group_members_frozen_guard',
        'expense_event_member_invitations_guard'
      )
        AND NOT trigger_row.tgisinternal
    ) AS target_slots_clear
), feature_contract AS (
  SELECT
    pg_catalog.count(*) = 1
    AND pg_catalog.bool_and(
      constraint_row.contype = 'c'
      AND constraint_row.convalidated
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
      ) = 0
    ) AS feature_constraint_ok
  FROM pg_catalog.pg_constraint AS constraint_row
  WHERE constraint_row.conrelid = pg_catalog.to_regclass('public.feature_access')
    AND constraint_row.conname = 'feature_access_feature_key_check'
), expected_columns(table_name, column_name, data_type, nullable) AS (
  VALUES
    ('relationships', 'id', 'uuid', 'NO'),
    ('relationships', 'owner_id', 'uuid', 'NO'),
    ('relationships', 'counterpart_user_id', 'uuid', 'YES'),
    ('profiles', 'id', 'uuid', 'NO'),
    ('profiles', 'display_name', 'text', 'NO'),
    ('expense_groups', 'id', 'uuid', 'NO'),
    ('expense_groups', 'created_by', 'uuid', 'YES'),
    ('expense_group_members', 'id', 'uuid', 'NO'),
    ('expense_group_members', 'group_id', 'uuid', 'NO'),
    ('expense_group_members', 'user_id', 'uuid', 'YES'),
    ('expense_group_members', 'display_name', 'text', 'NO'),
    ('expense_group_members', 'role', 'text', 'NO'),
    ('expense_group_members', 'status', 'text', 'NO'),
    ('expenses', 'group_id', 'uuid', 'NO'),
    ('expenses', 'status', 'text', 'NO'),
    ('expense_member_invitations', 'group_id', 'uuid', 'NO'),
    ('expense_share_collaborators', 'group_id', 'uuid', 'NO')
), column_contract AS (
  SELECT
    pg_catalog.count(column_row.column_name) = pg_catalog.count(*)
      AND pg_catalog.bool_and(
        column_row.data_type = expected.data_type
        AND column_row.is_nullable = expected.nullable
      ) AS baseline_schema_ok,
    COALESCE(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'table', expected.table_name,
          'column', expected.column_name,
          'expectedType', expected.data_type,
          'actualType', column_row.data_type,
          'expectedNullable', expected.nullable,
          'actualNullable', column_row.is_nullable
        ) ORDER BY expected.table_name, expected.column_name
      ) FILTER (
        WHERE column_row.column_name IS NULL
           OR column_row.data_type IS DISTINCT FROM expected.data_type
           OR column_row.is_nullable IS DISTINCT FROM expected.nullable
      ),
      '[]'::jsonb
    ) AS baseline_schema_mismatches
  FROM expected_columns AS expected
  LEFT JOIN information_schema.columns AS column_row
    ON column_row.table_schema = 'public'
   AND column_row.table_name = expected.table_name
   AND column_row.column_name = expected.column_name
), baseline_relations(name, service_select) AS (
  VALUES
    ('expense_groups', true),
    ('expense_group_members', true),
    ('expenses', true),
    ('expense_repayments', true),
    ('expense_payment_preferences', true),
    ('expense_member_invitations', true),
    ('expense_share_collaborators', true),
    ('expense_activity', true),
    ('expense_activity_audience', false),
    ('expense_mutation_requests', false)
), baseline_relation_contract AS (
  SELECT pg_catalog.count(relation.oid) = pg_catalog.count(*)
    AND pg_catalog.bool_and(
      relation.relrowsecurity
      AND pg_catalog.pg_get_userbyid(relation.relowner) = 'postgres'
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_policy AS policy
        WHERE policy.polrelid = relation.oid
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(
          COALESCE(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
        ) AS privilege
        LEFT JOIN pg_catalog.pg_roles AS grantee
          ON grantee.oid = privilege.grantee
        WHERE privilege.grantee = 0
           OR grantee.rolname IN ('anon', 'authenticated')
           OR (
             grantee.rolname = 'service_role'
             AND (
               NOT baseline_relations.service_select
               OR privilege.privilege_type <> 'SELECT'
               OR privilege.is_grantable
             )
           )
      )
      AND pg_catalog.has_table_privilege(
        'service_role', relation.oid, 'SELECT'
      ) = baseline_relations.service_select
      AND NOT pg_catalog.has_table_privilege('service_role', relation.oid, 'INSERT')
      AND NOT pg_catalog.has_table_privilege('service_role', relation.oid, 'UPDATE')
      AND NOT pg_catalog.has_table_privilege('service_role', relation.oid, 'DELETE')
      AND NOT pg_catalog.has_table_privilege('service_role', relation.oid, 'TRUNCATE')
      AND NOT pg_catalog.has_table_privilege('service_role', relation.oid, 'REFERENCES')
      AND NOT pg_catalog.has_table_privilege('service_role', relation.oid, 'TRIGGER')
      AND (
        baseline_relations.service_select
        OR NOT pg_catalog.has_any_column_privilege(
          'service_role', relation.oid, 'SELECT'
        )
      )
      AND NOT pg_catalog.has_any_column_privilege('service_role', relation.oid, 'INSERT')
      AND NOT pg_catalog.has_any_column_privilege('service_role', relation.oid, 'UPDATE')
      AND NOT pg_catalog.has_any_column_privilege('service_role', relation.oid, 'REFERENCES')
      AND NOT EXISTS (
        SELECT 1
        FROM (VALUES ('anon'::name), ('authenticated'::name)) AS browser(role_name)
        WHERE pg_catalog.has_table_privilege(browser.role_name, relation.oid, 'SELECT')
           OR pg_catalog.has_table_privilege(browser.role_name, relation.oid, 'INSERT')
           OR pg_catalog.has_table_privilege(browser.role_name, relation.oid, 'UPDATE')
           OR pg_catalog.has_table_privilege(browser.role_name, relation.oid, 'DELETE')
           OR pg_catalog.has_table_privilege(browser.role_name, relation.oid, 'TRUNCATE')
           OR pg_catalog.has_table_privilege(browser.role_name, relation.oid, 'REFERENCES')
           OR pg_catalog.has_table_privilege(browser.role_name, relation.oid, 'TRIGGER')
           OR pg_catalog.has_any_column_privilege(browser.role_name, relation.oid, 'SELECT')
           OR pg_catalog.has_any_column_privilege(browser.role_name, relation.oid, 'INSERT')
           OR pg_catalog.has_any_column_privilege(browser.role_name, relation.oid, 'UPDATE')
           OR pg_catalog.has_any_column_privilege(browser.role_name, relation.oid, 'REFERENCES')
      )
    ) AS baseline_private_tables_ok
  FROM baseline_relations
  LEFT JOIN pg_catalog.pg_class AS relation
    ON relation.oid = pg_catalog.to_regclass('public.' || baseline_relations.name)
), member_key_contract AS (
  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = pg_catalog.to_regclass(
      'public.expense_group_members'
    )
      AND constraint_row.contype IN ('p', 'u')
      AND constraint_row.convalidated
      AND pg_catalog.pg_get_constraintdef(constraint_row.oid)
        LIKE 'UNIQUE (group_id, id)%'
  ) AS member_composite_key_ok
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
    ('public.expense_prepare_account_deletion(uuid)', 'jsonb', true)
), function_contract AS (
  SELECT pg_catalog.count(procedure_row.oid) = pg_catalog.count(*)
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
    ) AS baseline_function_acl_owner_ok
  FROM expected_functions AS expected
  LEFT JOIN pg_catalog.pg_proc AS procedure_row
    ON procedure_row.oid = pg_catalog.to_regprocedure(expected.signature)
), account_deletion_contract AS (
  SELECT COALESCE((
    SELECT procedure_row.prosrc IS NOT NULL
    AND pg_catalog.strpos(
      procedure_row.prosrc,
      'hashtextextended(p_user_id::text, 9601)'
    ) > 0
    AND pg_catalog.strpos(
      procedure_row.prosrc,
      'hashtextextended(v_email_canonical, 9702)'
    ) > 0
    AND pg_catalog.strpos(
      procedure_row.prosrc,
      'public.expense_terminalize_member_invitations'
    ) > 0
    AND pg_catalog.strpos(
      procedure_row.prosrc,
      'hashtextextended(p_user_id::text, 9602)'
    ) > 0
    AND pg_catalog.strpos(
      procedure_row.prosrc,
      'DE' || 'LETE FROM public.expense_payment_preferences'
    ) > 0
    AND pg_catalog.strpos(
      procedure_row.prosrc,
      'UP' || 'DATE public.expense_group_members'
    ) > 0
    AND pg_catalog.strpos(
      procedure_row.prosrc,
      '''invitations_scrubbed'''
    ) > 0
    FROM pg_catalog.pg_proc AS procedure_row
    WHERE procedure_row.oid = pg_catalog.to_regprocedure(
      'public.expense_prepare_account_deletion(uuid)'
    )
  ), false) AS account_deletion_body_ok
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
  target_contract.target_slots_clear,
  feature_contract.feature_constraint_ok,
  column_contract.baseline_schema_ok,
  column_contract.baseline_schema_mismatches,
  baseline_relation_contract.baseline_private_tables_ok,
  member_key_contract.member_composite_key_ok,
  function_contract.baseline_function_acl_owner_ok,
  account_deletion_contract.account_deletion_body_ok,
  (
    role_contract.required_roles_ok
    AND role_contract.execution_role_ok
    AND dependencies.auth_users_ok
    AND dependencies.profiles_ok
    AND dependencies.feature_access_ok
    AND dependencies.relationships_ok
    AND dependencies.groups_ok
    AND dependencies.members_ok
    AND dependencies.expenses_ok
    AND dependencies.repayments_ok
    AND dependencies.preferences_ok
    AND dependencies.invitations_ok
    AND dependencies.collaborators_ok
    AND dependencies.receipts_ok
    AND dependencies.activity_ok
    AND dependencies.audience_ok
    AND dependencies.recent_events_ok
    AND dependencies.uuid_ok
    AND dependencies.normalize_email_ok
    AND target_contract.target_slots_clear
    AND feature_contract.feature_constraint_ok
    AND column_contract.baseline_schema_ok
    AND baseline_relation_contract.baseline_private_tables_ok
    AND member_key_contract.member_composite_key_ok
    AND function_contract.baseline_function_acl_owner_ok
    AND account_deletion_contract.account_deletion_body_ok
  ) AS prerequisites_ok
FROM role_contract
CROSS JOIN dependencies
CROSS JOIN target_contract
CROSS JOIN feature_contract
CROSS JOIN column_contract
CROSS JOIN baseline_relation_contract
CROSS JOIN member_key_contract
CROSS JOIN function_contract
CROSS JOIN account_deletion_contract
CROSS JOIN counts;

ROLLBACK;
