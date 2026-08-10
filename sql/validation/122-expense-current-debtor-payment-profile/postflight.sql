-- SQL122 current-debtor payment-profile postflight — READ ONLY.
-- Run only after Stebbi has separately applied SQL122. Every *_ok must be true.

BEGIN;
SET TRANSACTION READ ONLY;

WITH target_state AS (
  SELECT procedure.oid, procedure.proowner, procedure.prosecdef,
    procedure.provolatile, procedure.prorettype, procedure.prosrc,
    EXISTS (
      SELECT 1 FROM pg_catalog.unnest(
        COALESCE(procedure.proconfig, ARRAY[]::text[])
      ) AS setting WHERE setting IN ('search_path=', 'search_path=""')
    ) AS fixed_empty_search_path
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.oid = pg_catalog.to_regprocedure(
    'public.expense_resolve_payment_profile_v2(uuid,uuid,uuid,uuid,text)'
  )
), target_acl AS (
  SELECT COALESCE(role.rolname, 'PUBLIC') AS grantee, privilege.privilege_type
  FROM target_state AS target
  JOIN pg_catalog.pg_proc AS procedure ON procedure.oid = target.oid
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))
  ) AS privilege
  LEFT JOIN pg_catalog.pg_roles AS role ON role.oid = privilege.grantee
), profile_table_state AS (
  SELECT relation.relowner, relation.relrowsecurity, relation.relforcerowsecurity
  FROM pg_catalog.pg_class AS relation
  WHERE relation.oid = pg_catalog.to_regclass('public.expense_payment_profiles_v2')
)
SELECT
  pg_catalog.current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.now() AS checked_at,
  (SELECT pg_catalog.count(*) = 1 FROM target_state) AS resolver_present_ok,
  (SELECT pg_catalog.count(*) = 1
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = 'expense_resolve_payment_profile_v2')
    AS exact_resolver_overload_ok,
  (SELECT pg_catalog.count(*) = 1
      AND pg_catalog.bool_and(prosecdef)
      AND pg_catalog.bool_and(provolatile = 's')
      AND pg_catalog.bool_and(prorettype = 'jsonb'::pg_catalog.regtype)
      AND pg_catalog.bool_and(fixed_empty_search_path)
    FROM target_state) AS resolver_security_ok,
  (SELECT pg_catalog.count(*) = 1
      AND pg_catalog.bool_and(prosrc LIKE '%public.expense_actor_can_act_for_share_member%')
      AND pg_catalog.bool_and(prosrc LIKE '%debtor.status = ''active''%')
      AND pg_catalog.bool_and(prosrc LIKE '%creditor.status = ''active''%')
      AND pg_catalog.bool_and(prosrc LIKE '%creditor.user_id IS NOT NULL%')
    FROM target_state) AS exact_shared_debtor_authorization_ok,
  (SELECT pg_catalog.count(*) = 1
      AND pg_catalog.bool_and(prosrc LIKE '%public.expense_simplified_settlement(%')
      AND pg_catalog.bool_and(prosrc LIKE '%p_group_id, p_currency, true%')
      AND pg_catalog.bool_and(prosrc LIKE '%settlement.from_member_id = p_from_member_id%')
      AND pg_catalog.bool_and(prosrc LIKE '%settlement.to_member_id = p_to_member_id%')
      AND pg_catalog.bool_and(prosrc LIKE '%settlement.amount_minor > 0%')
      AND pg_catalog.bool_and(prosrc NOT LIKE '%public.expense_obligations%')
    FROM target_state) AS exact_current_settlement_context_ok,
  (SELECT pg_catalog.count(*) = 1
      AND pg_catalog.bool_and(prosrc LIKE '%profile.owner_user_id = v_to_user_id%')
      AND pg_catalog.bool_and(prosrc LIKE '%''profile_id'', v_profile.id%')
      AND pg_catalog.bool_and(prosrc LIKE '%''owner_user_id'', v_profile.owner_user_id%')
      AND pg_catalog.bool_and(prosrc LIKE '%''envelope'', v_profile.encrypted_details%')
    FROM target_state) AS exact_creditor_profile_projection_ok,
  (SELECT pg_catalog.count(*) = 1
      AND pg_catalog.bool_and(prosrc !~* '\m(insert|update|delete|alter|create|drop|grant|revoke|truncate)\M')
      AND pg_catalog.bool_and(prosrc !~* 'decrypt\s*\(')
      AND pg_catalog.bool_and(prosrc NOT LIKE '%expense_payment_preferences%')
    FROM target_state) AS read_only_encrypted_payload_ok,
  NOT EXISTS (
    SELECT 1 FROM target_acl
    WHERE grantee IN ('PUBLIC', 'anon', 'authenticated') AND privilege_type = 'EXECUTE'
  ) AS no_browser_resolver_execute_ok,
  COALESCE((SELECT pg_catalog.has_function_privilege(
    'service_role', target_state.oid, 'EXECUTE'
  ) FROM target_state), false)
    AND (SELECT pg_catalog.count(*) = 1 FROM target_acl
      WHERE grantee = 'service_role' AND privilege_type = 'EXECUTE')
    AS exact_service_role_resolver_execute_ok,
  (SELECT pg_catalog.count(*) = 1
      AND pg_catalog.bool_and(role.rolsuper OR role.rolbypassrls)
    FROM target_state
    JOIN pg_catalog.pg_roles AS role ON role.oid = target_state.proowner)
    AS resolver_owner_bypasses_rls_ok,
  (SELECT pg_catalog.count(*) = 1
      AND pg_catalog.bool_and(relrowsecurity AND relforcerowsecurity)
    FROM profile_table_state)
    AND NOT EXISTS (
      SELECT 1 FROM information_schema.role_table_grants AS privilege
      WHERE privilege.table_schema = 'public'
        AND privilege.table_name = 'expense_payment_profiles_v2'
        AND privilege.grantee IN ('PUBLIC', 'anon', 'authenticated')
    ) AS payment_profile_table_contract_ok,
  (SELECT pg_catalog.count(*) = 1
      AND pg_catalog.bool_and(privilege.privilege_type = 'SELECT')
    FROM information_schema.role_table_grants AS privilege
    WHERE privilege.table_schema = 'public'
      AND privilege.table_name = 'expense_payment_profiles_v2'
      AND privilege.grantee = 'service_role') AS service_role_profile_select_only_ok,
  (SELECT pg_catalog.count(*) = 1
      AND pg_catalog.bool_and(profile.relowner = target.proowner)
    FROM profile_table_state AS profile CROSS JOIN target_state AS target)
    AS resolver_profile_owner_alignment_ok,
  (SELECT pg_catalog.count(*) FROM public.expense_payment_profiles_v2)
    AS encrypted_profile_rows,
  (SELECT pg_catalog.count(*) FROM pg_catalog.pg_stat_activity AS activity
    WHERE activity.datname = pg_catalog.current_database()
      AND activity.pid <> pg_catalog.pg_backend_pid()
      AND activity.xact_start IS NOT NULL
      AND activity.xact_start < pg_catalog.now() - interval '5 minutes')
    AS transactions_older_than_five_minutes;

ROLLBACK;
