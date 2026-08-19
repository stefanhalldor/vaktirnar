-- Read-only SQL 144 preflight. Every returned boolean must be true.
BEGIN;
SET TRANSACTION READ ONLY;

WITH checks AS (
  SELECT
    current_setting('server_version_num')::integer >= 150000 AS server_version_ok,
    current_user IN ('postgres', 'supabase_admin') AS executor_ok,
    pg_catalog.to_regclass('public.household_chore_participants') IS NOT NULL
      AND pg_catalog.to_regclass('public.household_chore_invitations') IS NOT NULL
      AND pg_catalog.to_regclass('public.household_chore_memberships') IS NOT NULL
      AND pg_catalog.to_regclass('public.feature_access') IS NOT NULL
      AS relations_ok,
    pg_catalog.to_regprocedure(
      'public.household_chore_accept_invitation(uuid,uuid,uuid,bigint)'
    ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_private_start_mutation(uuid,uuid,text,bytea,boolean)'
      ) IS NOT NULL
      AND pg_catalog.to_regprocedure(
        'public.household_chore_private_read_result(boolean,text,jsonb)'
      ) IS NOT NULL
      AS foundation_functions_ok,
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_attribute
      WHERE attrelid = 'public.household_chore_participants'::pg_catalog.regclass
        AND attname = 'display_name_snapshot' AND atttypid = 'text'::pg_catalog.regtype
        AND attnum > 0 AND NOT attisdropped
    ) AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_attribute
      WHERE attrelid = 'public.household_chore_participants'::pg_catalog.regclass
        AND attname = 'linked_user_id' AND atttypid = 'uuid'::pg_catalog.regtype
        AND attnum > 0 AND NOT attisdropped
    ) AS participant_columns_ok,
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_attribute
      WHERE attrelid = 'public.feature_access'::pg_catalog.regclass
        AND attname = 'feature_key' AND attnotnull
        AND attnum > 0 AND NOT attisdropped
    ) AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_attribute
      WHERE attrelid = 'public.feature_access'::pg_catalog.regclass
        AND attname = 'email' AND attnotnull
        AND attnum > 0 AND NOT attisdropped
    ) AS feature_access_columns_ok,
    pg_catalog.to_regprocedure(
      'public.feature_access_heimilisverkin_auth_email_guard()'
    ) IS NOT NULL AS sql143_guard_ok
)
SELECT
  current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.clock_timestamp() AS checked_at,
  server_version_ok,
  executor_ok,
  relations_ok,
  foundation_functions_ok,
  participant_columns_ok,
  feature_access_columns_ok,
  sql143_guard_ok,
  server_version_ok AND executor_ok AND relations_ok
    AND foundation_functions_ok AND participant_columns_ok
    AND feature_access_columns_ok AND sql143_guard_ok AS prerequisites_ok
FROM checks;

ROLLBACK;
