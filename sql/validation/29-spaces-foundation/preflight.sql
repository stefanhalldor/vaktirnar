-- SQL29 personal-space foundation catch-up preflight — READ ONLY.
-- Run only in the explicitly selected production project and share the single
-- result row with Codex. This file does not create or change any object.

BEGIN;
SET TRANSACTION READ ONLY;

WITH required_roles(role_name) AS (
  VALUES ('anon'), ('authenticated'), ('service_role')
), missing_roles AS (
  SELECT required.role_name
  FROM required_roles AS required
  LEFT JOIN pg_catalog.pg_roles AS present
    ON present.rolname = required.role_name
  WHERE present.oid IS NULL
), execution_role AS (
  SELECT role.rolname, role.rolsuper, role.rolbypassrls
  FROM pg_catalog.pg_roles AS role
  WHERE role.rolname = current_user
), target_relations(object_name) AS (
  VALUES
    ('spaces'),
    ('space_members'),
    ('spaces_one_personal_per_user'),
    ('space_members_user_id_idx')
), existing_relations AS (
  SELECT target.object_name
  FROM target_relations AS target
  WHERE pg_catalog.to_regclass('public.' || target.object_name) IS NOT NULL
), existing_functions AS (
  SELECT procedure.proname || '(' ||
    pg_catalog.pg_get_function_identity_arguments(procedure.oid) || ')' AS object_name
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname IN ('is_space_member', 'ensure_personal_space')
), existing_triggers AS (
  SELECT relation.relname || '.' || trigger_row.tgname AS object_name
  FROM pg_catalog.pg_trigger AS trigger_row
  JOIN pg_catalog.pg_class AS relation ON relation.oid = trigger_row.tgrelid
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND NOT trigger_row.tgisinternal
    AND (relation.relname = 'spaces' OR trigger_row.tgname = 'spaces_updated_at')
)
SELECT
  pg_catalog.current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.inet_server_addr() AS server_address,
  pg_catalog.now() AS checked_at,
  pg_catalog.pg_is_in_recovery() AS is_read_replica,
  pg_catalog.to_regclass('auth.users') AS auth_users,
  pg_catalog.to_regprocedure('auth.uid()') AS auth_uid,
  pg_catalog.to_regprocedure('public.teskeid_set_updated_at()') AS updated_at_function,
  pg_catalog.to_regprocedure('pg_catalog.gen_random_uuid()') AS uuid_function,
  COALESCE((
    SELECT pg_catalog.has_schema_privilege(role.oid, 'public', 'USAGE')
    FROM pg_catalog.pg_roles AS role
    WHERE role.rolname = 'authenticated'
  ), false) AS authenticated_public_schema_usage,
  COALESCE(
    (SELECT role.rolsuper OR role.rolbypassrls FROM execution_role AS role),
    false
  ) AS execution_role_bypasses_rls,
  NOT EXISTS (SELECT 1 FROM missing_roles) AS required_roles_ok,
  COALESCE(
    (SELECT pg_catalog.jsonb_agg(role_name ORDER BY role_name) FROM missing_roles),
    '[]'::jsonb
  ) AS missing_required_roles,
  COALESCE(
    (SELECT pg_catalog.jsonb_agg(object_name ORDER BY object_name) FROM existing_relations),
    '[]'::jsonb
  ) AS existing_target_relations,
  COALESCE(
    (SELECT pg_catalog.jsonb_agg(object_name ORDER BY object_name) FROM existing_functions),
    '[]'::jsonb
  ) AS existing_target_functions,
  COALESCE(
    (SELECT pg_catalog.jsonb_agg(object_name ORDER BY object_name) FROM existing_triggers),
    '[]'::jsonb
  ) AS existing_target_triggers,
  NOT EXISTS (SELECT 1 FROM existing_relations)
    AND NOT EXISTS (SELECT 1 FROM existing_functions)
    AND NOT EXISTS (SELECT 1 FROM existing_triggers)
    AS target_objects_absent,
  pg_catalog.to_regclass('auth.users') IS NOT NULL
    AND pg_catalog.to_regprocedure('auth.uid()') IS NOT NULL
    AND pg_catalog.to_regprocedure('public.teskeid_set_updated_at()') IS NOT NULL
    AND pg_catalog.to_regprocedure('pg_catalog.gen_random_uuid()') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM missing_roles)
    AND COALESCE((
      SELECT pg_catalog.has_schema_privilege(role.oid, 'public', 'USAGE')
      FROM pg_catalog.pg_roles AS role
      WHERE role.rolname = 'authenticated'
    ), false)
    AND COALESCE(
      (SELECT role.rolsuper OR role.rolbypassrls FROM execution_role AS role),
      false
    )
    AND NOT pg_catalog.pg_is_in_recovery()
    AS prerequisites_ok,
  (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_stat_activity AS activity
    WHERE activity.datname = pg_catalog.current_database()
      AND activity.pid <> pg_catalog.pg_backend_pid()
      AND activity.xact_start IS NOT NULL
      AND activity.xact_start < pg_catalog.now() - interval '5 minutes'
  ) AS transactions_older_than_five_minutes;

ROLLBACK;
