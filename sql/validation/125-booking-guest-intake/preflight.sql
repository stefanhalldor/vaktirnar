-- SQL125 booking guest-intake preflight -- READ ONLY.
-- Stebbi runs this manually on the explicitly selected project before SQL125.
-- Share the complete single result row; prerequisites_ok must be true.

BEGIN;
SET TRANSACTION READ ONLY;

WITH required_roles(role_name) AS (
  VALUES ('anon'), ('authenticated'), ('service_role'), ('postgres')
), missing_roles AS (
  SELECT required.role_name
  FROM required_roles AS required
  LEFT JOIN pg_catalog.pg_roles AS present ON present.rolname = required.role_name
  WHERE present.oid IS NULL
), execution_role AS (
  SELECT role.rolname, role.rolsuper, role.rolbypassrls
  FROM pg_catalog.pg_roles AS role
  WHERE role.rolname = current_user
), postgres_owner AS (
  SELECT role.rolsuper, role.rolbypassrls
  FROM pg_catalog.pg_roles AS role
  WHERE role.rolname = 'postgres'
), service_role_state AS (
  SELECT
    pg_catalog.has_schema_privilege(role.oid, 'public', 'USAGE') AS public_schema_usage
  FROM pg_catalog.pg_roles AS role
  WHERE role.rolname = 'service_role'
), dependencies AS (
  SELECT
    pg_catalog.to_regclass('auth.users') AS auth_users,
    pg_catalog.to_regclass('public.feature_access') AS feature_access,
    pg_catalog.to_regclass('public.spaces') AS spaces,
    pg_catalog.to_regclass('public.space_members') AS space_members,
    pg_catalog.to_regclass('public.business_profiles') AS business_profiles,
    pg_catalog.to_regprocedure(
      'public.check_and_increment_ip_rate_limit(text,date,integer)'
    ) AS rate_limit_function,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS procedure_row
      WHERE procedure_row.oid = pg_catalog.to_regprocedure(
        'public.check_and_increment_ip_rate_limit(text,date,integer)'
      )
        AND procedure_row.prorettype = pg_catalog.to_regtype('pg_catalog.bool')
    ) AS rate_limit_returns_boolean,
    pg_catalog.to_regprocedure('pg_catalog.gen_random_uuid()') AS uuid_function
), business_profile_key AS (
  SELECT
    constraint_row.convalidated,
    constraint_row.conkey = ARRAY[
      (SELECT attribute.attnum
       FROM pg_catalog.pg_attribute AS attribute
       WHERE attribute.attrelid = constraint_row.conrelid
         AND attribute.attname = 'space_id'
         AND NOT attribute.attisdropped),
      (SELECT attribute.attnum
       FROM pg_catalog.pg_attribute AS attribute
       WHERE attribute.attrelid = constraint_row.conrelid
         AND attribute.attname = 'id'
         AND NOT attribute.attisdropped)
    ]::smallint[] AS exact_columns
  FROM pg_catalog.pg_constraint AS constraint_row
  WHERE constraint_row.conrelid = pg_catalog.to_regclass('public.business_profiles')
    AND constraint_row.conname = 'business_profiles_space_id_id_key'
    AND constraint_row.contype = 'u'
), feature_constraint AS (
  SELECT
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
    ('booking_services'),
    ('booking_services_pkey'),
    ('booking_services_space_profile_id_key'),
    ('booking_services_one_active_profile_idx'),
    ('booking_services_last_idempotency_key_idx'),
    ('booking_services_public_idx'),
    ('booking_requests'),
    ('booking_requests_pkey'),
    ('booking_requests_public_id_key'),
    ('booking_requests_create_request_id_key'),
    ('booking_requests_provider_created_idx'),
    ('booking_access_members'),
    ('booking_access_members_pkey'),
    ('booking_access_members_request_email_key'),
    ('booking_access_members_active_idx'),
    ('booking_capability_sessions'),
    ('booking_capability_sessions_pkey'),
    ('booking_capability_sessions_token_hash_key'),
    ('booking_capability_sessions_request_idx'),
    ('booking_messages'),
    ('booking_messages_pkey'),
    ('booking_messages_client_message_key'),
    ('booking_messages_idempotency_key'),
    ('booking_messages_request_time_idx'),
    ('booking_events'),
    ('booking_events_pkey'),
    ('booking_events_idempotency_key'),
    ('booking_events_request_time_idx')
), relation_collisions AS (
  SELECT COALESCE(
    pg_catalog.array_agg(target.name ORDER BY target.name),
    ARRAY[]::text[]
  ) AS names
  FROM relation_targets AS target
  WHERE pg_catalog.to_regclass('public.' || target.name) IS NOT NULL
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
  WHERE namespace.nspname = 'public'
    AND procedure.proname LIKE 'booking_%'
), trigger_collisions AS (
  SELECT COALESCE(
    pg_catalog.array_agg(
      relation.relname || '.' || trigger_row.tgname
      ORDER BY relation.relname, trigger_row.tgname
    ),
    ARRAY[]::text[]
  ) AS names
  FROM pg_catalog.pg_trigger AS trigger_row
  JOIN pg_catalog.pg_class AS relation ON relation.oid = trigger_row.tgrelid
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND NOT trigger_row.tgisinternal
    AND trigger_row.tgname = 'booking_events_immutable_guard'
), contract AS (
  SELECT
    dependencies.*,
    NOT EXISTS (SELECT 1 FROM missing_roles) AS required_roles_ok,
    COALESCE((
      SELECT role.rolname = 'postgres' OR role.rolsuper
      FROM execution_role AS role
    ), false) AS execution_role_can_assign_postgres_owner,
    COALESCE((
      SELECT role.rolsuper OR role.rolbypassrls
      FROM postgres_owner AS role
    ), false) AS postgres_owner_bypasses_rls,
    COALESCE((
      SELECT state.public_schema_usage
      FROM service_role_state AS state
    ), false) AS service_role_public_schema_usage,
    (SELECT pg_catalog.count(*) = 1
      AND pg_catalog.bool_and(key_row.convalidated AND key_row.exact_columns)
     FROM business_profile_key AS key_row) AS business_profile_composite_key_ok,
    (SELECT pg_catalog.count(*) = 1
      AND pg_catalog.bool_and(constraint_row.convalidated)
     FROM feature_constraint AS constraint_row) AS feature_constraint_present,
    EXISTS (
      SELECT 1
      FROM feature_constraint AS constraint_row
      WHERE pg_catalog.strpos(
        constraint_row.definition,
        pg_catalog.quote_literal('auglysandi')
      ) > 0
    ) AS feature_constraint_contains_auglysandi,
    EXISTS (
      SELECT 1
      FROM feature_constraint AS constraint_row
      WHERE pg_catalog.strpos(
        constraint_row.definition,
        pg_catalog.quote_literal('bokanir')
      ) > 0
    ) AS feature_constraint_already_contains_bokanir,
    (SELECT collisions.names FROM relation_collisions AS collisions)
      AS relation_collisions,
    (SELECT collisions.names FROM function_collisions AS collisions)
      AS function_collisions,
    (SELECT collisions.names FROM trigger_collisions AS collisions)
      AS trigger_collisions
  FROM dependencies
)
SELECT
  pg_catalog.current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.inet_server_addr() AS server_address,
  pg_catalog.now() AS checked_at,
  pg_catalog.pg_is_in_recovery() AS is_read_replica,
  contract.*,
  pg_catalog.cardinality(contract.relation_collisions) = 0
    AND pg_catalog.cardinality(contract.function_collisions) = 0
    AND pg_catalog.cardinality(contract.trigger_collisions) = 0
    AS target_objects_absent,
  NOT pg_catalog.pg_is_in_recovery()
    AND contract.auth_users IS NOT NULL
    AND contract.feature_access IS NOT NULL
    AND contract.spaces IS NOT NULL
    AND contract.space_members IS NOT NULL
    AND contract.business_profiles IS NOT NULL
    AND contract.rate_limit_function IS NOT NULL
    AND contract.rate_limit_returns_boolean
    AND contract.uuid_function IS NOT NULL
    AND contract.required_roles_ok
    AND contract.execution_role_can_assign_postgres_owner
    AND contract.postgres_owner_bypasses_rls
    AND contract.service_role_public_schema_usage
    AND contract.business_profile_composite_key_ok
    AND contract.feature_constraint_present
    AND contract.feature_constraint_contains_auglysandi
    AND pg_catalog.cardinality(contract.relation_collisions) = 0
    AND pg_catalog.cardinality(contract.function_collisions) = 0
    AND pg_catalog.cardinality(contract.trigger_collisions) = 0
    AS prerequisites_ok,
  (SELECT pg_catalog.count(*)
   FROM pg_catalog.pg_stat_activity AS activity
   WHERE activity.pid <> pg_catalog.pg_backend_pid()
     AND activity.datname = pg_catalog.current_database()
     AND activity.xact_start IS NOT NULL
     AND activity.xact_start < pg_catalog.now() - interval '5 minutes')
    AS transactions_older_than_five_minutes
FROM contract;

ROLLBACK;
