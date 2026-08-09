-- SQL115 Kviss authoring postflight — READ ONLY.
-- Run only after a separately approved SQL115 apply and share the complete
-- single result row with Codex. Every *_ok value must be true.

BEGIN;
SET TRANSACTION READ ONLY;

WITH expected_tables(table_name) AS (
  VALUES ('kviss_questions'), ('kviss_templates'), ('kviss_template_questions')
), table_state AS (
  SELECT relation.oid, relation.relname AS table_name,
    relation.relrowsecurity, relation.relforcerowsecurity, relation.relowner
  FROM pg_catalog.pg_class AS relation
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relkind = 'r'
    AND relation.relname IN (SELECT expected.table_name FROM expected_tables AS expected)
), expected_indexes(index_name) AS (
  VALUES
    ('kviss_questions_space_active_idx'),
    ('kviss_templates_space_active_idx'),
    ('kviss_template_questions_template_idx')
), present_indexes AS (
  SELECT index_row.indexname AS index_name
  FROM pg_catalog.pg_indexes AS index_row
  WHERE index_row.schemaname = 'public'
    AND index_row.indexname IN (SELECT expected.index_name FROM expected_indexes AS expected)
), expected_cascade_fks(table_name, constraint_name) AS (
  VALUES
    ('kviss_questions', 'kviss_questions_space_fk'),
    ('kviss_questions', 'kviss_questions_created_by_fk'),
    ('kviss_templates', 'kviss_templates_space_fk'),
    ('kviss_templates', 'kviss_templates_created_by_fk'),
    ('kviss_template_questions', 'kviss_template_questions_template_fk')
), present_cascade_fks AS (
  SELECT relation.relname AS table_name, constraint_row.conname AS constraint_name,
    constraint_row.confdeltype, constraint_row.convalidated
  FROM pg_catalog.pg_constraint AS constraint_row
  JOIN pg_catalog.pg_class AS relation ON relation.oid = constraint_row.conrelid
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND constraint_row.contype = 'f'
    AND (relation.relname, constraint_row.conname) IN (
      SELECT expected.table_name, expected.constraint_name
      FROM expected_cascade_fks AS expected
    )
), expected_functions(signature, service_role_execute) AS (
  VALUES
    ('public.kviss_assert_author(uuid,uuid)', false),
    ('public.kviss_upsert_question(uuid,uuid,uuid,integer,text,jsonb,integer[],integer,integer,boolean,text[],integer)', true),
    ('public.kviss_save_template(uuid,uuid,uuid,integer,text,text[],jsonb)', true),
    ('public.kviss_archive_question(uuid,uuid,uuid,integer)', true)
), function_state AS (
  SELECT expected.signature, expected.service_role_execute,
    procedure.oid, procedure.proowner, procedure.prosecdef, procedure.prosrc,
    EXISTS (
      SELECT 1
      FROM pg_catalog.unnest(COALESCE(procedure.proconfig, ARRAY[]::text[])) AS setting
      WHERE setting IN ('search_path=', 'search_path=""')
    ) AS fixed_empty_search_path
  FROM expected_functions AS expected
  LEFT JOIN pg_catalog.pg_proc AS procedure
    ON procedure.oid = pg_catalog.to_regprocedure(expected.signature)
), function_acl AS (
  SELECT procedure.proname,
    COALESCE(role.rolname, 'PUBLIC') AS grantee,
    privilege.privilege_type
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))
  ) AS privilege
  LEFT JOIN pg_catalog.pg_roles AS role ON role.oid = privilege.grantee
  WHERE namespace.nspname = 'public'
    AND procedure.proname IN (
      'kviss_assert_author',
      'kviss_upsert_question',
      'kviss_save_template',
      'kviss_archive_question'
    )
), feature_constraint AS (
  SELECT pg_catalog.pg_get_constraintdef(constraint_row.oid) AS definition
  FROM pg_catalog.pg_constraint AS constraint_row
  WHERE constraint_row.conrelid = pg_catalog.to_regclass('public.feature_access')
    AND constraint_row.conname = 'feature_access_feature_key_check'
    AND constraint_row.contype = 'c'
)
SELECT
  pg_catalog.current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.now() AS checked_at,
  (SELECT pg_catalog.count(*) = 3 FROM table_state) AS tables_ok,
  (SELECT pg_catalog.count(*) = 15 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'kviss_questions')
    AND (SELECT pg_catalog.count(*) = 9 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'kviss_templates')
    AND (SELECT pg_catalog.count(*) = 13 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'kviss_template_questions')
    AS exact_column_counts_ok,
  NOT EXISTS (
    SELECT expected.table_name FROM expected_tables AS expected
    EXCEPT SELECT present.table_name FROM table_state AS present
  )
    AND NOT EXISTS (
      SELECT present.table_name FROM table_state AS present
      EXCEPT SELECT expected.table_name FROM expected_tables AS expected
    ) AS exact_table_set_ok,
  NOT EXISTS (
    SELECT expected.index_name FROM expected_indexes AS expected
    EXCEPT SELECT present.index_name FROM present_indexes AS present
  ) AS required_indexes_ok,
  NOT EXISTS (
    SELECT expected.table_name, expected.constraint_name
    FROM expected_cascade_fks AS expected
    EXCEPT
    SELECT present.table_name, present.constraint_name
    FROM present_cascade_fks AS present
    WHERE present.confdeltype = 'c' AND present.convalidated
  )
    AND (SELECT pg_catalog.count(*) FROM present_cascade_fks) = 5
    AS account_deletion_cascade_fks_ok,
  NOT EXISTS (
    SELECT 1 FROM table_state
    WHERE NOT relrowsecurity OR NOT relforcerowsecurity
  ) AS force_rls_ok,
  NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policy AS policy
    WHERE policy.polrelid IN (SELECT present.oid FROM table_state AS present)
  ) AS default_deny_no_policies_ok,
  NOT EXISTS (
    SELECT 1
    FROM information_schema.role_table_grants AS privilege
    WHERE privilege.table_schema = 'public'
      AND privilege.table_name IN (SELECT expected.table_name FROM expected_tables AS expected)
      AND privilege.grantee IN ('PUBLIC', 'anon', 'authenticated')
  ) AS no_browser_table_grants_ok,
  (SELECT pg_catalog.count(*) = 3
      AND pg_catalog.count(*) FILTER (WHERE privilege_type = 'SELECT') = 3
      AND pg_catalog.count(*) FILTER (WHERE privilege_type <> 'SELECT') = 0
    FROM information_schema.role_table_grants AS privilege
    WHERE privilege.table_schema = 'public'
      AND privilege.table_name IN (SELECT expected.table_name FROM expected_tables AS expected)
      AND privilege.grantee = 'service_role') AS service_role_select_only_ok,
  (SELECT pg_catalog.count(*) = 4
      AND pg_catalog.count(*) FILTER (WHERE oid IS NOT NULL) = 4
      AND pg_catalog.bool_and(prosecdef)
      AND pg_catalog.bool_and(fixed_empty_search_path)
    FROM function_state) AS function_security_ok,
  (SELECT pg_catalog.count(*) = 4
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname IN (
        'kviss_assert_author',
        'kviss_upsert_question',
        'kviss_save_template',
        'kviss_archive_question'
      )) AS exact_function_overloads_ok,
  NOT EXISTS (
    SELECT 1
    FROM function_acl
    WHERE grantee IN ('PUBLIC', 'anon', 'authenticated')
      AND privilege_type = 'EXECUTE'
  ) AS no_browser_function_execute_ok,
  NOT EXISTS (
    SELECT 1
    FROM function_state AS state
    WHERE state.oid IS NULL
       OR state.service_role_execute IS DISTINCT FROM
          pg_catalog.has_function_privilege('service_role', state.oid, 'EXECUTE')
  ) AS service_role_function_scope_ok,
  (SELECT pg_catalog.count(*) = 3
    FROM function_acl
    WHERE grantee = 'service_role' AND privilege_type = 'EXECUTE')
    AS exact_service_role_function_grants_ok,
  (SELECT pg_catalog.count(*) = 3
      AND pg_catalog.count(DISTINCT table_state.relowner) = 1
      AND pg_catalog.bool_and(role.rolsuper OR role.rolbypassrls)
    FROM table_state
    JOIN pg_catalog.pg_roles AS role ON role.oid = table_state.relowner)
    AND (SELECT pg_catalog.count(*) = 4
        AND pg_catalog.count(DISTINCT function_state.proowner) = 1
        AND pg_catalog.bool_and(role.rolsuper OR role.rolbypassrls)
      FROM function_state
      JOIN pg_catalog.pg_roles AS role ON role.oid = function_state.proowner
      WHERE function_state.oid IS NOT NULL)
    AND NOT EXISTS (
      SELECT 1
      FROM table_state
      CROSS JOIN function_state
      WHERE function_state.oid IS NOT NULL
        AND function_state.proowner <> table_state.relowner
    ) AS object_owner_bypasses_rls_ok,
  EXISTS (
    SELECT 1 FROM feature_constraint
    WHERE pg_catalog.strpos(definition, pg_catalog.quote_literal('kviss')) > 0
  ) AS exact_kviss_feature_constraint_ok,
  EXISTS (
    SELECT 1 FROM function_state
    WHERE signature LIKE 'public.kviss_upsert_question(%'
      AND prosrc LIKE '%jsonb_typeof(option_row.value) <> ''string''%'
      AND prosrc LIKE '%char_length(label_row.value) NOT BETWEEN 1 AND 40%'
  )
    AND EXISTS (
      SELECT 1 FROM function_state
      WHERE signature LIKE 'public.kviss_save_template(%'
        AND prosrc LIKE '%char_length(team_row.value) NOT BETWEEN 1 AND 60%'
    ) AS rpc_payload_guards_ok,
  (SELECT pg_catalog.count(*) FROM public.kviss_questions) AS question_rows,
  (SELECT pg_catalog.count(*) FROM public.kviss_templates) AS template_rows,
  (SELECT pg_catalog.count(*) FROM public.kviss_template_questions) AS template_question_rows,
  (SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_stat_activity AS activity
    WHERE activity.datname = pg_catalog.current_database()
      AND activity.pid <> pg_catalog.pg_backend_pid()
      AND activity.xact_start IS NOT NULL
      AND activity.xact_start < pg_catalog.now() - interval '5 minutes')
    AS transactions_older_than_five_minutes;

ROLLBACK;
