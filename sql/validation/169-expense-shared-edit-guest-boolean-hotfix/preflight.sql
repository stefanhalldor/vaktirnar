-- SQL169 PREFLIGHT: read-only exact predecessor/target, ACL and dependency classification.

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = '';

WITH
constants AS MATERIALIZED (
  SELECT
    'public.expense_share_edit_revision_v1(uuid,uuid,uuid,bigint,bigint)'::text AS signature,
    '3314017996b86c4cda29ef1c3b36a1f2'::text AS predecessor_hash,
    '23ffdadcbb51a19fa1e2432e0ee4b402'::text AS target_hash
), roles AS MATERIALIZED (
  SELECT pg_catalog.to_regrole('postgres')::oid AS postgres_oid,
    pg_catalog.to_regrole('service_role')::oid AS service_role_oid,
    pg_catalog.to_regrole('anon')::oid AS anon_oid,
    pg_catalog.to_regrole('authenticated')::oid AS authenticated_oid
), function_state AS MATERIALIZED (
  SELECT routine.oid, routine.prosrc,
    pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n')) AS source_hash,
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
      AND routine.proowner = roles.postgres_oid AS metadata_exact
  FROM constants CROSS JOIN roles
  LEFT JOIN pg_catalog.pg_proc AS routine
    ON routine.oid = pg_catalog.to_regprocedure(constants.signature)
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
  ) AS exact
  FROM roles CROSS JOIN function_state
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
  ) AS exact
  FROM function_state
), state AS MATERIALIZED (
  SELECT current_user = 'postgres' AND session_user = 'postgres' AS executor_ok,
    COALESCE(function_state.metadata_exact, false) AS function_contract_exact,
    acl_state.exact AS acl_exact,
    dependency_state.exact AS direct_dependencies_exact,
    COALESCE(function_state.source_hash = constants.predecessor_hash, false)
      AS predecessor_source_exact,
    COALESCE(function_state.source_hash = constants.target_hash, false)
      AS target_source_exact,
    COALESCE((pg_catalog.length(function_state.prosrc)
      - pg_catalog.length(pg_catalog.replace(
        function_state.prosrc, 'COALESCE(member.user_id = p_actor_id, false)', ''
      ))) / pg_catalog.length('COALESCE(member.user_id = p_actor_id, false)'), 0)
      AS null_safe_boolean_count
  FROM constants CROSS JOIN function_state CROSS JOIN acl_state CROSS JOIN dependency_state
)
SELECT executor_ok, function_contract_exact, acl_exact, direct_dependencies_exact,
  predecessor_source_exact, target_source_exact, null_safe_boolean_count,
  CASE
    WHEN executor_ok AND function_contract_exact AND acl_exact AND direct_dependencies_exact
      AND predecessor_source_exact AND NOT target_source_exact
      AND null_safe_boolean_count = 0
      THEN 'PREDECESSOR_READY'
    WHEN executor_ok AND function_contract_exact AND acl_exact AND direct_dependencies_exact
      AND target_source_exact AND NOT predecessor_source_exact
      AND null_safe_boolean_count = 2
      THEN 'EXACT_INSTALLED'
    ELSE 'STOP_PARTIAL_OR_PREDECESSOR_DRIFT'
  END AS installation_state
FROM state;

ROLLBACK;
