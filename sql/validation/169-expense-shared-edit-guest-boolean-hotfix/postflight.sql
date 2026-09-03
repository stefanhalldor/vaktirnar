-- SQL169 POSTFLIGHT: read-only exact target, null-safety, ACL and dependency verification.

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = '';

WITH
roles AS MATERIALIZED (
  SELECT pg_catalog.to_regrole('postgres')::oid AS postgres_oid,
    pg_catalog.to_regrole('service_role')::oid AS service_role_oid,
    pg_catalog.to_regrole('anon')::oid AS anon_oid,
    pg_catalog.to_regrole('authenticated')::oid AS authenticated_oid
), function_state AS MATERIALIZED (
  SELECT routine.oid, routine.prosrc,
    pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n')) =
      '23ffdadcbb51a19fa1e2432e0ee4b402' AS source_hash_exact,
    routine.prokind = 'f' AND routine.pronargs = 5
      AND routine.proargnames = ARRAY[
        'p_actor_id','p_request_id','p_draft_id',
        'p_expected_draft_version','p_expected_publication_version'
      ]::text[]
      AND pg_catalog.pg_get_function_arguments(routine.oid) =
        'p_actor_id uuid, p_request_id uuid, p_draft_id uuid, p_expected_draft_version bigint, p_expected_publication_version bigint'
      AND pg_catalog.pg_get_function_result(routine.oid) = 'jsonb'
      AND routine.provolatile = 'v'::"char"
      AND routine.prosecdef AND NOT routine.proisstrict
      AND NOT routine.proleakproof AND routine.proparallel = 'u'::"char"
      AND routine.pronargdefaults = 0 AND routine.proargdefaults IS NULL
      AND routine.proallargtypes IS NULL AND routine.proargmodes IS NULL
      AND routine.proconfig = ARRAY['search_path=""']::text[]
      AND language_row.lanname = 'plpgsql'
      AND routine.proowner = roles.postgres_oid AS metadata_exact,
    (pg_catalog.length(routine.prosrc) - pg_catalog.length(pg_catalog.replace(
      routine.prosrc, 'COALESCE(member.user_id = p_actor_id, false)', ''
    ))) / pg_catalog.length('COALESCE(member.user_id = p_actor_id, false)') = 2
      AS null_safe_boolean_count_exact
  FROM roles
  LEFT JOIN pg_catalog.pg_proc AS routine ON routine.oid = pg_catalog.to_regprocedure(
    'public.expense_share_edit_revision_v1(uuid,uuid,uuid,bigint,bigint)'
  )
  LEFT JOIN pg_catalog.pg_language AS language_row ON language_row.oid = routine.prolang
), expected_acl(grantee, grantor, privilege_type, is_grantable) AS MATERIALIZED (
  SELECT postgres_oid, postgres_oid, 'EXECUTE'::text, false FROM roles
  UNION ALL SELECT service_role_oid, postgres_oid, 'EXECUTE'::text, false FROM roles
), actual_acl AS MATERIALIZED (
  SELECT acl.grantee, acl.grantor, acl.privilege_type, acl.is_grantable
  FROM function_state
  JOIN pg_catalog.pg_proc AS routine ON routine.oid = function_state.oid
  CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
    routine.proacl, pg_catalog.acldefault('f', routine.proowner)
  )) AS acl
), acl_state AS MATERIALIZED (
  SELECT COALESCE(
    (SELECT pg_catalog.count(*) FROM expected_acl) = 2
      AND (SELECT pg_catalog.count(*) FROM actual_acl) = 2
      AND NOT EXISTS (SELECT actual.* FROM actual_acl AS actual
        EXCEPT ALL SELECT expected.* FROM expected_acl AS expected)
      AND NOT EXISTS (SELECT expected.* FROM expected_acl AS expected
        EXCEPT ALL SELECT actual.* FROM actual_acl AS actual)
      AND pg_catalog.has_function_privilege(service_role_oid, function_state.oid, 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege(anon_oid, function_state.oid, 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege(
        authenticated_oid, function_state.oid, 'EXECUTE'
      ), false
  ) AS exact FROM roles CROSS JOIN function_state
), dependency_state AS MATERIALIZED (
  SELECT COALESCE(
    EXISTS (SELECT 1 FROM pg_catalog.pg_depend AS dependency
      WHERE dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
        AND dependency.objid = function_state.oid
        AND dependency.refclassid = 'pg_catalog.pg_namespace'::pg_catalog.regclass
        AND dependency.refobjid = pg_catalog.to_regnamespace('public'))
    AND EXISTS (SELECT 1 FROM pg_catalog.pg_depend AS dependency
      JOIN pg_catalog.pg_language AS language_row ON language_row.oid = dependency.refobjid
      WHERE dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
        AND dependency.objid = function_state.oid
        AND dependency.refclassid = 'pg_catalog.pg_language'::pg_catalog.regclass
        AND language_row.lanname = 'plpgsql')
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_depend AS dependency
      WHERE dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
        AND dependency.objid = function_state.oid AND dependency.deptype = 'e'), false
  ) AS exact FROM function_state
)
SELECT COALESCE(function_state.metadata_exact, false) AS function_contract_exact,
  COALESCE(function_state.source_hash_exact, false) AS source_hash_exact,
  COALESCE(function_state.null_safe_boolean_count_exact, false)
    AS null_safe_boolean_count_exact,
  acl_state.exact AS acl_exact,
  dependency_state.exact AS direct_dependencies_exact,
  current_user = 'postgres' AND session_user = 'postgres'
    AND COALESCE(function_state.metadata_exact, false)
    AND COALESCE(function_state.source_hash_exact, false)
    AND COALESCE(function_state.null_safe_boolean_count_exact, false)
    AND acl_state.exact AND dependency_state.exact AS postconditions_ok
FROM function_state CROSS JOIN acl_state CROSS JOIN dependency_state;

ROLLBACK;
