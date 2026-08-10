-- SQL122 current-debtor payment-profile preflight — READ ONLY.
-- Run manually on the explicitly selected production project. This changes nothing.

BEGIN;
SET TRANSACTION READ ONLY;

WITH required_roles(role_name) AS (
  VALUES ('anon'), ('authenticated'), ('service_role')
), missing_roles AS (
  SELECT required.role_name
  FROM required_roles AS required
  LEFT JOIN pg_catalog.pg_roles AS present ON present.rolname = required.role_name
  WHERE present.oid IS NULL
), execution_role AS (
  SELECT role.rolsuper, role.rolbypassrls
  FROM pg_catalog.pg_roles AS role
  WHERE role.rolname = current_user
), service_role_state AS (
  SELECT role.rolsuper, role.rolbypassrls,
    pg_catalog.has_schema_privilege(role.oid, 'public', 'USAGE') AS public_schema_usage
  FROM pg_catalog.pg_roles AS role
  WHERE role.rolname = 'service_role'
), prerequisites AS (
  SELECT
    pg_catalog.to_regclass('public.expense_payment_profiles_v2') AS payment_profiles,
    pg_catalog.to_regclass('public.expense_group_members') AS group_members,
    pg_catalog.to_regclass('public.expense_share_collaborators') AS share_collaborators,
    pg_catalog.to_regprocedure('public.expense_assert_beta_actor(uuid)') AS assert_beta_actor,
    pg_catalog.to_regprocedure(
      'public.expense_actor_can_act_for_share_member(uuid,uuid,uuid)'
    ) AS share_authorizer,
    pg_catalog.to_regprocedure(
      'public.expense_simplified_settlement(uuid,text,boolean)'
    ) AS simplified_settlement,
    pg_catalog.to_regprocedure(
      'public.expense_resolve_payment_profile_v2(uuid,uuid,uuid,uuid,text)'
    ) AS resolver
), resolver_state AS (
  SELECT procedure.oid, procedure.proowner, procedure.prosecdef,
    procedure.provolatile, procedure.prorettype, procedure.prosrc,
    EXISTS (
      SELECT 1 FROM pg_catalog.unnest(
        COALESCE(procedure.proconfig, ARRAY[]::text[])
      ) AS setting WHERE setting IN ('search_path=', 'search_path=""')
    ) AS fixed_empty_search_path
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.oid = (SELECT resolver FROM prerequisites)
), authorizer_state AS (
  SELECT procedure.prosecdef, procedure.provolatile, procedure.prosrc,
    EXISTS (
      SELECT 1 FROM pg_catalog.unnest(
        COALESCE(procedure.proconfig, ARRAY[]::text[])
      ) AS setting WHERE setting IN ('search_path=', 'search_path=""')
    ) AS fixed_empty_search_path
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.oid = (SELECT share_authorizer FROM prerequisites)
), settlement_state AS (
  SELECT procedure.prosecdef, procedure.provolatile,
    EXISTS (
      SELECT 1 FROM pg_catalog.unnest(
        COALESCE(procedure.proconfig, ARRAY[]::text[])
      ) AS setting WHERE setting IN ('search_path=', 'search_path=""')
    ) AS fixed_empty_search_path
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.oid = (SELECT simplified_settlement FROM prerequisites)
), resolver_acl AS (
  SELECT COALESCE(role.rolname, 'PUBLIC') AS grantee, privilege.privilege_type
  FROM resolver_state AS resolver
  JOIN pg_catalog.pg_proc AS procedure ON procedure.oid = resolver.oid
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))
  ) AS privilege
  LEFT JOIN pg_catalog.pg_roles AS role ON role.oid = privilege.grantee
), profile_table_state AS (
  SELECT relation.relowner, relation.relrowsecurity, relation.relforcerowsecurity
  FROM pg_catalog.pg_class AS relation
  WHERE relation.oid = (SELECT payment_profiles FROM prerequisites)
)
SELECT
  pg_catalog.current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.inet_server_addr() AS server_address,
  pg_catalog.now() AS checked_at,
  pg_catalog.pg_is_in_recovery() AS is_read_replica,
  prerequisites.payment_profiles,
  prerequisites.group_members,
  prerequisites.share_collaborators,
  prerequisites.assert_beta_actor,
  prerequisites.share_authorizer,
  prerequisites.simplified_settlement,
  prerequisites.resolver,
  NOT EXISTS (SELECT 1 FROM missing_roles) AS required_roles_ok,
  COALESCE((SELECT pg_catalog.jsonb_agg(role_name ORDER BY role_name) FROM missing_roles), '[]'::jsonb)
    AS missing_required_roles,
  COALESCE((SELECT rolsuper OR rolbypassrls FROM execution_role), false)
    AS execution_role_bypasses_rls,
  COALESCE((SELECT public_schema_usage FROM service_role_state), false)
    AS service_role_public_schema_usage,
  COALESCE((SELECT rolsuper OR rolbypassrls FROM service_role_state), false)
    AS service_role_bypasses_rls,
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
    FROM resolver_state) AS resolver_security_ok,
  (SELECT pg_catalog.count(*) = 1
      AND pg_catalog.bool_and(prosecdef)
      AND pg_catalog.bool_and(provolatile = 's')
      AND pg_catalog.bool_and(fixed_empty_search_path)
    FROM settlement_state) AS simplified_settlement_security_ok,
  (SELECT pg_catalog.count(*) = 1
      AND pg_catalog.bool_and(prosecdef)
      AND pg_catalog.bool_and(provolatile = 's')
      AND pg_catalog.bool_and(fixed_empty_search_path)
      AND pg_catalog.bool_and(prosrc LIKE '%public.expense_share_collaborators%')
      AND pg_catalog.bool_and(prosrc LIKE '%collaboration.share_member_id = p_member_id%')
      AND pg_catalog.bool_and(prosrc LIKE '%actor_member.user_id = p_actor_id%')
    FROM authorizer_state) AS sql113_share_authorizer_ok,
  NOT EXISTS (
    SELECT 1 FROM resolver_acl
    WHERE grantee IN ('PUBLIC', 'anon', 'authenticated') AND privilege_type = 'EXECUTE'
  ) AS no_browser_resolver_execute_ok,
  COALESCE((SELECT pg_catalog.has_function_privilege(
    'service_role', resolver_state.oid, 'EXECUTE'
  ) FROM resolver_state), false) AS service_role_resolver_execute_ok,
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
      AND pg_catalog.bool_and(role.rolsuper OR role.rolbypassrls)
    FROM resolver_state
    JOIN pg_catalog.pg_roles AS role ON role.oid = resolver_state.proowner)
    AS resolver_owner_bypasses_rls_ok,
  (SELECT pg_catalog.count(*) = 1
      AND pg_catalog.bool_and(profile.relowner = resolver.proowner)
    FROM profile_table_state AS profile CROSS JOIN resolver_state AS resolver)
    AS resolver_profile_owner_alignment_ok,
  COALESCE((SELECT prosrc LIKE '%public.expense_payment_profiles_v2%'
      AND prosrc LIKE '%public.expense_actor_can_act_for_share_member%'
    FROM resolver_state), false) AS current_resolver_contract_ok,
  prerequisites.payment_profiles IS NOT NULL
    AND prerequisites.group_members IS NOT NULL
    AND prerequisites.share_collaborators IS NOT NULL
    AND prerequisites.assert_beta_actor IS NOT NULL
    AND prerequisites.share_authorizer IS NOT NULL
    AND prerequisites.simplified_settlement IS NOT NULL
    AND prerequisites.resolver IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM missing_roles)
    AND COALESCE((SELECT rolsuper OR rolbypassrls FROM execution_role), false)
    AND COALESCE((SELECT public_schema_usage FROM service_role_state), false)
    AND COALESCE((SELECT rolsuper OR rolbypassrls FROM service_role_state), false)
    AND (SELECT pg_catalog.count(*) = 1
      FROM pg_catalog.pg_proc AS procedure
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
      WHERE namespace.nspname = 'public'
        AND procedure.proname = 'expense_resolve_payment_profile_v2')
    AND (SELECT pg_catalog.count(*) = 1
        AND pg_catalog.bool_and(prosecdef)
        AND pg_catalog.bool_and(provolatile = 's')
        AND pg_catalog.bool_and(prorettype = 'jsonb'::pg_catalog.regtype)
        AND pg_catalog.bool_and(fixed_empty_search_path)
      FROM resolver_state)
    AND (SELECT pg_catalog.count(*) = 1
        AND pg_catalog.bool_and(prosecdef)
        AND pg_catalog.bool_and(provolatile = 's')
        AND pg_catalog.bool_and(fixed_empty_search_path)
      FROM settlement_state)
    AND (SELECT pg_catalog.count(*) = 1
        AND pg_catalog.bool_and(prosecdef)
        AND pg_catalog.bool_and(provolatile = 's')
        AND pg_catalog.bool_and(fixed_empty_search_path)
        AND pg_catalog.bool_and(prosrc LIKE '%public.expense_share_collaborators%')
        AND pg_catalog.bool_and(prosrc LIKE '%collaboration.share_member_id = p_member_id%')
        AND pg_catalog.bool_and(prosrc LIKE '%actor_member.user_id = p_actor_id%')
      FROM authorizer_state)
    AND NOT EXISTS (
      SELECT 1 FROM resolver_acl
      WHERE grantee IN ('PUBLIC', 'anon', 'authenticated') AND privilege_type = 'EXECUTE'
    )
    AND COALESCE((SELECT pg_catalog.has_function_privilege(
      'service_role', resolver_state.oid, 'EXECUTE'
    ) FROM resolver_state), false)
    AND (SELECT pg_catalog.count(*) = 1
        AND pg_catalog.bool_and(relrowsecurity AND relforcerowsecurity)
      FROM profile_table_state)
    AND (SELECT pg_catalog.count(*) = 1
        AND pg_catalog.bool_and(privilege.privilege_type = 'SELECT')
      FROM information_schema.role_table_grants AS privilege
      WHERE privilege.table_schema = 'public'
        AND privilege.table_name = 'expense_payment_profiles_v2'
        AND privilege.grantee = 'service_role')
    AND (SELECT pg_catalog.count(*) = 1
        AND pg_catalog.bool_and(role.rolsuper OR role.rolbypassrls)
      FROM resolver_state
      JOIN pg_catalog.pg_roles AS role ON role.oid = resolver_state.proowner)
    AND (SELECT pg_catalog.count(*) = 1
        AND pg_catalog.bool_and(profile.relowner = resolver.proowner)
      FROM profile_table_state AS profile CROSS JOIN resolver_state AS resolver)
    AND COALESCE((SELECT prosrc LIKE '%public.expense_payment_profiles_v2%'
        AND prosrc LIKE '%public.expense_actor_can_act_for_share_member%'
      FROM resolver_state), false)
    AND NOT pg_catalog.pg_is_in_recovery()
    AS prerequisites_ok,
  (SELECT pg_catalog.count(*) FROM pg_catalog.pg_stat_activity AS activity
    WHERE activity.datname = pg_catalog.current_database()
      AND activity.pid <> pg_catalog.pg_backend_pid()
      AND activity.xact_start IS NOT NULL
      AND activity.xact_start < pg_catalog.now() - interval '5 minutes')
    AS transactions_older_than_five_minutes
FROM prerequisites;

ROLLBACK;
