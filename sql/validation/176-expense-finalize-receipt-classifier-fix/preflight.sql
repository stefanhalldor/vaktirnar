-- SQL176 preflight: catalog-only state and lineage check.
WITH target AS MATERIALIZED (
  SELECT routine.*,
    pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n')) AS source_hash,
    language_row.lanname,
    owner_role.rolname AS owner_name
  FROM pg_catalog.pg_proc AS routine
  JOIN pg_catalog.pg_language AS language_row ON language_row.oid = routine.prolang
  JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = routine.proowner
  WHERE routine.oid = pg_catalog.to_regprocedure(
    'public.expense_hard_delete_receipt_shape_known(text,jsonb)')
), target_state AS MATERIALIZED (
  SELECT pg_catalog.count(*) = 1
      AND COALESCE(pg_catalog.bool_and(
        prokind = 'f' AND pronargs = 2
        AND proargnames = ARRAY['p_operation','p_result']::text[]
        AND proargmodes IS NULL
        AND pg_catalog.pg_get_function_arguments(oid) = 'p_operation text, p_result jsonb'
        AND pg_catalog.pg_get_function_result(oid) = 'boolean'
        AND prorettype = 'boolean'::pg_catalog.regtype
        AND NOT proretset AND provolatile = 'i'::"char"
        AND prosecdef AND NOT proisstrict AND NOT proleakproof
        AND proparallel = 'u'::"char" AND pronargdefaults = 0
        AND proargdefaults IS NULL AND proallargtypes IS NULL
        AND provariadic = 0::oid AND procost = 100 AND prorows = 0
        AND prosupport = 0::oid AND protrftypes IS NULL
        AND probin IS NULL AND prosqlbody IS NULL
        AND proconfig = ARRAY['search_path=""']::text[]
        AND lanname = 'sql' AND owner_name = 'postgres'
      ), false) AS contract_exact,
    COALESCE(pg_catalog.bool_or(source_hash IN (
      'edb8a21d01ffdbbb8e9aa2b94c7c2594',
      '9399515ec95dac55b2388a2a77be08e7')), false) AS source_recognized,
    COALESCE(pg_catalog.bool_or(
      source_hash = 'edb8a21d01ffdbbb8e9aa2b94c7c2594'), false)
      AS predecessor_source_exact,
    COALESCE(pg_catalog.bool_or(
      source_hash = '9399515ec95dac55b2388a2a77be08e7'), false)
      AS installed_source_exact
  FROM target
), acl_state AS MATERIALIZED (
  SELECT COALESCE((
    SELECT pg_catalog.count(*) = 1
      AND COALESCE(pg_catalog.bool_and(
        acl.grantee = pg_catalog.to_regrole('postgres')::oid
        AND acl.grantor = pg_catalog.to_regrole('postgres')::oid
        AND acl.privilege_type = 'EXECUTE' AND NOT acl.is_grantable), false)
      AND NOT pg_catalog.has_function_privilege(
        pg_catalog.to_regrole('anon')::oid, target.oid, 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege(
        pg_catalog.to_regrole('authenticated')::oid, target.oid, 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege(
        pg_catalog.to_regrole('service_role')::oid, target.oid, 'EXECUTE')
    FROM target
    CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
      target.proacl, pg_catalog.acldefault('f', target.proowner))) AS acl
    GROUP BY target.oid
  ), false) AS acl_exact
), dependency_state AS MATERIALIZED (
  SELECT COALESCE((
    SELECT pg_catalog.count(*) = 1
      AND pg_catalog.count(*) FILTER (
        WHERE dependency.refclassid = 'pg_catalog.pg_namespace'::pg_catalog.regclass
          AND dependency.refobjid = pg_catalog.to_regnamespace('public')) = 1
      AND COALESCE(pg_catalog.bool_and(
        dependency.objsubid = 0 AND dependency.refobjsubid = 0
        AND dependency.deptype = 'n'::"char"), false)
    FROM target
    JOIN pg_catalog.pg_depend AS dependency
      ON dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
     AND dependency.objid = target.oid
  ), false) AS dependencies_exact
), preserved AS MATERIALIZED (
  SELECT pg_catalog.count(routine.oid) = 11
      AND COALESCE(pg_catalog.bool_and(
        pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
          = expected.source_hash), false) AS preserved_sources_exact
  FROM (VALUES
    ('public.expense_finalize_private_draft(uuid,uuid,uuid,bigint,bigint,boolean)', '14ac1abc9046fea4812ac652a9b96088'),
    ('public.expense_hard_delete_receipts_classified(uuid,uuid,boolean,uuid[])', '9def695d70fc38b63011cb2bd12e2e67'),
    ('public.expense_get_own_delete_capability(uuid,uuid)', 'ffbd530e2f759d85809a34045ac15a1e'),
    ('public.expense_delete_own_unsettled_expense(uuid,uuid,bigint,uuid)', '41bc44fc718a17fc4fc8c0777e0a0a67'),
    ('public.expense_sql175_private_group_summary(uuid,uuid,uuid)', '0f6cac7b817e25d7f61ebf8a923e69d2'),
    ('public.expense_sql175_begin_event_delete_request(uuid,uuid,text)', 'ea3732c799f6737cb9dbbe7aebc02a36'),
    ('public.expense_list_group_creation_drafts_v1(uuid,uuid)', '578aecf4b838c85b9d70ad4748ea4f6e'),
    ('public.teskeid_event_get_expense_pre_active_v2(uuid,uuid)', '65270072a4d257dcdb650cf1715b324f'),
    ('public.expense_get_shared_draft_management_target_v1(uuid,uuid)', '6c5bc595cf9610550dfdd6b1741870c2'),
    ('public.expense_get_own_creation_draft_delete_capability_v1(uuid,uuid)', '26b15255fc401c05eb7808917698fe30'),
    ('public.expense_delete_own_creation_draft_v1(uuid,uuid,uuid,bigint,bigint)', '4ba7b3a6be41204ec3807c63e37bdeb4')
  ) AS expected(signature, source_hash)
  LEFT JOIN pg_catalog.pg_proc AS routine
    ON routine.oid = pg_catalog.to_regprocedure(expected.signature)
), overload_state AS MATERIALIZED (
  SELECT pg_catalog.count(*) = 1 AS overload_exact
  FROM pg_catalog.pg_proc AS routine
  WHERE routine.pronamespace = pg_catalog.to_regnamespace('public')
    AND routine.proname = 'expense_hard_delete_receipt_shape_known'
), combined AS MATERIALIZED (
  SELECT target_state.*, acl_state.acl_exact,
    dependency_state.dependencies_exact, preserved.preserved_sources_exact,
    overload_state.overload_exact
  FROM target_state CROSS JOIN acl_state CROSS JOIN dependency_state
    CROSS JOIN preserved CROSS JOIN overload_state
)
SELECT current_user = 'postgres' AND session_user = 'postgres' AS executor_ok,
  contract_exact, acl_exact, dependencies_exact, overload_exact,
  preserved_sources_exact,
  predecessor_source_exact, installed_source_exact,
  CASE
    WHEN contract_exact AND acl_exact AND dependencies_exact AND overload_exact
      AND preserved_sources_exact AND predecessor_source_exact
      THEN 'PREDECESSOR_READY'
    WHEN contract_exact AND acl_exact AND dependencies_exact AND overload_exact
      AND preserved_sources_exact AND installed_source_exact
      THEN 'EXACT_INSTALLED'
    ELSE 'DRIFT_STOP'
  END AS installation_state,
  current_user = 'postgres' AND session_user = 'postgres'
    AND contract_exact AND acl_exact AND dependencies_exact AND overload_exact
    AND preserved_sources_exact AND source_recognized AS operator_state_ok
FROM combined;
