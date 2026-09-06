-- SQL176 MIGRATION: align SQL173's classifier with SQL159's exact receipt.
-- Installation changes one function body and no application row.

DO $sql176_receipt_classifier_fix$
DECLARE
  v_function_oid oid;
  v_original_oid oid;
  v_original_owner oid;
  v_original_acl pg_catalog.aclitem[];
  v_original_comment text;
  v_source text;
  v_fixed_source text;
  v_source_hash text;
  v_overload_count integer := 0;
  v_old_count integer := 0;
  v_new_count integer := 0;
  v_contract_exact boolean := false;
  v_acl_exact boolean := false;
  v_dependencies_exact boolean := false;
  v_consumers_exact boolean := false;
  v_postconditions_ok boolean := false;
  v_state text := 'DRIFT_STOP';
  v_old_token constant text := '(''expense_finalize_private_draft_v1'', ARRAY[''confirmed'',''contract_version'',''draft_id'',''expense_id'',''group_id'',''invitation_ids'',''state'']::text[])';
  v_new_token constant text := '(''expense_finalize_private_draft_v1'', ARRAY[''contract_version'',''draft_id'',''expense_id'',''group_id'',''invitation_ids'',''state'']::text[])';
  v_predecessor_hash constant text := 'edb8a21d01ffdbbb8e9aa2b94c7c2594';
  v_installed_hash constant text := '9399515ec95dac55b2388a2a77be08e7';
BEGIN
  PERFORM pg_catalog.set_config('lock_timeout', '5s', true);
  PERFORM pg_catalog.set_config('search_path', '', true);

  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'expense_sql176_executor_mismatch';
  END IF;
  IF NOT pg_catalog.pg_try_advisory_xact_lock(173, 107) THEN
    RAISE EXCEPTION 'expense_sql176_sql173_lock_unavailable';
  END IF;
  IF NOT pg_catalog.pg_try_advisory_xact_lock(175, 107) THEN
    RAISE EXCEPTION 'expense_sql176_sql175_lock_unavailable';
  END IF;
  IF NOT pg_catalog.pg_try_advisory_xact_lock(176, 107) THEN
    RAISE EXCEPTION 'expense_sql176_lock_unavailable';
  END IF;

  v_function_oid := pg_catalog.to_regprocedure(
    'public.expense_hard_delete_receipt_shape_known(text,jsonb)'
  );

  SELECT pg_catalog.count(*)::integer
  INTO v_overload_count
  FROM pg_catalog.pg_proc AS routine
  WHERE routine.pronamespace = pg_catalog.to_regnamespace('public')
    AND routine.proname = 'expense_hard_delete_receipt_shape_known';

  IF v_function_oid IS NOT NULL THEN
    SELECT routine.prosrc,
      pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n')),
      routine.oid, routine.proowner, routine.proacl,
      pg_catalog.obj_description(routine.oid, 'pg_proc'),
      routine.prokind = 'f'
        AND routine.pronargs = 2
        AND routine.proargnames = ARRAY['p_operation','p_result']::text[]
        AND routine.proargmodes IS NULL
        AND pg_catalog.pg_get_function_arguments(routine.oid)
          = 'p_operation text, p_result jsonb'
        AND pg_catalog.pg_get_function_result(routine.oid) = 'boolean'
        AND routine.prorettype = 'boolean'::pg_catalog.regtype
        AND NOT routine.proretset
        AND routine.provolatile = 'i'::"char"
        AND routine.prosecdef
        AND NOT routine.proisstrict
        AND NOT routine.proleakproof
        AND routine.proparallel = 'u'::"char"
        AND routine.pronargdefaults = 0
        AND routine.proargdefaults IS NULL
        AND routine.proallargtypes IS NULL
        AND routine.provariadic = 0::oid
        AND routine.procost = 100
        AND routine.prorows = 0
        AND routine.prosupport = 0::oid
        AND routine.protrftypes IS NULL
        AND routine.probin IS NULL
        AND routine.prosqlbody IS NULL
        AND routine.proconfig = ARRAY['search_path=""']::text[]
        AND language_row.lanname = 'sql'
        AND owner_role.rolname = 'postgres'
    INTO v_source, v_source_hash, v_original_oid, v_original_owner,
      v_original_acl, v_original_comment, v_contract_exact
    FROM pg_catalog.pg_proc AS routine
    JOIN pg_catalog.pg_language AS language_row ON language_row.oid = routine.prolang
    JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = routine.proowner
    WHERE routine.oid = v_function_oid;

    SELECT pg_catalog.count(*) = 1
        AND COALESCE(pg_catalog.bool_and(
          privilege_row.grantee = pg_catalog.to_regrole('postgres')::oid
            AND privilege_row.grantor = pg_catalog.to_regrole('postgres')::oid
            AND privilege_row.privilege_type = 'EXECUTE'
            AND NOT privilege_row.is_grantable
        ), false)
        AND NOT pg_catalog.has_function_privilege(
          pg_catalog.to_regrole('anon')::oid, v_function_oid, 'EXECUTE')
        AND NOT pg_catalog.has_function_privilege(
          pg_catalog.to_regrole('authenticated')::oid, v_function_oid, 'EXECUTE')
        AND NOT pg_catalog.has_function_privilege(
          pg_catalog.to_regrole('service_role')::oid, v_function_oid, 'EXECUTE')
    INTO v_acl_exact
    FROM pg_catalog.aclexplode(COALESCE(
      v_original_acl, pg_catalog.acldefault('f', v_original_owner)
    )) AS privilege_row;

    SELECT pg_catalog.count(*) = 2
        AND pg_catalog.count(*) FILTER (
          WHERE dependency.refclassid = 'pg_catalog.pg_namespace'::pg_catalog.regclass
            AND dependency.refobjid = pg_catalog.to_regnamespace('public')) = 1
        AND pg_catalog.count(*) FILTER (
          WHERE dependency.refclassid = 'pg_catalog.pg_language'::pg_catalog.regclass
            AND dependency.refobjid = routine.prolang) = 1
        AND COALESCE(pg_catalog.bool_and(
          dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
            AND dependency.objid = v_function_oid
            AND dependency.objsubid = 0 AND dependency.refobjsubid = 0
            AND dependency.deptype = 'n'::"char"
        ), false)
    INTO v_dependencies_exact
    FROM pg_catalog.pg_depend AS dependency
    CROSS JOIN pg_catalog.pg_proc AS routine
    WHERE routine.oid = v_function_oid
      AND dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
      AND dependency.objid = v_function_oid;

    v_old_count := (pg_catalog.char_length(v_source)
      - pg_catalog.char_length(pg_catalog.replace(v_source, v_old_token, '')))
      / pg_catalog.char_length(v_old_token);
    v_new_count := (pg_catalog.char_length(v_source)
      - pg_catalog.char_length(pg_catalog.replace(v_source, v_new_token, '')))
      / pg_catalog.char_length(v_new_token);
  END IF;

  SELECT COALESCE(pg_catalog.bool_and(
    pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
      = expected.source_hash), false) AND pg_catalog.count(routine.oid) = 4
  INTO v_consumers_exact
  FROM (VALUES
    ('public.expense_finalize_private_draft(uuid,uuid,uuid,bigint,bigint,boolean)', '14ac1abc9046fea4812ac652a9b96088'),
    ('public.expense_hard_delete_receipts_classified(uuid,uuid,boolean,uuid[])', '9def695d70fc38b63011cb2bd12e2e67'),
    ('public.expense_get_own_delete_capability(uuid,uuid)', 'ffbd530e2f759d85809a34045ac15a1e'),
    ('public.expense_delete_own_unsettled_expense(uuid,uuid,bigint,uuid)', '41bc44fc718a17fc4fc8c0777e0a0a67')
  ) AS expected(signature, source_hash)
  LEFT JOIN pg_catalog.pg_proc AS routine
    ON routine.oid = pg_catalog.to_regprocedure(expected.signature);

  IF COALESCE(v_contract_exact, false) AND COALESCE(v_acl_exact, false)
     AND COALESCE(v_dependencies_exact, false)
     AND COALESCE(v_consumers_exact, false) AND v_overload_count = 1
     AND v_source_hash = v_predecessor_hash
     AND v_old_count = 1 AND v_new_count = 0 THEN
    v_state := 'PREDECESSOR_READY';
  ELSIF COALESCE(v_contract_exact, false) AND COALESCE(v_acl_exact, false)
     AND COALESCE(v_dependencies_exact, false)
     AND COALESCE(v_consumers_exact, false) AND v_overload_count = 1
     AND v_source_hash = v_installed_hash
     AND v_old_count = 0 AND v_new_count = 1 THEN
    v_state := 'EXACT_INSTALLED';
  END IF;

  IF v_state = 'DRIFT_STOP' THEN
    RAISE EXCEPTION 'expense_sql176_partial_or_predecessor_drift';
  END IF;

  IF v_state = 'PREDECESSOR_READY' THEN
    v_fixed_source := pg_catalog.replace(v_source, v_old_token, v_new_token);
    IF pg_catalog.md5(pg_catalog.replace(v_fixed_source, E'\r\n', E'\n'))
         <> v_installed_hash
       OR pg_catalog.replace(v_fixed_source, v_new_token, v_old_token)
         IS DISTINCT FROM v_source THEN
      RAISE EXCEPTION 'expense_sql176_derivation_failed';
    END IF;

    EXECUTE pg_catalog.format(
      'CREATE OR REPLACE FUNCTION public.expense_hard_delete_receipt_shape_known(p_operation text, p_result jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE CALLED ON NULL INPUT SECURITY DEFINER NOT LEAKPROOF PARALLEL UNSAFE COST 100 SET search_path = %L AS %L',
      '', v_fixed_source
    );
  END IF;

  SELECT routine.oid = v_original_oid
      AND routine.proowner = v_original_owner
      AND routine.proacl IS NOT DISTINCT FROM v_original_acl
      AND pg_catalog.obj_description(routine.oid, 'pg_proc')
        IS NOT DISTINCT FROM v_original_comment
      AND pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
        = v_installed_hash
      AND public.expense_hard_delete_receipt_shape_known(
        'expense_finalize_private_draft_v1',
        '{"contract_version":1,"draft_id":"00000000-0000-4000-8000-000000000001","expense_id":"00000000-0000-4000-8000-000000000002","group_id":"00000000-0000-4000-8000-000000000003","invitation_ids":[],"state":"confirmed"}'::jsonb)
      AND NOT public.expense_hard_delete_receipt_shape_known(
        'expense_finalize_private_draft_v1',
        '{"confirmed":true,"contract_version":1,"draft_id":"00000000-0000-4000-8000-000000000001","expense_id":"00000000-0000-4000-8000-000000000002","group_id":"00000000-0000-4000-8000-000000000003","invitation_ids":[],"state":"confirmed"}'::jsonb)
  INTO v_postconditions_ok
  FROM pg_catalog.pg_proc AS routine
  WHERE routine.oid = v_function_oid;

  IF NOT COALESCE(v_postconditions_ok, false) THEN
    RAISE EXCEPTION 'expense_sql176_postcondition_failed';
  END IF;
END;
$sql176_receipt_classifier_fix$;
