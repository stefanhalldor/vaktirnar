-- SQL100 entry-settlement preflight — READ ONLY.
-- Run on the intended production project before SQL100. Continue only when
-- prerequisites_ok, sql99_fix_ok and activity_constraint_compatible are true;
-- existing_target_* and unexpected_* counts must be 0.

WITH required_tables(name) AS (
  VALUES ('bookkeeping_entries'), ('bookkeeping_periods'),
    ('bookkeeping_activity'), ('bookkeeping_mutation_requests')
), required_functions(name, arguments) AS (
  VALUES
    ('bookkeeping_begin_request', 'uuid, uuid, text, text'),
    ('bookkeeping_finish_request', 'uuid, uuid, jsonb'),
    ('bookkeeping_assert_owner', 'uuid, uuid'),
    ('bookkeeping_record_activity', 'uuid, uuid, uuid, text, uuid, bigint, bigint, bigint, jsonb'),
    ('bookkeeping_entry_json', 'uuid'),
    ('bookkeeping_prepare_account_deletion', 'uuid'),
    ('bookkeeping_assert_entry_payload', 'jsonb')
), present_functions AS (
  SELECT procedure.proname AS name,
    pg_catalog.oidvectortypes(procedure.proargtypes) AS arguments,
    procedure.prosrc
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
), activity_constraint AS (
  SELECT pg_catalog.pg_get_constraintdef(constraint_row.oid) AS definition
  FROM pg_catalog.pg_constraint AS constraint_row
  JOIN pg_catalog.pg_class AS relation ON relation.oid = constraint_row.conrelid
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname = 'bookkeeping_activity'
    AND constraint_row.conname = 'bookkeeping_activity_event_type_check'
), activity_event_types AS (
  SELECT event_match[1] AS event_type
  FROM activity_constraint,
    LATERAL regexp_matches(definition, '''([^'']+)''', 'g') AS event_match
), required_event_types(event_type) AS (
  VALUES ('account_unlinked'), ('entity_created'), ('entry_created'),
    ('entry_review_changed'), ('entry_updated'), ('entry_voided'),
    ('filing_recorded'), ('payment_recorded'), ('period_created'),
    ('period_ready'), ('period_reopened'), ('vat_registration_added')
)
SELECT
  current_database() AS database_name,
  current_user AS database_user,
  now() AS checked_at,
  NOT EXISTS (
    SELECT 1 FROM required_tables AS required
    WHERE pg_catalog.to_regclass('public.' || required.name) IS NULL
  ) AND NOT EXISTS (
    SELECT 1 FROM required_functions AS required
    WHERE NOT EXISTS (
      SELECT 1 FROM present_functions AS present
      WHERE present.name = required.name AND present.arguments = required.arguments
    )
  ) AS prerequisites_ok,
  coalesce((SELECT pg_catalog.strpos(
    prosrc, '((p_entry->''special_cases'') - ARRAY['
  ) > 0 FROM present_functions
  WHERE name = 'bookkeeping_assert_entry_payload' AND arguments = 'jsonb'), false)
    AS sql99_fix_ok,
  (SELECT count(*) = 1 FROM activity_constraint)
    AND NOT EXISTS (SELECT event_type FROM required_event_types
      EXCEPT SELECT event_type FROM activity_event_types)
    AND NOT EXISTS (SELECT event_type FROM activity_event_types
      EXCEPT (SELECT event_type FROM required_event_types
        UNION ALL SELECT 'entry_settlement_changed'))
    AS activity_constraint_compatible,
  ARRAY(SELECT event_type FROM required_event_types
    EXCEPT SELECT event_type FROM activity_event_types ORDER BY 1)
    AS missing_required_activity_events,
  ARRAY(SELECT event_type FROM activity_event_types
    EXCEPT (SELECT event_type FROM required_event_types
      UNION ALL SELECT 'entry_settlement_changed') ORDER BY 1)
    AS unexpected_activity_events,
  CASE WHEN pg_catalog.to_regclass('public.bookkeeping_entry_settlements') IS NULL
    THEN 0 ELSE 1 END AS existing_target_relations,
  (SELECT count(*) FROM present_functions
    WHERE name = 'bookkeeping_set_entry_settlement_state') AS existing_target_functions,
  (SELECT count(*) FROM information_schema.table_privileges
    WHERE table_schema = 'public'
      AND table_name = 'bookkeeping_entry_settlements'
      AND grantee IN ('PUBLIC', 'anon', 'authenticated', 'service_role'))
    AS unexpected_target_table_grants,
  (SELECT count(*) FROM information_schema.routine_privileges
    WHERE specific_schema = 'public'
      AND routine_name = 'bookkeeping_set_entry_settlement_state')
    AS unexpected_target_function_grants,
  (SELECT count(*) FROM pg_catalog.pg_stat_activity
    WHERE datname = current_database()
      AND pid <> pg_catalog.pg_backend_pid()
      AND xact_start < now() - interval '5 minutes')
    AS transactions_older_than_five_minutes;
