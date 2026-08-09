-- SQL115 Kviss authoring preflight — READ ONLY.
-- Run manually on the explicitly selected production project and share the
-- complete single result row with Codex. This file changes nothing.

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
  SELECT role.oid,
    pg_catalog.has_schema_privilege(role.oid, 'public', 'USAGE') AS public_schema_usage
  FROM pg_catalog.pg_roles AS role
  WHERE role.rolname = 'service_role'
), feature_constraints AS (
  SELECT constraint_row.conname,
    pg_catalog.pg_get_constraintdef(constraint_row.oid) AS definition
  FROM pg_catalog.pg_constraint AS constraint_row
  WHERE constraint_row.conrelid = pg_catalog.to_regclass('public.feature_access')
    AND constraint_row.contype = 'c'
), target_objects AS (
  SELECT
    pg_catalog.to_regclass('public.kviss_questions') AS questions_collision,
    pg_catalog.to_regclass('public.kviss_templates') AS templates_collision,
    pg_catalog.to_regclass('public.kviss_template_questions') AS template_questions_collision,
    pg_catalog.to_regprocedure('public.kviss_assert_author(uuid,uuid)') AS assert_author_collision,
    pg_catalog.to_regprocedure('public.kviss_upsert_question(uuid,uuid,uuid,integer,text,jsonb,integer[],integer,integer,boolean,text[],integer)') AS upsert_question_collision,
    pg_catalog.to_regprocedure('public.kviss_save_template(uuid,uuid,uuid,integer,text,text[],jsonb)') AS save_template_collision,
    pg_catalog.to_regprocedure('public.kviss_archive_question(uuid,uuid,uuid,integer)') AS archive_question_collision
), prerequisite_state AS (
  SELECT
    pg_catalog.to_regclass('auth.users') AS auth_users,
    pg_catalog.to_regclass('public.feature_access') AS feature_access,
    pg_catalog.to_regclass('public.spaces') AS spaces,
    pg_catalog.to_regclass('public.space_members') AS space_members,
    pg_catalog.to_regprocedure('public.ensure_personal_space()') AS ensure_personal_space,
    pg_catalog.to_regprocedure('pg_catalog.gen_random_uuid()') AS uuid_function
)
SELECT
  pg_catalog.current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.inet_server_addr() AS server_address,
  pg_catalog.now() AS checked_at,
  pg_catalog.pg_is_in_recovery() AS is_read_replica,
  prerequisites.auth_users,
  prerequisites.feature_access,
  prerequisites.spaces,
  prerequisites.space_members,
  prerequisites.ensure_personal_space,
  prerequisites.uuid_function,
  NOT EXISTS (SELECT 1 FROM missing_roles) AS required_roles_ok,
  COALESCE(
    (SELECT pg_catalog.jsonb_agg(role_name ORDER BY role_name) FROM missing_roles),
    '[]'::jsonb
  ) AS missing_required_roles,
  COALESCE(
    (SELECT role.rolsuper OR role.rolbypassrls FROM execution_role AS role),
    false
  ) AS execution_role_bypasses_rls,
  COALESCE(
    (SELECT state.public_schema_usage FROM service_role_state AS state),
    false
  ) AS service_role_public_schema_usage,
  EXISTS (
    SELECT 1 FROM feature_constraints AS constraint_row
    WHERE constraint_row.conname = 'feature_access_feature_key_check'
  ) AS feature_constraint_present,
  EXISTS (
    SELECT 1 FROM feature_constraints AS constraint_row
    WHERE constraint_row.conname = 'feature_access_feature_key_check'
      AND constraint_row.definition LIKE '%''kviss''%'
  ) AS feature_constraint_already_contains_kviss,
  COALESCE((
    SELECT pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'name', constraint_row.conname,
        'definition', constraint_row.definition
      ) ORDER BY constraint_row.conname
    )
    FROM feature_constraints AS constraint_row
  ), '[]'::jsonb) AS feature_access_constraints,
  target.questions_collision,
  target.templates_collision,
  target.template_questions_collision,
  target.assert_author_collision,
  target.upsert_question_collision,
  target.save_template_collision,
  target.archive_question_collision,
  target.questions_collision IS NULL
    AND target.templates_collision IS NULL
    AND target.template_questions_collision IS NULL
    AND target.assert_author_collision IS NULL
    AND target.upsert_question_collision IS NULL
    AND target.save_template_collision IS NULL
    AND target.archive_question_collision IS NULL
    AS target_objects_absent,
  prerequisites.auth_users IS NOT NULL
    AND prerequisites.feature_access IS NOT NULL
    AND prerequisites.spaces IS NOT NULL
    AND prerequisites.space_members IS NOT NULL
    AND prerequisites.ensure_personal_space IS NOT NULL
    AND prerequisites.uuid_function IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM missing_roles)
    AND COALESCE(
      (SELECT role.rolsuper OR role.rolbypassrls FROM execution_role AS role),
      false
    )
    AND COALESCE(
      (SELECT state.public_schema_usage FROM service_role_state AS state),
      false
    )
    AND EXISTS (
      SELECT 1 FROM feature_constraints AS constraint_row
      WHERE constraint_row.conname = 'feature_access_feature_key_check'
    )
    AND target.questions_collision IS NULL
    AND target.templates_collision IS NULL
    AND target.template_questions_collision IS NULL
    AND target.assert_author_collision IS NULL
    AND target.upsert_question_collision IS NULL
    AND target.save_template_collision IS NULL
    AND target.archive_question_collision IS NULL
    AND NOT pg_catalog.pg_is_in_recovery()
    AS prerequisites_ok,
  (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_stat_activity AS activity
    WHERE activity.datname = pg_catalog.current_database()
      AND activity.pid <> pg_catalog.pg_backend_pid()
      AND activity.xact_start IS NOT NULL
      AND activity.xact_start < pg_catalog.now() - interval '5 minutes'
  ) AS transactions_older_than_five_minutes
FROM prerequisite_state AS prerequisites
CROSS JOIN target_objects AS target;

ROLLBACK;
