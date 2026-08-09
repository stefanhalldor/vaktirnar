-- SQL29 personal-space foundation catch-up postflight — READ ONLY.
-- Run only after SQL29 reports success and share the single result row with
-- Codex. Every *_ok value must be true and every *_violations value must be 0.

BEGIN;
SET TRANSACTION READ ONLY;

WITH target_tables(table_name) AS (
  VALUES ('spaces'), ('space_members')
), table_state AS (
  SELECT relation.relname AS table_name,
    relation.relrowsecurity,
    relation.relforcerowsecurity,
    relation.relowner
  FROM pg_catalog.pg_class AS relation
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relkind = 'r'
    AND relation.relname IN (SELECT target.table_name FROM target_tables AS target)
), expected_constraints(table_name, constraint_name) AS (
  VALUES
    ('spaces', 'spaces_pkey'),
    ('spaces', 'spaces_type_check'),
    ('spaces', 'spaces_name_check'),
    ('spaces', 'spaces_created_by_fkey'),
    ('space_members', 'space_members_pkey'),
    ('space_members', 'space_members_space_id_fkey'),
    ('space_members', 'space_members_user_id_fkey'),
    ('space_members', 'space_members_role_check')
), present_constraints AS (
  SELECT relation.relname AS table_name, constraint_row.conname AS constraint_name,
    constraint_row.convalidated
  FROM pg_catalog.pg_constraint AS constraint_row
  JOIN pg_catalog.pg_class AS relation ON relation.oid = constraint_row.conrelid
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname IN (SELECT target.table_name FROM target_tables AS target)
), target_functions(signature, expected_result, expected_volatility) AS (
  VALUES
    ('public.is_space_member(uuid)', 'boolean', 's'::char),
    ('public.ensure_personal_space()', 'uuid', 'v'::char)
), function_state AS (
  SELECT target.signature, target.expected_result, target.expected_volatility,
    procedure.oid, pg_catalog.pg_get_function_result(procedure.oid) AS actual_result,
    procedure.prosecdef, procedure.provolatile, procedure.proowner,
    EXISTS (
      SELECT 1
      FROM pg_catalog.unnest(COALESCE(procedure.proconfig, ARRAY[]::text[])) AS setting
      WHERE setting IN ('search_path=', 'search_path=""')
    ) AS fixed_empty_search_path
  FROM target_functions AS target
  LEFT JOIN pg_catalog.pg_proc AS procedure
    ON procedure.oid = pg_catalog.to_regprocedure(target.signature)
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
    AND procedure.proname IN ('is_space_member', 'ensure_personal_space')
), personal_index AS (
  SELECT index_row.indisunique,
    pg_catalog.pg_get_expr(index_row.indpred, index_row.indrelid) AS predicate,
    pg_catalog.pg_get_indexdef(index_row.indexrelid) AS definition
  FROM pg_catalog.pg_index AS index_row
  WHERE index_row.indexrelid = pg_catalog.to_regclass('public.spaces_one_personal_per_user')
), member_index AS (
  SELECT pg_catalog.pg_get_indexdef(index_row.indexrelid) AS definition
  FROM pg_catalog.pg_index AS index_row
  WHERE index_row.indexrelid = pg_catalog.to_regclass('public.space_members_user_id_idx')
), update_trigger AS (
  SELECT trigger_row.tgenabled, trigger_row.tgtype::integer AS trigger_type,
    procedure.proname AS function_name,
    procedure_namespace.nspname AS function_schema
  FROM pg_catalog.pg_trigger AS trigger_row
  JOIN pg_catalog.pg_class AS relation ON relation.oid = trigger_row.tgrelid
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  JOIN pg_catalog.pg_proc AS procedure ON procedure.oid = trigger_row.tgfoid
  JOIN pg_catalog.pg_namespace AS procedure_namespace
    ON procedure_namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname = 'spaces'
    AND trigger_row.tgname = 'spaces_updated_at'
    AND NOT trigger_row.tgisinternal
)
SELECT
  pg_catalog.current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.now() AS checked_at,
  (SELECT pg_catalog.count(*) = 2 FROM table_state) AS tables_ok,
  (SELECT pg_catalog.count(*) = 6 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'spaces')
    AND (SELECT pg_catalog.count(*) = 4 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'space_members')
    AS exact_column_counts_ok,
  NOT EXISTS (
    SELECT expected.table_name, expected.constraint_name
    FROM expected_constraints AS expected
    EXCEPT
    SELECT present.table_name, present.constraint_name
    FROM present_constraints AS present
    WHERE present.convalidated
  )
    AND (SELECT pg_catalog.count(*) FROM present_constraints) = 8
    AS exact_validated_constraints_ok,
  (SELECT pg_catalog.count(*) = 1
      AND pg_catalog.bool_and(indisunique)
      AND pg_catalog.bool_and(predicate LIKE '%type = ''personal''%')
      AND pg_catalog.bool_and(definition LIKE '%(created_by)%')
    FROM personal_index) AS one_personal_index_ok,
  (SELECT pg_catalog.count(*) = 1
      AND pg_catalog.bool_and(definition LIKE '%(user_id)%')
    FROM member_index) AS member_lookup_index_ok,
  NOT EXISTS (
    SELECT 1 FROM table_state
    WHERE NOT relrowsecurity OR NOT relforcerowsecurity
  ) AS force_rls_ok,
  NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policy AS policy
    WHERE policy.polrelid IN (
      pg_catalog.to_regclass('public.spaces'),
      pg_catalog.to_regclass('public.space_members')
    )
  ) AS default_deny_no_policies_ok,
  NOT EXISTS (
    SELECT 1
    FROM information_schema.role_table_grants AS privilege
    WHERE privilege.table_schema = 'public'
      AND privilege.table_name IN ('spaces', 'space_members')
      AND privilege.grantee IN ('PUBLIC', 'anon', 'authenticated', 'service_role')
  ) AS no_direct_table_grants_ok,
  COALESCE((
    SELECT pg_catalog.has_schema_privilege(role.oid, 'public', 'USAGE')
    FROM pg_catalog.pg_roles AS role
    WHERE role.rolname = 'authenticated'
  ), false) AS authenticated_public_schema_usage_ok,
  (SELECT pg_catalog.count(*) = 1
      AND pg_catalog.bool_and(tgenabled IN ('O', 'A'))
      AND pg_catalog.bool_and(trigger_type = 19)
      AND pg_catalog.bool_and(function_schema = 'public')
      AND pg_catalog.bool_and(function_name = 'teskeid_set_updated_at')
    FROM update_trigger) AS updated_at_trigger_ok,
  (SELECT pg_catalog.count(*) = 2
      AND pg_catalog.count(*) FILTER (WHERE oid IS NOT NULL) = 2
      AND pg_catalog.bool_and(actual_result = expected_result)
      AND pg_catalog.bool_and(prosecdef)
      AND pg_catalog.bool_and(provolatile = expected_volatility)
      AND pg_catalog.bool_and(fixed_empty_search_path)
    FROM function_state) AS function_security_ok,
  (SELECT pg_catalog.count(*) = 2
      AND pg_catalog.count(DISTINCT table_state.relowner) = 1
      AND pg_catalog.bool_and(role.rolsuper OR role.rolbypassrls)
    FROM table_state
    JOIN pg_catalog.pg_roles AS role ON role.oid = table_state.relowner)
    AND (SELECT pg_catalog.count(*) = 2
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
  (SELECT pg_catalog.count(*) = 2
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname IN ('is_space_member', 'ensure_personal_space'))
    AS exact_function_overloads_ok,
  (SELECT pg_catalog.count(*) = 2
    FROM function_acl
    WHERE grantee = 'authenticated' AND privilege_type = 'EXECUTE')
    AND NOT EXISTS (
      SELECT 1 FROM function_acl
      WHERE grantee IN ('PUBLIC', 'anon', 'service_role')
        AND privilege_type = 'EXECUTE'
    ) AS function_execute_scope_ok,
  NOT EXISTS (
    SELECT 1
    FROM public.spaces AS space
    LEFT JOIN public.space_members AS membership
      ON membership.space_id = space.id
     AND membership.user_id = space.created_by
     AND membership.role = 'owner'
    WHERE space.type <> 'personal' OR membership.user_id IS NULL
  ) AS personal_owner_invariant_ok,
  (SELECT pg_catalog.count(*) FROM public.spaces) AS space_rows,
  (SELECT pg_catalog.count(*) FROM public.space_members) AS membership_rows,
  (SELECT pg_catalog.count(*)
    FROM public.spaces AS space
    LEFT JOIN public.space_members AS membership
      ON membership.space_id = space.id
     AND membership.user_id = space.created_by
     AND membership.role = 'owner'
    WHERE space.type <> 'personal' OR membership.user_id IS NULL)
    AS personal_owner_violations;

ROLLBACK;
