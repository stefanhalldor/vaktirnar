-- SQL120 advertiser-foundation preflight — READ ONLY.
-- Stebbi runs this manually on the explicitly selected production project.
-- Share the complete single result row before considering SQL120 apply.

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
  SELECT role.oid, role.rolsuper, role.rolbypassrls
  FROM pg_catalog.pg_roles AS role
  WHERE role.rolname = current_user
), service_role_state AS (
  SELECT role.oid,
    pg_catalog.has_schema_privilege(role.oid, 'public', 'USAGE') AS public_schema_usage,
    (role.rolsuper OR role.rolbypassrls) AS bypasses_rls
  FROM pg_catalog.pg_roles AS role
  WHERE role.rolname = 'service_role'
), prerequisites AS (
  SELECT
    pg_catalog.to_regclass('auth.users') AS auth_users,
    pg_catalog.to_regclass('public.feature_access') AS feature_access,
    pg_catalog.to_regclass('public.spaces') AS spaces,
    pg_catalog.to_regclass('public.space_members') AS space_members,
    pg_catalog.to_regprocedure('public.ensure_personal_space()') AS ensure_personal_space,
    pg_catalog.to_regprocedure('pg_catalog.gen_random_uuid()') AS uuid_function
), feature_constraints AS (
  SELECT constraint_row.conname,
    constraint_row.convalidated,
    pg_catalog.pg_get_expr(
      constraint_row.conbin,
      constraint_row.conrelid
    ) AS definition
  FROM pg_catalog.pg_constraint AS constraint_row
  WHERE constraint_row.conrelid = pg_catalog.to_regclass('public.feature_access')
    AND constraint_row.conname = 'feature_access_feature_key_check'
    AND constraint_row.contype = 'c'
), relation_targets(name) AS (
  VALUES
    ('business_profiles'),
    ('business_profiles_pkey'),
    ('business_profiles_slug_key'),
    ('business_profiles_space_id_id_key'),
    ('business_profiles_space_active_idx'),
    ('advertiser_creatives'),
    ('advertiser_creatives_pkey'),
    ('advertiser_creatives_space_id_id_key'),
    ('advertiser_creatives_profile_idx'),
    ('advertiser_creatives_review_queue_idx'),
    ('advertiser_one_active_per_placement_idx'),
    ('advertiser_audit_events'),
    ('advertiser_audit_events_pkey'),
    ('advertiser_audit_events_idempotency_key'),
    ('advertiser_audit_creative_time_idx')
), relation_collisions AS (
  SELECT COALESCE(
    pg_catalog.array_agg(target.name ORDER BY target.name),
    ARRAY[]::text[]
  ) AS names
  FROM relation_targets AS target
  WHERE pg_catalog.to_regclass('public.' || target.name) IS NOT NULL
), function_targets(name) AS (
  VALUES
    ('advertiser_assert_owner'),
    ('advertiser_upsert_business_profile'),
    ('advertiser_upsert_creative'),
    ('advertiser_owner_transition'),
    ('advertiser_admin_review'),
    ('advertiser_resolve_public'),
    ('advertiser_audit_immutable')
), function_collisions AS (
  SELECT COALESCE(
    pg_catalog.array_agg(
      procedure.proname || '(' ||
      pg_catalog.pg_get_function_identity_arguments(procedure.oid) || ')'
      ORDER BY procedure.proname, procedure.oid
    ),
    ARRAY[]::text[]
  ) AS names
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = procedure.pronamespace
  JOIN function_targets AS target ON target.name = procedure.proname
  WHERE namespace.nspname = 'public'
), trigger_collisions AS (
  SELECT COALESCE(
    pg_catalog.array_agg(
      relation.relname || '.' || trigger_row.tgname
      ORDER BY relation.relname
    ),
    ARRAY[]::text[]
  ) AS names
  FROM pg_catalog.pg_trigger AS trigger_row
  JOIN pg_catalog.pg_class AS relation ON relation.oid = trigger_row.tgrelid
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND NOT trigger_row.tgisinternal
    AND trigger_row.tgname = 'advertiser_audit_immutable_guard'
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
  (SELECT COALESCE(
    pg_catalog.array_agg(missing.role_name ORDER BY missing.role_name),
    ARRAY[]::text[]
  ) FROM missing_roles AS missing) AS missing_required_roles,
  (SELECT role.rolsuper OR role.rolbypassrls FROM execution_role AS role)
    AS execution_role_bypasses_rls,
  (SELECT state.public_schema_usage FROM service_role_state AS state)
    AS service_role_public_schema_usage,
  (SELECT state.bypasses_rls FROM service_role_state AS state)
    AS service_role_bypasses_rls,
  (SELECT pg_catalog.count(*) = 1
    AND pg_catalog.bool_and(constraint_row.convalidated)
   FROM feature_constraints AS constraint_row)
    AS feature_constraint_present,
  EXISTS (
    SELECT 1
    FROM feature_constraints AS constraint_row
    WHERE pg_catalog.strpos(
      constraint_row.definition,
      pg_catalog.quote_literal('kviss')
    ) > 0
  ) AS feature_constraint_contains_kviss,
  EXISTS (
    SELECT 1
    FROM feature_constraints AS constraint_row
    WHERE pg_catalog.strpos(
      constraint_row.definition,
      pg_catalog.quote_literal('auglysandi')
    ) > 0
  ) AS feature_constraint_already_contains_auglysandi,
  (SELECT pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'name', constraint_row.conname,
      'validated', constraint_row.convalidated,
      'definition', constraint_row.definition
    ) ORDER BY constraint_row.conname
  ) FROM feature_constraints AS constraint_row) AS feature_access_constraints,
  (SELECT collisions.names FROM relation_collisions AS collisions)
    AS relation_collisions,
  (SELECT collisions.names FROM function_collisions AS collisions)
    AS function_collisions,
  (SELECT collisions.names FROM trigger_collisions AS collisions)
    AS trigger_collisions,
  pg_catalog.cardinality((SELECT collisions.names FROM relation_collisions AS collisions)) = 0
    AND pg_catalog.cardinality((SELECT collisions.names FROM function_collisions AS collisions)) = 0
    AND pg_catalog.cardinality((SELECT collisions.names FROM trigger_collisions AS collisions)) = 0
    AS target_objects_absent,
  NOT pg_catalog.pg_is_in_recovery()
    AND prerequisites.auth_users IS NOT NULL
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
    AND COALESCE(
      (SELECT state.bypasses_rls FROM service_role_state AS state),
      false
    )
    AND (SELECT pg_catalog.count(*) = 1
      AND pg_catalog.bool_and(constraint_row.convalidated)
     FROM feature_constraints AS constraint_row)
    AND EXISTS (
      SELECT 1
      FROM feature_constraints AS constraint_row
      WHERE pg_catalog.strpos(
        constraint_row.definition,
        pg_catalog.quote_literal('kviss')
      ) > 0
    )
    AND pg_catalog.cardinality((SELECT collisions.names FROM relation_collisions AS collisions)) = 0
    AND pg_catalog.cardinality((SELECT collisions.names FROM function_collisions AS collisions)) = 0
    AND pg_catalog.cardinality((SELECT collisions.names FROM trigger_collisions AS collisions)) = 0
    AS prerequisites_ok,
  (SELECT pg_catalog.count(*)
   FROM pg_catalog.pg_stat_activity AS activity
   WHERE activity.pid <> pg_catalog.pg_backend_pid()
     AND activity.datname = pg_catalog.current_database()
     AND activity.xact_start IS NOT NULL
     AND activity.xact_start < pg_catalog.now() - interval '5 minutes')
    AS transactions_older_than_five_minutes
FROM prerequisites;

ROLLBACK;
