-- SQL176 rollback-only rehearsal. Synthetic JSON and catalog state only.
BEGIN;

DO $sql176_rehearsal_install$
DECLARE
  v_function_oid oid;
  v_source text;
  v_fixed_source text;
  v_original_oid oid;
  v_original_owner oid;
  v_original_acl pg_catalog.aclitem[];
  v_original_comment text;
  v_old_token constant text := '(''expense_finalize_private_draft_v1'', ARRAY[''confirmed'',''contract_version'',''draft_id'',''expense_id'',''group_id'',''invitation_ids'',''state'']::text[])';
  v_new_token constant text := '(''expense_finalize_private_draft_v1'', ARRAY[''contract_version'',''draft_id'',''expense_id'',''group_id'',''invitation_ids'',''state'']::text[])';
BEGIN
  PERFORM pg_catalog.set_config('lock_timeout', '5s', true);
  PERFORM pg_catalog.set_config('search_path', '', true);
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'expense_sql176_executor_mismatch';
  END IF;
  IF NOT pg_catalog.pg_try_advisory_xact_lock(173, 107)
     OR NOT pg_catalog.pg_try_advisory_xact_lock(175, 107)
     OR NOT pg_catalog.pg_try_advisory_xact_lock(176, 107) THEN
    RAISE EXCEPTION 'expense_sql176_rehearsal_lock_unavailable';
  END IF;

  v_function_oid := pg_catalog.to_regprocedure(
    'public.expense_hard_delete_receipt_shape_known(text,jsonb)');
  IF v_function_oid IS NULL OR (
    SELECT pg_catalog.count(*) FROM pg_catalog.pg_proc AS routine
    WHERE routine.pronamespace = pg_catalog.to_regnamespace('public')
      AND routine.proname = 'expense_hard_delete_receipt_shape_known'
  ) <> 1 THEN
    RAISE EXCEPTION 'expense_sql176_rehearsal_contract_drift';
  END IF;

  SELECT routine.prosrc, routine.oid, routine.proowner, routine.proacl,
    pg_catalog.obj_description(routine.oid, 'pg_proc')
  INTO v_source, v_original_oid, v_original_owner, v_original_acl,
    v_original_comment
  FROM pg_catalog.pg_proc AS routine
  WHERE routine.oid = v_function_oid
    AND pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
      = 'edb8a21d01ffdbbb8e9aa2b94c7c2594'
    AND routine.prokind = 'f' AND routine.pronargs = 2
    AND routine.proargnames = ARRAY['p_operation','p_result']::text[]
    AND routine.proargmodes IS NULL
    AND pg_catalog.pg_get_function_arguments(routine.oid)
      = 'p_operation text, p_result jsonb'
    AND pg_catalog.pg_get_function_result(routine.oid) = 'boolean'
    AND routine.provolatile = 'i'::"char" AND routine.prosecdef
    AND NOT routine.proisstrict AND NOT routine.proleakproof
    AND routine.proparallel = 'u'::"char"
    AND routine.proconfig = ARRAY['search_path=""']::text[];
  IF v_source IS NULL THEN
    RAISE EXCEPTION 'expense_sql176_rehearsal_predecessor_drift';
  END IF;
  IF (pg_catalog.char_length(v_source)
      - pg_catalog.char_length(pg_catalog.replace(v_source, v_old_token, '')))
       / pg_catalog.char_length(v_old_token) <> 1
     OR pg_catalog.strpos(v_source, v_new_token) <> 0 THEN
    RAISE EXCEPTION 'expense_sql176_rehearsal_token_drift';
  END IF;

  v_fixed_source := pg_catalog.replace(v_source, v_old_token, v_new_token);
  IF pg_catalog.md5(pg_catalog.replace(v_fixed_source, E'\r\n', E'\n'))
       <> '9399515ec95dac55b2388a2a77be08e7'
     OR pg_catalog.replace(v_fixed_source, v_new_token, v_old_token)
       IS DISTINCT FROM v_source THEN
    RAISE EXCEPTION 'expense_sql176_rehearsal_derivation_failed';
  END IF;

  EXECUTE pg_catalog.format(
    'CREATE OR REPLACE FUNCTION public.expense_hard_delete_receipt_shape_known(p_operation text, p_result jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE CALLED ON NULL INPUT SECURITY DEFINER NOT LEAKPROOF PARALLEL UNSAFE COST 100 SET search_path = %L AS %L',
    '', v_fixed_source);

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc AS routine
    WHERE routine.oid = v_function_oid
      AND routine.oid = v_original_oid
      AND routine.proowner = v_original_owner
      AND routine.proacl IS NOT DISTINCT FROM v_original_acl
      AND pg_catalog.obj_description(routine.oid, 'pg_proc')
        IS NOT DISTINCT FROM v_original_comment
      AND pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
        = '9399515ec95dac55b2388a2a77be08e7'
  ) THEN
    RAISE EXCEPTION 'expense_sql176_rehearsal_catalog_mismatch';
  END IF;

  IF NOT public.expense_hard_delete_receipt_shape_known(
    'expense_finalize_private_draft_v1',
    '{"contract_version":1,"draft_id":"00000000-0000-4000-8000-000000000001","expense_id":"00000000-0000-4000-8000-000000000002","group_id":"00000000-0000-4000-8000-000000000003","invitation_ids":[],"state":"confirmed"}'::jsonb
  ) THEN
    RAISE EXCEPTION 'expense_sql176_canonical_six_key_receipt_rejected';
  END IF;
  IF public.expense_hard_delete_receipt_shape_known(
    'expense_finalize_private_draft_v1',
    '{"confirmed":true,"contract_version":1,"draft_id":"00000000-0000-4000-8000-000000000001","expense_id":"00000000-0000-4000-8000-000000000002","group_id":"00000000-0000-4000-8000-000000000003","invitation_ids":[],"state":"confirmed"}'::jsonb
  ) OR public.expense_hard_delete_receipt_shape_known(
    'expense_finalize_private_draft_v1',
    '{"contract_version":1,"draft_id":"00000000-0000-4000-8000-000000000001","expense_id":"00000000-0000-4000-8000-000000000002","group_id":"00000000-0000-4000-8000-000000000003","invitation_ids":[]}'::jsonb
  ) OR public.expense_hard_delete_receipt_shape_known(
    'expense_finalize_private_draft_v1', '[]'::jsonb
  ) OR public.expense_hard_delete_receipt_shape_known(
    'unknown_operation', '{}'::jsonb
  ) THEN
    RAISE EXCEPTION 'expense_sql176_fail_closed_assertion_failed';
  END IF;
END;
$sql176_rehearsal_install$;

ROLLBACK;

WITH predecessor AS MATERIALIZED (
  SELECT pg_catalog.count(*) = 1
      AND COALESCE(pg_catalog.bool_and(
        pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\r\n', E'\n'))
          = 'edb8a21d01ffdbbb8e9aa2b94c7c2594'), false)
        AS predecessor_restored
  FROM pg_catalog.pg_proc AS routine
  WHERE routine.oid = pg_catalog.to_regprocedure(
    'public.expense_hard_delete_receipt_shape_known(text,jsonb)')
)
SELECT current_user = 'postgres' AND session_user = 'postgres' AS executor_ok,
  true AS candidate_catalog_verified,
  predecessor.predecessor_restored AS installation_rolled_back,
  predecessor.predecessor_restored,
  current_user = 'postgres' AND session_user = 'postgres'
    AND predecessor.predecessor_restored AS rehearsal_pass
FROM predecessor;
