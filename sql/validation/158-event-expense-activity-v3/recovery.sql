-- SQL158 function-only recovery.
-- HARD STOP: rollback the app from V3 to V2 before running this file.
-- This transaction removes only the exact SQL158 V3 entry point.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = '';
SET LOCAL timezone = 'UTC';
SELECT pg_catalog.pg_advisory_xact_lock(158158);

DO $recovery_gate$
DECLARE
  v_v2_oid oid := pg_catalog.to_regprocedure(
    'public.teskeid_event_get_expense_activity_v2(uuid,uuid)'
  );
  v_v3_oid oid := pg_catalog.to_regprocedure(
    'public.teskeid_event_get_expense_activity_v3(uuid,uuid)'
  );
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'teskeid_event_sql158_recovery_executor_mismatch';
  END IF;

  IF v_v2_oid IS NULL OR v_v3_oid IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_sql158_recovery_target_missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS function_row
    JOIN pg_catalog.pg_language AS language_row
      ON language_row.oid = function_row.prolang
    WHERE function_row.oid = v_v2_oid
      AND function_row.prokind = 'f'
      AND function_row.prorettype = 'pg_catalog.jsonb'::pg_catalog.regtype
      AND NOT function_row.proretset
      AND function_row.prosecdef
      AND function_row.provolatile = 'v'
      AND NOT function_row.proisstrict
      AND NOT function_row.proleakproof
      AND function_row.proparallel = 'u'
      AND function_row.pronargdefaults = 0
      AND function_row.proconfig = ARRAY['search_path=""']::text[]
      AND language_row.lanname = 'plpgsql'
      AND pg_catalog.pg_get_userbyid(function_row.proowner) = 'postgres'
      AND pg_catalog.pg_get_function_arguments(function_row.oid) =
            'p_actor_id uuid, p_event_id uuid'
      AND pg_catalog.md5(pg_catalog.replace(
            function_row.prosrc, E'\r\n', E'\n'
          )) = 'd5422fcda5e1ce93aeb08a4f2c9db91a'
      AND (
        SELECT pg_catalog.count(*) = 1
        FROM pg_catalog.pg_proc AS overload
        WHERE overload.pronamespace = function_row.pronamespace
          AND overload.proname = function_row.proname
      )
      AND (
        SELECT pg_catalog.count(*) = 2
        FROM pg_catalog.aclexplode(COALESCE(
          function_row.proacl,
          pg_catalog.acldefault('f', function_row.proowner)
        )) AS privilege
        LEFT JOIN pg_catalog.pg_roles AS grantee
          ON grantee.oid = privilege.grantee
        WHERE privilege.privilege_type = 'EXECUTE'
          AND privilege.grantor = function_row.proowner
          AND NOT privilege.is_grantable
          AND (
            privilege.grantee = function_row.proowner
            OR grantee.rolname = 'service_role'
          )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(COALESCE(
          function_row.proacl,
          pg_catalog.acldefault('f', function_row.proowner)
        )) AS privilege
        LEFT JOIN pg_catalog.pg_roles AS grantee
          ON grantee.oid = privilege.grantee
        WHERE privilege.privilege_type <> 'EXECUTE'
           OR privilege.grantor <> function_row.proowner
           OR privilege.is_grantable
           OR privilege.grantee = 0
           OR (
             privilege.grantee <> function_row.proowner
             AND grantee.rolname IS DISTINCT FROM 'service_role'
           )
      )
  ) THEN
    RAISE EXCEPTION 'teskeid_event_sql158_recovery_predecessor_drift';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS function_row
    JOIN pg_catalog.pg_language AS language_row
      ON language_row.oid = function_row.prolang
    WHERE function_row.oid = v_v3_oid
      AND function_row.prokind = 'f'
      AND function_row.prorettype = 'pg_catalog.jsonb'::pg_catalog.regtype
      AND NOT function_row.proretset
      AND function_row.prosecdef
      AND function_row.provolatile = 'v'
      AND NOT function_row.proisstrict
      AND NOT function_row.proleakproof
      AND function_row.proparallel = 'u'
      AND function_row.pronargdefaults = 0
      AND function_row.proconfig = ARRAY['search_path=""']::text[]
      AND language_row.lanname = 'plpgsql'
      AND pg_catalog.pg_get_userbyid(function_row.proowner) = 'postgres'
      AND pg_catalog.pg_get_function_arguments(function_row.oid) =
            'p_actor_id uuid, p_event_id uuid'
      AND pg_catalog.md5(pg_catalog.replace(
            function_row.prosrc, E'\r\n', E'\n'
          )) = 'ff9ce0a060d5e7c713907881da621f70'
      AND (
        SELECT pg_catalog.count(*) = 1
        FROM pg_catalog.pg_proc AS overload
        WHERE overload.pronamespace = function_row.pronamespace
          AND overload.proname = function_row.proname
      )
      AND (
        SELECT pg_catalog.count(*) = 2
        FROM pg_catalog.aclexplode(COALESCE(
          function_row.proacl,
          pg_catalog.acldefault('f', function_row.proowner)
        )) AS privilege
        LEFT JOIN pg_catalog.pg_roles AS grantee
          ON grantee.oid = privilege.grantee
        WHERE privilege.privilege_type = 'EXECUTE'
          AND privilege.grantor = function_row.proowner
          AND NOT privilege.is_grantable
          AND (
            privilege.grantee = function_row.proowner
            OR grantee.rolname = 'service_role'
          )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(COALESCE(
          function_row.proacl,
          pg_catalog.acldefault('f', function_row.proowner)
        )) AS privilege
        LEFT JOIN pg_catalog.pg_roles AS grantee
          ON grantee.oid = privilege.grantee
        WHERE privilege.privilege_type <> 'EXECUTE'
           OR privilege.grantor <> function_row.proowner
           OR privilege.is_grantable
           OR privilege.grantee = 0
           OR (
             privilege.grantee <> function_row.proowner
             AND grantee.rolname IS DISTINCT FROM 'service_role'
           )
      )
  ) THEN
    RAISE EXCEPTION 'teskeid_event_sql158_recovery_target_drift';
  END IF;
END;
$recovery_gate$;

REVOKE ALL ON FUNCTION
  public.teskeid_event_get_expense_activity_v3(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
DROP FUNCTION public.teskeid_event_get_expense_activity_v3(uuid,uuid);

DO $recovery_postflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS function_row
    WHERE function_row.pronamespace =
          pg_catalog.to_regnamespace('public')
      AND function_row.proname =
          'teskeid_event_get_expense_activity_v3'
  ) THEN
    RAISE EXCEPTION 'teskeid_event_sql158_recovery_incomplete';
  END IF;
END;
$recovery_postflight$;

COMMIT;
