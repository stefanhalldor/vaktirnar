-- SQL136: repair the Event-tagged Expense parent integrity trigger.
-- Additive hotfix only. Safe to run before or after SQL135; never rerun SQL132/133.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public;

DO $preflight$
DECLARE
  v_function_oid oid := pg_catalog.to_regprocedure(
    'public.teskeid_event_financial_parent_integrity_trigger()'
  );
  v_function_hash text;
  v_trigger_names text[];
BEGIN
  IF v_function_oid IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_financial_parent_hotfix_prerequisite_missing';
  END IF;

  SELECT pg_catalog.md5(pg_catalog.replace(function_row.prosrc, E'\r\n', E'\n'))
  INTO v_function_hash
  FROM pg_catalog.pg_proc AS function_row
  JOIN pg_catalog.pg_namespace AS namespace_row
    ON namespace_row.oid = function_row.pronamespace
  JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = function_row.proowner
  WHERE function_row.oid = v_function_oid
    AND namespace_row.nspname = 'public'
    AND owner_role.rolname = 'postgres'
    AND function_row.prosecdef
    AND function_row.prorettype = 'pg_catalog.trigger'::pg_catalog.regtype
    AND function_row.prolang = (
      SELECT language_row.oid
      FROM pg_catalog.pg_language AS language_row
      WHERE language_row.lanname = 'plpgsql'
    )
    AND pg_catalog.cardinality(COALESCE(function_row.proconfig, ARRAY[]::text[])) = 1
    AND function_row.proconfig[1] IN ('search_path=', 'search_path=""')
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.aclexplode(COALESCE(
        function_row.proacl,
        pg_catalog.acldefault('f', function_row.proowner)
      )) AS privilege_row
      LEFT JOIN pg_catalog.pg_roles AS grantee_role
        ON grantee_role.oid = privilege_row.grantee
      WHERE privilege_row.privilege_type = 'EXECUTE'
        AND (
          privilege_row.grantee = 0
          OR grantee_role.rolname IN ('anon', 'authenticated', 'service_role')
        )
    );

  IF v_function_hash IS NULL OR v_function_hash NOT IN (
    'c1ad7695de1c73a5c08eb02a9b3aa7f4',
    'f78470887e47d3d64fde529a71c7410c'
  ) THEN
    RAISE EXCEPTION 'teskeid_event_financial_parent_hotfix_function_drift';
  END IF;

  SELECT pg_catalog.array_agg(trigger_row.tgname::text ORDER BY trigger_row.tgname)
  INTO v_trigger_names
  FROM pg_catalog.pg_trigger AS trigger_row
  WHERE trigger_row.tgfoid = v_function_oid
    AND NOT trigger_row.tgisinternal
    AND trigger_row.tgenabled = 'O'
    AND trigger_row.tgdeferrable
    AND trigger_row.tginitdeferred;

  IF v_trigger_names IS DISTINCT FROM ARRAY[
    'teskeid_event_expense_groups_integrity_deferred',
    'teskeid_event_expense_members_integrity_deferred',
    'teskeid_event_expenses_integrity_deferred'
  ]::text[] THEN
    RAISE EXCEPTION 'teskeid_event_financial_parent_hotfix_trigger_drift';
  END IF;
END;
$preflight$;

CREATE OR REPLACE FUNCTION public.teskeid_event_financial_parent_integrity_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_group_id uuid;
  v_link record;
BEGIN
  IF TG_TABLE_SCHEMA <> 'public' THEN
    RAISE EXCEPTION 'teskeid_event_financial_parent_invalid';
  ELSIF TG_TABLE_NAME = 'expense_groups' THEN
    IF TG_OP = 'DELETE' THEN
      v_group_id := OLD.id;
    ELSIF TG_OP = 'UPDATE' THEN
      v_group_id := NEW.id;
    ELSE
      RAISE EXCEPTION 'teskeid_event_financial_parent_invalid';
    END IF;
  ELSIF TG_TABLE_NAME = 'expense_group_members' THEN
    IF TG_OP = 'DELETE' THEN
      v_group_id := OLD.group_id;
    ELSIF TG_OP = 'UPDATE' THEN
      v_group_id := NEW.group_id;
    ELSE
      RAISE EXCEPTION 'teskeid_event_financial_parent_invalid';
    END IF;
  ELSIF TG_TABLE_NAME = 'expenses' THEN
    IF TG_OP = 'DELETE' THEN
      v_group_id := OLD.group_id;
    ELSIF TG_OP IN ('INSERT', 'UPDATE') THEN
      v_group_id := NEW.group_id;
    ELSE
      RAISE EXCEPTION 'teskeid_event_financial_parent_invalid';
    END IF;
  ELSE
    RAISE EXCEPTION 'teskeid_event_financial_parent_invalid';
  END IF;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'teskeid_event_financial_parent_invalid';
  END IF;

  FOR v_link IN
    SELECT link.event_id, link.group_id, link.expense_id
    FROM public.teskeid_event_expense_links AS link
    WHERE link.group_id = v_group_id
    ORDER BY link.event_id, link.group_id, link.expense_id
  LOOP
    PERFORM public.teskeid_event_assert_expense_link(
      v_link.event_id, v_link.group_id, v_link.expense_id
    );
  END LOOP;
  RETURN NULL;
END;
$function$;

ALTER FUNCTION public.teskeid_event_financial_parent_integrity_trigger()
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.teskeid_event_financial_parent_integrity_trigger()
  FROM PUBLIC, anon, authenticated, service_role;

DO $postflight$
DECLARE
  v_function_oid oid := pg_catalog.to_regprocedure(
    'public.teskeid_event_financial_parent_integrity_trigger()'
  );
  v_contract_ok boolean;
BEGIN
  SELECT
    pg_catalog.md5(pg_catalog.replace(function_row.prosrc, E'\r\n', E'\n')) = 'f78470887e47d3d64fde529a71c7410c'
    AND owner_role.rolname = 'postgres'
    AND function_row.prosecdef
    AND function_row.prorettype = 'pg_catalog.trigger'::pg_catalog.regtype
    AND pg_catalog.cardinality(COALESCE(function_row.proconfig, ARRAY[]::text[])) = 1
    AND function_row.proconfig[1] IN ('search_path=', 'search_path=""')
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.aclexplode(COALESCE(
        function_row.proacl,
        pg_catalog.acldefault('f', function_row.proowner)
      )) AS privilege_row
      LEFT JOIN pg_catalog.pg_roles AS grantee_role
        ON grantee_role.oid = privilege_row.grantee
      WHERE privilege_row.privilege_type = 'EXECUTE'
        AND (
          privilege_row.grantee = 0
          OR grantee_role.rolname IN ('anon', 'authenticated', 'service_role')
        )
    )
  INTO v_contract_ok
  FROM pg_catalog.pg_proc AS function_row
  JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = function_row.proowner
  WHERE function_row.oid = v_function_oid;

  IF v_contract_ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'teskeid_event_financial_parent_hotfix_postcondition_failed';
  END IF;
END;
$postflight$;

COMMIT;
