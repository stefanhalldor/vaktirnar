-- SQL123 bilateral settlement batch preflight — READ ONLY.
-- Run manually against the explicitly selected Supabase project before SQL123.

BEGIN;
SET TRANSACTION READ ONLY;

WITH required_roles(role_name) AS (
  VALUES ('anon'), ('authenticated'), ('service_role')
), dependencies AS (
  SELECT
    pg_catalog.to_regclass('public.expense_groups') AS groups_table,
    pg_catalog.to_regclass('public.expense_group_members') AS members_table,
    pg_catalog.to_regclass('public.expense_obligations') AS obligations_table,
    pg_catalog.to_regclass('public.expense_repayments') AS repayments_table,
    pg_catalog.to_regclass('public.expense_repayment_allocations') AS allocations_table,
    pg_catalog.to_regclass('public.expense_payment_profiles_v2') AS profiles_table,
    pg_catalog.to_regclass('public.expense_activity') AS activity_table,
    pg_catalog.to_regclass('public.expense_activity_audience') AS activity_audience_table,
    pg_catalog.to_regclass('public.profiles') AS public_profiles_table,
    pg_catalog.to_regprocedure(
      'public.expense_simplified_settlement(uuid,text,boolean)'
    ) AS settlement_function,
    pg_catalog.to_regprocedure(
      'public.expense_begin_request(uuid,uuid,text,text)'
    ) AS begin_request_function,
    pg_catalog.to_regprocedure(
      'public.expense_finish_request(uuid,uuid,jsonb)'
    ) AS finish_request_function,
    pg_catalog.to_regprocedure(
      'public.expense_reported_repayments_need_review(uuid)'
    ) AS review_function,
    pg_catalog.to_regprocedure(
      'public.expense_actor_can_act_for_share_member(uuid,uuid,uuid)'
    ) AS share_authorizer,
    pg_catalog.to_regprocedure(
      'public.expense_resolve_payment_profile_v2(uuid,uuid,uuid,uuid,text)'
    ) AS profile_resolver,
    pg_catalog.to_regprocedure(
      'public.expense_assert_beta_actor(uuid)'
    ) AS beta_assertion,
    pg_catalog.to_regprocedure(
      'public.expense_has_beta_access(uuid)'
    ) AS beta_access_check,
    pg_catalog.to_regprocedure(
      'public.expense_touch_updated_at()'
    ) AS touch_function,
    pg_catalog.to_regprocedure(
      'public.expense_valid_payment_envelope(jsonb)'
    ) AS envelope_validator,
    pg_catalog.to_regprocedure(
      'public.expense_attach_encrypted_payment_snapshot()'
    ) AS snapshot_function
), execution_role AS (
  SELECT role.rolsuper, role.rolbypassrls
  FROM pg_catalog.pg_roles AS role
  WHERE role.rolname = current_user
), missing_roles AS (
  SELECT required.role_name
  FROM required_roles AS required
  LEFT JOIN pg_catalog.pg_roles AS present ON present.rolname = required.role_name
  WHERE present.oid IS NULL
), expected_sql107_columns(
  table_name, column_name, udt_schema, udt_name, is_nullable, has_default
) AS (VALUES
  ('expense_payment_profiles_v2', 'id', 'pg_catalog', 'uuid', 'NO', false),
  ('expense_payment_profiles_v2', 'owner_user_id', 'pg_catalog', 'uuid', 'NO', false),
  ('expense_payment_profiles_v2', 'encrypted_details', 'pg_catalog', 'jsonb', 'NO', false),
  ('expense_payment_profiles_v2', 'payload_fingerprint', 'pg_catalog', 'text', 'NO', false),
  ('expense_payment_profiles_v2', 'version', 'pg_catalog', 'int8', 'NO', true),
  ('expense_payment_profiles_v2', 'created_at', 'pg_catalog', 'timestamptz', 'NO', true),
  ('expense_payment_profiles_v2', 'updated_at', 'pg_catalog', 'timestamptz', 'NO', true),
  ('expense_repayments', 'payment_profile_encrypted_snapshot',
    'pg_catalog', 'jsonb', 'YES', false)
), actual_sql107_columns AS (
  SELECT column_row.table_name::text, column_row.column_name::text,
    column_row.udt_schema::text, column_row.udt_name::text,
    column_row.is_nullable::text, (column_row.column_default IS NOT NULL)
  FROM information_schema.columns AS column_row
  WHERE column_row.table_schema = 'public'
    AND (
      column_row.table_name = 'expense_payment_profiles_v2'
      OR (
        column_row.table_name = 'expense_repayments'
        AND column_row.column_name = 'payment_profile_encrypted_snapshot'
      )
    )
), sql107_column_mismatches AS (
  (SELECT * FROM expected_sql107_columns
   EXCEPT SELECT * FROM actual_sql107_columns)
  UNION ALL
  (SELECT * FROM actual_sql107_columns
   EXCEPT SELECT * FROM expected_sql107_columns)
), required_sql107_constraints(
  relation_id, constraint_name, constraint_type, column_names
) AS (VALUES
  (pg_catalog.to_regclass('public.expense_payment_profiles_v2'),
    'expense_payment_profiles_v2_pkey', 'p'::"char", ARRAY['id']::text[]),
  (pg_catalog.to_regclass('public.expense_payment_profiles_v2'),
    'expense_payment_profiles_v2_owner_unique', 'u'::"char", ARRAY['owner_user_id']::text[]),
  (pg_catalog.to_regclass('public.expense_payment_profiles_v2'),
    'expense_payment_profiles_v2_owner_user_id_fkey', 'f'::"char", ARRAY['owner_user_id']::text[]),
  (pg_catalog.to_regclass('public.expense_payment_profiles_v2'),
    'expense_payment_profiles_v2_envelope_check', 'c'::"char", ARRAY['encrypted_details']::text[]),
  (pg_catalog.to_regclass('public.expense_payment_profiles_v2'),
    'expense_payment_profiles_v2_fingerprint_check', 'c'::"char", ARRAY['payload_fingerprint']::text[]),
  (pg_catalog.to_regclass('public.expense_payment_profiles_v2'),
    'expense_payment_profiles_v2_version_check', 'c'::"char", ARRAY['version']::text[]),
  (pg_catalog.to_regclass('public.expense_repayments'),
    'expense_repayments_encrypted_snapshot_check', 'c'::"char",
    ARRAY['payment_profile_encrypted_snapshot']::text[])
), missing_sql107_constraints AS (
  SELECT required.constraint_name
  FROM required_sql107_constraints AS required
  WHERE required.relation_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = required.relation_id
      AND constraint_row.conname = required.constraint_name
      AND constraint_row.contype = required.constraint_type
      AND constraint_row.convalidated
      AND NOT constraint_row.condeferrable
      AND NOT constraint_row.condeferred
      AND ARRAY(
        SELECT attribute.attname::text
        FROM pg_catalog.unnest(constraint_row.conkey) AS key_column(attnum)
        JOIN pg_catalog.pg_attribute AS attribute
          ON attribute.attrelid = constraint_row.conrelid
         AND attribute.attnum = key_column.attnum
        ORDER BY attribute.attname
      ) = required.column_names
  )
), sql107_owner_fk AS (
  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = pg_catalog.to_regclass(
        'public.expense_payment_profiles_v2'
      )
      AND constraint_row.conname = 'expense_payment_profiles_v2_owner_user_id_fkey'
      AND constraint_row.contype = 'f'
      AND constraint_row.convalidated
      AND constraint_row.confrelid = pg_catalog.to_regclass('auth.users')
      AND constraint_row.confdeltype = 'c'
      AND constraint_row.confupdtype = 'a'
      AND constraint_row.confmatchtype = 's'
      AND NOT constraint_row.condeferrable
      AND NOT constraint_row.condeferred
      AND ARRAY(
        SELECT attribute.attname::text
        FROM pg_catalog.unnest(constraint_row.conkey)
          WITH ORDINALITY AS key_column(attnum, position)
        JOIN pg_catalog.pg_attribute AS attribute
          ON attribute.attrelid = constraint_row.conrelid
         AND attribute.attnum = key_column.attnum
        ORDER BY key_column.position
      ) = ARRAY['owner_user_id']::text[]
      AND ARRAY(
        SELECT attribute.attname::text
        FROM pg_catalog.unnest(constraint_row.confkey)
          WITH ORDINALITY AS key_column(attnum, position)
        JOIN pg_catalog.pg_attribute AS attribute
          ON attribute.attrelid = constraint_row.confrelid
         AND attribute.attnum = key_column.attnum
        ORDER BY key_column.position
      ) = ARRAY['id']::text[]
  ) AS ok
), encrypted_snapshot_trigger AS (
  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger_row
    WHERE trigger_row.tgrelid = pg_catalog.to_regclass('public.expense_repayments')
      AND trigger_row.tgname = 'expense_repayments_encrypted_snapshot'
      AND trigger_row.tgfoid = pg_catalog.to_regprocedure(
        'public.expense_attach_encrypted_payment_snapshot()'
      )
      AND trigger_row.tgtype = 7
      AND trigger_row.tgenabled = 'O'
      AND NOT trigger_row.tgisinternal
  ) AS ok
), profile_table_security AS (
  SELECT COALESCE(relation.relrowsecurity AND relation.relforcerowsecurity, false) AS ok
  FROM (VALUES (pg_catalog.to_regclass('public.expense_payment_profiles_v2')))
    AS target(relation_id)
  LEFT JOIN pg_catalog.pg_class AS relation ON relation.oid = target.relation_id
), sql123_artifacts AS (
  SELECT
    (SELECT pg_catalog.count(*)::integer
     FROM information_schema.columns AS column_row
     WHERE column_row.table_schema = 'public'
       AND column_row.table_name = 'expense_repayments'
       AND column_row.column_name IN (
         'settlement_batch_id', 'settlement_method', 'settlement_sequence'
       )) AS metadata_column_count,
    (SELECT pg_catalog.count(*)::integer
     FROM pg_catalog.pg_proc AS procedure
     JOIN pg_catalog.pg_namespace AS namespace
       ON namespace.oid = procedure.pronamespace
     WHERE namespace.nspname = 'public'
       AND procedure.proname IN (
         'expense_guard_settlement_batch_mutation',
         'expense_guard_settlement_batch_item_mutation',
         'expense_guard_batch_repayment_mutation',
         'expense_lock_payment_profile_owner',
         'expense_record_settlement_batch_activity',
         'expense_insert_settlement_batch_item',
         'expense_propose_settlement_batch',
         'expense_transition_settlement_batch',
         'expense_cancel_batches_before_user_unlink'
       )) AS function_count,
    (SELECT pg_catalog.count(*)::integer
     FROM pg_catalog.pg_trigger AS trigger_row
     WHERE NOT trigger_row.tgisinternal
       AND trigger_row.tgname IN (
         'expense_settlement_batches_touch_updated_at',
         'expense_settlement_batches_immutable_guard',
         'expense_settlement_batch_items_immutable_guard',
         'expense_repayments_batch_guard',
         'expense_payment_profiles_v2_owner_lock',
         'expense_group_members_cancel_batches_before_unlink'
       )) AS trigger_count
)
SELECT
  pg_catalog.current_database() AS database_name,
  current_user AS database_user,
  pg_catalog.inet_server_addr() AS server_address,
  pg_catalog.now() AS checked_at,
  pg_catalog.pg_is_in_recovery() AS is_read_replica,
  dependencies.*,
  pg_catalog.to_regclass('public.expense_settlement_batches') AS existing_batch_table,
  pg_catalog.to_regclass('public.expense_settlement_batch_items') AS existing_item_table,
  NOT EXISTS (SELECT 1 FROM sql107_column_mismatches) AS sql107_columns_ok,
  COALESCE(
    (SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(mismatch))
     FROM sql107_column_mismatches AS mismatch),
    '[]'::jsonb
  ) AS sql107_column_mismatches,
  NOT EXISTS (SELECT 1 FROM missing_sql107_constraints) AS sql107_constraints_ok,
  COALESCE(
    (SELECT pg_catalog.jsonb_agg(constraint_name ORDER BY constraint_name)
     FROM missing_sql107_constraints),
    '[]'::jsonb
  ) AS missing_sql107_constraints,
  (SELECT ok FROM sql107_owner_fk) AS sql107_owner_fk_ok,
  (SELECT ok FROM encrypted_snapshot_trigger) AS encrypted_snapshot_trigger_ok,
  (SELECT ok FROM profile_table_security) AS sql107_profile_force_rls_ok,
  NOT EXISTS (SELECT 1 FROM missing_roles) AS required_roles_ok,
  COALESCE(
    (SELECT pg_catalog.jsonb_agg(role_name ORDER BY role_name) FROM missing_roles),
    '[]'::jsonb
  ) AS missing_required_roles,
  COALESCE(
    (SELECT role.rolsuper OR role.rolbypassrls FROM execution_role AS role),
    false
  ) AS execution_role_bypasses_rls,
  (
    pg_catalog.to_regclass('public.expense_settlement_batches') IS NULL
    AND pg_catalog.to_regclass('public.expense_settlement_batch_items') IS NULL
    AND (SELECT metadata_column_count = 0 FROM sql123_artifacts)
    AND (SELECT function_count = 0 FROM sql123_artifacts)
    AND (SELECT trigger_count = 0 FROM sql123_artifacts)
  ) AS migration_slot_clear,
  (
    dependencies.groups_table IS NOT NULL
    AND dependencies.members_table IS NOT NULL
    AND dependencies.obligations_table IS NOT NULL
    AND dependencies.repayments_table IS NOT NULL
    AND dependencies.allocations_table IS NOT NULL
    AND dependencies.profiles_table IS NOT NULL
    AND dependencies.activity_table IS NOT NULL
    AND dependencies.activity_audience_table IS NOT NULL
    AND dependencies.public_profiles_table IS NOT NULL
    AND dependencies.settlement_function IS NOT NULL
    AND dependencies.begin_request_function IS NOT NULL
    AND dependencies.finish_request_function IS NOT NULL
    AND dependencies.review_function IS NOT NULL
    AND dependencies.share_authorizer IS NOT NULL
    AND dependencies.profile_resolver IS NOT NULL
    AND dependencies.beta_assertion IS NOT NULL
    AND dependencies.beta_access_check IS NOT NULL
    AND dependencies.touch_function IS NOT NULL
    AND dependencies.envelope_validator IS NOT NULL
    AND dependencies.snapshot_function IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM sql107_column_mismatches)
    AND NOT EXISTS (SELECT 1 FROM missing_sql107_constraints)
    AND (SELECT ok FROM sql107_owner_fk)
    AND (SELECT ok FROM encrypted_snapshot_trigger)
    AND (SELECT ok FROM profile_table_security)
    AND NOT EXISTS (SELECT 1 FROM missing_roles)
    AND COALESCE(
      (SELECT role.rolsuper OR role.rolbypassrls FROM execution_role AS role),
      false
    )
    AND NOT pg_catalog.pg_is_in_recovery()
    AND pg_catalog.to_regclass('public.expense_settlement_batches') IS NULL
    AND pg_catalog.to_regclass('public.expense_settlement_batch_items') IS NULL
    AND (SELECT metadata_column_count = 0 FROM sql123_artifacts)
    AND (SELECT function_count = 0 FROM sql123_artifacts)
    AND (SELECT trigger_count = 0 FROM sql123_artifacts)
  ) AS prerequisites_ok,
  (SELECT metadata_column_count FROM sql123_artifacts)
    AS existing_sql123_metadata_columns,
  (SELECT function_count FROM sql123_artifacts)
    AS existing_sql123_functions,
  (SELECT trigger_count FROM sql123_artifacts)
    AS existing_sql123_triggers,
  (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_stat_activity AS activity
    WHERE activity.datname = pg_catalog.current_database()
      AND activity.pid <> pg_catalog.pg_backend_pid()
      AND activity.xact_start IS NOT NULL
      AND activity.xact_start < pg_catalog.now() - interval '5 minutes'
  ) AS transactions_older_than_five_minutes
FROM dependencies;

ROLLBACK;
