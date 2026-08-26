-- SQL160 recovery: restores only the exact prior normalize body.
-- Run only with separate approval; it intentionally restores the known share bug.
BEGIN;

SELECT pg_catalog.pg_advisory_xact_lock(159160);

DO $recovery$
DECLARE
  v_body text;
  v_recovered_body text;
  v_old_token constant text := 'member.value->''input'' - ARRAY';
  v_new_token constant text := '(member.value->''input'') - ARRAY';
  v_occurrences integer;
  v_old_hash constant text := '1d8860f5e38dd9efbefef46c4c47d584';
  v_new_hash constant text := '18a6e628bdb1d3c175b515541ab56787';
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'expense_sql160_recovery_executor_mismatch';
  END IF;

  SELECT function_row.prosrc INTO v_body
  FROM pg_catalog.pg_proc AS function_row
  WHERE function_row.oid = pg_catalog.to_regprocedure(
    'public.expense_sql159_normalize_private_draft(uuid,uuid,boolean)'
  )
    AND function_row.prosecdef
    AND function_row.provolatile = 'v'
    AND function_row.proconfig = ARRAY['search_path=""']::text[]
    AND pg_catalog.pg_get_userbyid(function_row.proowner) = 'postgres'
    AND (
      SELECT pg_catalog.count(*) = 1
        AND pg_catalog.bool_and(
          grantee_row.rolname = 'postgres'
          AND privilege_row.privilege_type = 'EXECUTE'
          AND NOT privilege_row.is_grantable
        )
      FROM pg_catalog.aclexplode(COALESCE(
        function_row.proacl,
        pg_catalog.acldefault('f', function_row.proowner)
      )) AS privilege_row
      LEFT JOIN pg_catalog.pg_roles AS grantee_row
        ON grantee_row.oid = privilege_row.grantee
    );

  IF v_body IS NULL
     OR pg_catalog.md5(pg_catalog.replace(v_body, E'\r\n', E'\n')) <> v_new_hash THEN
    RAISE EXCEPTION 'expense_sql160_recovery_target_mismatch';
  END IF;
  v_occurrences := (
    pg_catalog.char_length(v_body)
    - pg_catalog.char_length(pg_catalog.replace(v_body, v_new_token, ''))
  ) / pg_catalog.char_length(v_new_token);
  IF v_occurrences <> 6 OR pg_catalog.strpos(v_body, v_old_token) <> 0 THEN
    RAISE EXCEPTION 'expense_sql160_recovery_shape_mismatch';
  END IF;

  v_recovered_body := pg_catalog.replace(v_body, v_new_token, v_old_token);
  IF pg_catalog.md5(pg_catalog.replace(v_recovered_body, E'\r\n', E'\n')) <> v_old_hash THEN
    RAISE EXCEPTION 'expense_sql160_recovery_source_mismatch';
  END IF;
  EXECUTE pg_catalog.format(
    'CREATE OR REPLACE FUNCTION public.expense_sql159_normalize_private_draft(p_actor_id uuid,p_draft_id uuid,p_require_balanced boolean) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = %L AS %L',
    '',
    v_recovered_body
  );
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS function_row
    WHERE function_row.oid = pg_catalog.to_regprocedure(
      'public.expense_sql159_normalize_private_draft(uuid,uuid,boolean)'
    )
      AND pg_catalog.md5(pg_catalog.replace(
        function_row.prosrc, E'\r\n', E'\n'
      )) = v_old_hash
      AND function_row.prosecdef
      AND function_row.provolatile = 'v'
      AND function_row.proconfig = ARRAY['search_path=""']::text[]
      AND pg_catalog.pg_get_userbyid(function_row.proowner) = 'postgres'
      AND (
        SELECT pg_catalog.count(*) = 1
          AND pg_catalog.bool_and(
            grantee_row.rolname = 'postgres'
            AND privilege_row.privilege_type = 'EXECUTE'
            AND NOT privilege_row.is_grantable
          )
        FROM pg_catalog.aclexplode(COALESCE(
          function_row.proacl,
          pg_catalog.acldefault('f', function_row.proowner)
        )) AS privilege_row
        LEFT JOIN pg_catalog.pg_roles AS grantee_row
          ON grantee_row.oid = privilege_row.grantee
      )
  ) THEN
    RAISE EXCEPTION 'expense_sql160_recovery_postcondition_failed';
  END IF;
END;
$recovery$;

COMMIT;
