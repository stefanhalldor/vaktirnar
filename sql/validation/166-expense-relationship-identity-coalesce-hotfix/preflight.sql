BEGIN TRANSACTION READ ONLY;

WITH
constants AS MATERIALIZED (
  SELECT
    '3ac32ce091028d0c73476c88c7fa208f'::text AS predecessor_hash,
    'd97158cb09a138b962382747c6badbca'::text AS target_hash,
    '257e4ad0dc53277b984272baadd8a3bf'::text AS mutation_hash,
    'b25f994a64dde4a3f94ec8bad8535b17'::text AS helper_hash,
    'pg_catalog.coalesce('::text AS invalid_token,
    'COALESCE('::text AS corrected_token
),
discovery AS MATERIALIZED (
  SELECT routine.oid, routine.prosrc,
    routine.prokind = 'f'
      AND routine.pronargs = 2
      AND routine.proargnames = ARRAY['p_actor_id','p_expense_id']::text[]
      AND routine.prorettype = 'jsonb'::pg_catalog.regtype
      AND NOT routine.proretset
      AND routine.provolatile = 's'
      AND routine.prosecdef
      AND NOT routine.proisstrict
      AND NOT routine.proleakproof
      AND routine.proparallel = 'u'
      AND routine.pronargdefaults = 0
      AND routine.proargdefaults IS NULL
      AND routine.proallargtypes IS NULL
      AND routine.proargmodes IS NULL
      AND routine.proconfig = ARRAY['search_path=""']::text[]
      AND language_row.lanname = 'plpgsql'
      AND routine.proowner = pg_catalog.to_regrole('postgres')::oid
      AND pg_catalog.pg_get_userbyid(routine.proowner) = 'postgres'
      AND pg_catalog.pg_get_function_arguments(routine.oid) =
        'p_actor_id uuid, p_expense_id uuid' AS contract_exact,
    pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n')) AS source_hash
  FROM pg_catalog.pg_proc AS routine
  JOIN pg_catalog.pg_language AS language_row ON language_row.oid = routine.prolang
  WHERE routine.oid = pg_catalog.to_regprocedure(
    'public.expense_get_relationship_identity_management_v1(uuid,uuid)'
  )
),
mutation AS MATERIALIZED (
  SELECT routine.oid, routine.prosrc,
    routine.prokind = 'f'
      AND routine.pronargs = 6
      AND routine.proargnames = ARRAY[
        'p_actor_id','p_request_id','p_expense_id','p_member_id',
        'p_relationship_id','p_expected_financial_version'
      ]::text[]
      AND routine.prorettype = 'jsonb'::pg_catalog.regtype
      AND NOT routine.proretset
      AND routine.provolatile = 'v'
      AND routine.prosecdef
      AND NOT routine.proisstrict
      AND NOT routine.proleakproof
      AND routine.proparallel = 'u'
      AND routine.pronargdefaults = 0
      AND routine.proargdefaults IS NULL
      AND routine.proallargtypes IS NULL
      AND routine.proargmodes IS NULL
      AND routine.proconfig = ARRAY['search_path=""']::text[]
      AND language_row.lanname = 'plpgsql'
      AND routine.proowner = pg_catalog.to_regrole('postgres')::oid
      AND pg_catalog.pg_get_userbyid(routine.proowner) = 'postgres'
      AND pg_catalog.pg_get_function_arguments(routine.oid) =
        'p_actor_id uuid, p_request_id uuid, p_expense_id uuid, p_member_id uuid, p_relationship_id uuid, p_expected_financial_version bigint' AS contract_exact,
    pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n')) AS source_hash
  FROM pg_catalog.pg_proc AS routine
  JOIN pg_catalog.pg_language AS language_row ON language_row.oid = routine.prolang
  WHERE routine.oid = pg_catalog.to_regprocedure(
    'public.expense_bind_member_relationship_identity_v1(uuid,uuid,uuid,uuid,uuid,bigint)'
  )
),
role_oids AS MATERIALIZED (
  SELECT pg_catalog.to_regrole('postgres')::oid AS postgres_oid,
    pg_catalog.to_regrole('service_role')::oid AS service_role_oid,
    pg_catalog.to_regrole('anon')::oid AS anon_oid,
    pg_catalog.to_regrole('authenticated')::oid AS authenticated_oid
),
expected_functions(function_oid) AS MATERIALIZED (
  SELECT oid FROM discovery UNION ALL SELECT oid FROM mutation
),
expected_acl(function_oid, grantee, grantor, privilege_type, is_grantable) AS MATERIALIZED (
  SELECT function_row.function_oid, roles.postgres_oid, roles.postgres_oid,
    'EXECUTE'::text, false
  FROM expected_functions AS function_row CROSS JOIN role_oids AS roles
  UNION ALL
  SELECT function_row.function_oid, roles.service_role_oid, roles.postgres_oid,
    'EXECUTE'::text, false
  FROM expected_functions AS function_row CROSS JOIN role_oids AS roles
),
actual_acl AS MATERIALIZED (
  SELECT routine.oid AS function_oid, privilege_row.grantee,
    privilege_row.grantor, privilege_row.privilege_type,
    privilege_row.is_grantable
  FROM pg_catalog.pg_proc AS routine
  JOIN expected_functions AS expected ON expected.function_oid = routine.oid
  CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
    routine.proacl, pg_catalog.acldefault('f', routine.proowner)
  )) AS privilege_row
),
effective_acl AS MATERIALIZED (
  SELECT expected.function_oid,
    pg_catalog.has_function_privilege(
      roles.service_role_oid, expected.function_oid, 'EXECUTE'
    ) AS service_execute,
    NOT pg_catalog.has_function_privilege(
      roles.anon_oid, expected.function_oid, 'EXECUTE'
    ) AS anon_denied,
    NOT pg_catalog.has_function_privilege(
      roles.authenticated_oid, expected.function_oid, 'EXECUTE'
    ) AS authenticated_denied
  FROM expected_functions AS expected CROSS JOIN role_oids AS roles
),
acl_check AS MATERIALIZED (
  SELECT COALESCE(
    roles.postgres_oid IS NOT NULL
      AND roles.service_role_oid IS NOT NULL
      AND roles.anon_oid IS NOT NULL
      AND roles.authenticated_oid IS NOT NULL
      AND (SELECT pg_catalog.count(*) FROM expected_functions) = 2
      AND (SELECT pg_catalog.count(*) FROM expected_acl) = 4
      AND (SELECT pg_catalog.count(*) FROM actual_acl) = 4
      AND (SELECT pg_catalog.count(*) = 2
        AND pg_catalog.bool_and(
          service_execute AND anon_denied AND authenticated_denied
        ) FROM effective_acl)
      AND NOT EXISTS (SELECT actual.* FROM actual_acl AS actual
        EXCEPT ALL SELECT expected.* FROM expected_acl AS expected)
      AND NOT EXISTS (SELECT expected.* FROM expected_acl AS expected
        EXCEPT ALL SELECT actual.* FROM actual_acl AS actual)
      AND NOT EXISTS (SELECT 1 FROM actual_acl WHERE grantee = 0::oid),
    false
  ) AS exact
  FROM role_oids AS roles
),
expected_relation(signature, require_rls, require_force_rls) AS (
  VALUES
    ('public.expenses', true, false),
    ('public.expense_groups', true, false),
    ('public.expense_group_members', true, false),
    ('public.relationships', true, false),
    ('public.profiles', true, false),
    ('public.teskeid_event_expense_participant_sources', true, true),
    ('auth.users', false, false)
),
relation_check AS MATERIALIZED (
  SELECT expected.*, class_row.oid, class_row.relkind,
    class_row.relrowsecurity, class_row.relforcerowsecurity
  FROM expected_relation AS expected
  LEFT JOIN pg_catalog.pg_class AS class_row
    ON class_row.oid = pg_catalog.to_regclass(expected.signature)
),
helper_check AS MATERIALIZED (
  SELECT routine.oid IS NOT NULL
    AND routine.prokind = 'f'
    AND routine.pronargs = 2
    AND routine.proargnames = ARRAY['p_actor_id','p_group_id']::text[]
    AND routine.prorettype = 'text'::pg_catalog.regtype
    AND NOT routine.proretset
    AND routine.provolatile = 's'
    AND routine.prosecdef
    AND routine.proconfig = ARRAY['search_path=""']::text[]
    AND language_row.lanname = 'sql'
    AND routine.proowner = pg_catalog.to_regrole('postgres')::oid
    AND pg_catalog.pg_get_function_arguments(routine.oid) =
      'p_actor_id uuid, p_group_id uuid'
    AND pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n')) =
      constants.helper_hash AS exact
  FROM constants
  LEFT JOIN pg_catalog.pg_proc AS routine ON routine.oid = pg_catalog.to_regprocedure(
    'public.expense_active_member_role(uuid,uuid)'
  )
  LEFT JOIN pg_catalog.pg_language AS language_row ON language_row.oid = routine.prolang
),
dependency_check AS MATERIALIZED (
  SELECT COALESCE(
    (SELECT pg_catalog.count(oid) = 7
      AND pg_catalog.bool_and(relkind = 'r')
      AND pg_catalog.bool_and(NOT require_rls OR relrowsecurity)
      AND pg_catalog.bool_and(NOT require_force_rls OR relforcerowsecurity)
     FROM relation_check)
    AND COALESCE((SELECT exact FROM helper_check), false),
    false
  ) AS exact
),
token_check AS MATERIALIZED (
  SELECT
    CASE WHEN discovery.prosrc IS NULL THEN 0 ELSE
      (pg_catalog.length(discovery.prosrc)
        - pg_catalog.length(pg_catalog.replace(
          discovery.prosrc, constants.invalid_token, ''
        ))) / pg_catalog.length(constants.invalid_token) END AS invalid_token_count,
    CASE WHEN discovery.prosrc IS NULL THEN 0 ELSE
      (pg_catalog.length(discovery.prosrc)
        - pg_catalog.length(pg_catalog.replace(
          discovery.prosrc, constants.corrected_token, ''
        ))) / pg_catalog.length(constants.corrected_token) END AS corrected_token_count
  FROM constants LEFT JOIN discovery ON true
),
state AS MATERIALIZED (
  SELECT
    current_user = 'postgres' AND session_user = 'postgres' AS executor_ok,
    COALESCE(discovery.contract_exact, false) AS discovery_contract_exact,
    COALESCE(mutation.contract_exact, false)
      AND mutation.source_hash = constants.mutation_hash AS mutation_exact,
    acl_check.exact AS acl_exact,
    dependency_check.exact AS direct_dependencies_exact,
    dependency_check.exact AS security_boundaries_exact,
    discovery.source_hash = constants.predecessor_hash
      AND token_check.invalid_token_count = 1
      AND token_check.corrected_token_count = 0 AS predecessor_source_exact,
    discovery.source_hash = constants.target_hash
      AND token_check.invalid_token_count = 0
      AND token_check.corrected_token_count = 1 AS target_source_exact,
    token_check.invalid_token_count,
    token_check.corrected_token_count
  FROM constants
  LEFT JOIN discovery ON true
  LEFT JOIN mutation ON true
  CROSS JOIN acl_check
  CROSS JOIN dependency_check
  CROSS JOIN token_check
)
SELECT state.*,
  CASE
    WHEN executor_ok AND discovery_contract_exact AND mutation_exact
      AND acl_exact AND direct_dependencies_exact AND security_boundaries_exact
      AND predecessor_source_exact
      THEN 'PREDECESSOR_READY'
    WHEN executor_ok AND discovery_contract_exact AND mutation_exact
      AND acl_exact AND direct_dependencies_exact AND security_boundaries_exact
      AND target_source_exact
      THEN 'EXACT_INSTALLED'
    ELSE 'STOP_PARTIAL_OR_PREDECESSOR_DRIFT'
  END AS installation_state
FROM state;

ROLLBACK;
