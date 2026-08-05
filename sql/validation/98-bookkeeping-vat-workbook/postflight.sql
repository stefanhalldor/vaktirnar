-- SQL98 bookkeeping postflight — READ ONLY.
-- Run only after SQL98 reports success. Expected: every *_ok=true and every
-- *_violations / *_grants / unexpected_policies counter=0.

WITH expected_tables(name) AS (
  VALUES
    ('bookkeeping_entities'), ('bookkeeping_entity_members'),
    ('bookkeeping_vat_registrations'), ('bookkeeping_periods'),
    ('bookkeeping_entries'), ('bookkeeping_entry_lines'),
    ('bookkeeping_entry_revisions'),
    ('bookkeeping_filing_snapshots'), ('bookkeeping_activity'),
    ('bookkeeping_mutation_requests')
),
expected_functions(name, argument_types, service_role_required) AS (
  VALUES
    ('bookkeeping_touch_updated_at', '', false),
    ('bookkeeping_reject_delete', '', false),
    ('bookkeeping_reject_immutable_change', '', false),
    ('bookkeeping_guard_line_revision_update', '', false),
    ('bookkeeping_member_unlink_auth_snapshot', '', false),
    ('bookkeeping_has_beta_access', 'uuid', false),
    ('bookkeeping_assert_beta_actor', 'uuid', false),
    ('bookkeeping_active_member_role', 'uuid, uuid', false),
    ('bookkeeping_assert_owner', 'uuid, uuid', false),
    ('bookkeeping_begin_request', 'uuid, uuid, text, text', false),
    ('bookkeeping_finish_request', 'uuid, uuid, jsonb', false),
    ('bookkeeping_record_activity', 'uuid, uuid, uuid, text, uuid, bigint, bigint, bigint, jsonb', false),
    ('bookkeeping_period_dates_valid', 'text, date, date, date', false),
    ('bookkeeping_assert_entry_payload', 'jsonb', false),
    ('bookkeeping_replace_entry_lines', 'uuid, uuid, uuid, uuid, bigint, jsonb', false),
    ('bookkeeping_clone_entry_lines', 'uuid, uuid, bigint', false),
    ('bookkeeping_capture_entry_revision', 'uuid, uuid', false),
    ('bookkeeping_assert_period_summary_safe', 'uuid', false),
    ('bookkeeping_entity_json', 'uuid', false),
    ('bookkeeping_registration_json', 'uuid', false),
    ('bookkeeping_period_json', 'uuid', false),
    ('bookkeeping_entry_json', 'uuid', false),
    ('bookkeeping_filing_json', 'uuid', false),
    ('bookkeeping_calculate_period_summary', 'uuid, uuid', true),
    ('bookkeeping_period_readiness', 'uuid, uuid', true),
    ('bookkeeping_create_entity', 'uuid, uuid, text, text, text, text, boolean, text, text, text, boolean', true),
    ('bookkeeping_add_vat_registration', 'uuid, uuid, uuid, text, text, text, boolean', true),
    ('bookkeeping_create_period', 'uuid, uuid, uuid, uuid, text, date, date, date, boolean', true),
    ('bookkeeping_create_entry', 'uuid, uuid, uuid, jsonb', true),
    ('bookkeeping_update_entry', 'uuid, uuid, uuid, bigint, jsonb', true),
    ('bookkeeping_set_entry_review_status', 'uuid, uuid, uuid, bigint, text', true),
    ('bookkeeping_void_entry', 'uuid, uuid, uuid, bigint, text', true),
    ('bookkeeping_set_period_ready', 'uuid, uuid, uuid, bigint, boolean', true),
    ('bookkeeping_record_filing', 'uuid, uuid, uuid, bigint, date, date, jsonb, bigint, text, text, text, text, date', true),
    ('bookkeeping_reopen_period', 'uuid, uuid, uuid, bigint, text', true),
    ('bookkeeping_record_payment', 'uuid, uuid, uuid, bigint, text, date', true),
    ('bookkeeping_get_dashboard', 'uuid', true),
    ('bookkeeping_get_period', 'uuid, uuid', true),
    ('bookkeeping_get_entry', 'uuid, uuid', true),
    ('bookkeeping_prepare_account_deletion', 'uuid', true)
),
expected_rpcs(name, argument_types) AS (
  SELECT name, argument_types
  FROM expected_functions
  WHERE service_role_required
),
expected_feature_keys(name) AS (
  VALUES
    ('umonnun'), ('tengsl'), ('facebook-oauth'), ('vedrid'), ('ferdalagid'),
    ('elta-vedrid'), ('weather-provider-vedurstofan'), ('weather-pulse'),
    ('weather-provider-vegagerdin'), ('road-intelligence-v1'),
    ('teskeid-routing-v1'), ('agent-collaboration-private-beta'),
    ('utlagt-og-endurgreitt'), ('bokhaldid')
),
expected_triggers(table_name, trigger_name, function_schema, function_name, trigger_type) AS (
  VALUES
    ('bookkeeping_entities', 'bookkeeping_entities_touch_updated_at', 'public', 'bookkeeping_touch_updated_at', 19),
    ('bookkeeping_entity_members', 'bookkeeping_members_touch_updated_at', 'public', 'bookkeeping_touch_updated_at', 19),
    ('bookkeeping_entity_members', 'bookkeeping_members_unlink_auth_snapshot', 'public', 'bookkeeping_member_unlink_auth_snapshot', 19),
    ('bookkeeping_vat_registrations', 'bookkeeping_registrations_touch_updated_at', 'public', 'bookkeeping_touch_updated_at', 19),
    ('bookkeeping_periods', 'bookkeeping_periods_touch_updated_at', 'public', 'bookkeeping_touch_updated_at', 19),
    ('bookkeeping_entries', 'bookkeeping_entries_touch_updated_at', 'public', 'bookkeeping_touch_updated_at', 19),
    ('bookkeeping_entities', 'bookkeeping_entities_no_delete', 'public', 'bookkeeping_reject_delete', 11),
    ('bookkeeping_entity_members', 'bookkeeping_members_no_delete', 'public', 'bookkeeping_reject_delete', 11),
    ('bookkeeping_vat_registrations', 'bookkeeping_registrations_no_delete', 'public', 'bookkeeping_reject_delete', 11),
    ('bookkeeping_periods', 'bookkeeping_periods_no_delete', 'public', 'bookkeeping_reject_delete', 11),
    ('bookkeeping_entries', 'bookkeeping_entries_no_delete', 'public', 'bookkeeping_reject_delete', 11),
    ('bookkeeping_entry_lines', 'bookkeeping_entry_lines_no_delete', 'public', 'bookkeeping_reject_delete', 11),
    ('bookkeeping_entry_lines', 'bookkeeping_entry_lines_revision_guard', 'public', 'bookkeeping_guard_line_revision_update', 19),
    ('bookkeeping_filing_snapshots', 'bookkeeping_snapshots_immutable', 'public', 'bookkeeping_reject_immutable_change', 27),
    ('bookkeeping_entry_revisions', 'bookkeeping_entry_revisions_immutable', 'public', 'bookkeeping_reject_immutable_change', 27),
    ('bookkeeping_activity', 'bookkeeping_activity_immutable', 'public', 'bookkeeping_reject_immutable_change', 27)
),
present_tables AS (
  SELECT relation.relname AS name, relation.relrowsecurity
  FROM pg_catalog.pg_class AS relation
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relkind = 'r'
    AND relation.relname IN (SELECT name FROM expected_tables)
),
present_functions AS (
  SELECT procedure.oid, procedure.proname AS name, procedure.prosrc,
    pg_catalog.oidvectortypes(procedure.proargtypes) AS argument_types,
    procedure.prosecdef AS security_definer,
    EXISTS (
      SELECT 1
      FROM unnest(coalesce(procedure.proconfig, ARRAY[]::text[])) AS setting
      WHERE setting ~ '^search_path=(""|)$'
    ) AS fixed_empty_search_path
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname LIKE 'bookkeeping\_%' ESCAPE '\'
),
present_triggers AS (
  SELECT relation.relname AS table_name, trigger_row.tgname AS trigger_name,
    procedure_namespace.nspname AS function_schema,
    procedure.proname AS function_name, trigger_row.tgenabled,
    trigger_row.tgtype::integer AS trigger_type,
    pg_catalog.pg_get_triggerdef(trigger_row.oid) AS definition
  FROM pg_catalog.pg_trigger AS trigger_row
  JOIN pg_catalog.pg_class AS relation ON relation.oid = trigger_row.tgrelid
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  JOIN pg_catalog.pg_proc AS procedure ON procedure.oid = trigger_row.tgfoid
  JOIN pg_catalog.pg_namespace AS procedure_namespace
    ON procedure_namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND NOT trigger_row.tgisinternal
    AND relation.relname IN (SELECT name FROM expected_tables)
),
feature_constraint AS (
  SELECT pg_catalog.pg_get_constraintdef(constraint_row.oid) AS definition
  FROM pg_catalog.pg_constraint AS constraint_row
  JOIN pg_catalog.pg_class AS relation ON relation.oid = constraint_row.conrelid
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname = 'feature_access'
    AND constraint_row.conname = 'feature_access_feature_key_check'
),
expected_entry_versions AS (
  SELECT entry.id AS entry_id, version_row.entry_version
  FROM public.bookkeeping_entries AS entry
  CROSS JOIN LATERAL pg_catalog.generate_series(
    1::bigint,
    entry.version
  ) AS version_row(entry_version)
),
line_lifecycle_violations AS (
  SELECT line.row_id
  FROM public.bookkeeping_entry_lines AS line
  JOIN public.bookkeeping_entries AS entry ON entry.id = line.entry_id
  WHERE line.entity_id <> entry.entity_id
     OR line.period_id <> entry.period_id
     OR line.entry_version > entry.version
     OR line.active IS DISTINCT FROM (line.entry_version = entry.version)
     OR (line.active AND line.superseded_at IS NOT NULL)
     OR (NOT line.active AND line.superseded_at IS NULL)
  UNION ALL
  SELECT entry.id
  FROM public.bookkeeping_entries AS entry
  WHERE NOT EXISTS (
      SELECT 1 FROM public.bookkeeping_entry_lines AS line
      WHERE line.entry_id = entry.id
        AND line.entry_version = entry.version
        AND line.active
    )
  UNION ALL
  SELECT expected.entry_id
  FROM expected_entry_versions AS expected
  WHERE NOT EXISTS (
    SELECT 1 FROM public.bookkeeping_entry_lines AS line
    WHERE line.entry_id = expected.entry_id
      AND line.entry_version = expected.entry_version
  )
),
filing_lifecycle_violations AS (
  SELECT snapshot.id
  FROM public.bookkeeping_filing_snapshots AS snapshot
  WHERE snapshot.f_minor <> snapshot.d_minor - snapshot.e_minor
     OR snapshot.d_minor <> snapshot.output_vat_24_minor + snapshot.output_vat_11_minor
     OR snapshot.e_minor <> snapshot.input_vat_24_minor + snapshot.input_vat_11_minor
     OR (snapshot.reported_result_minor <> snapshot.f_minor
       AND nullif(btrim(snapshot.result_mismatch_reason), '') IS NULL)
  UNION ALL
  SELECT period.id
  FROM public.bookkeeping_periods AS period
  WHERE period.state IN ('submitted', 'paid')
    AND NOT EXISTS (
      SELECT 1 FROM public.bookkeeping_filing_snapshots AS snapshot
      WHERE snapshot.period_id = period.id
    )
),
revision_lifecycle_violations AS (
  SELECT expected.entry_id
  FROM expected_entry_versions AS expected
  WHERE NOT EXISTS (
    SELECT 1 FROM public.bookkeeping_entry_revisions AS revision
    WHERE revision.entry_id = expected.entry_id
      AND revision.entry_version = expected.entry_version
  )
  UNION ALL
  SELECT revision.id
  FROM public.bookkeeping_entry_revisions AS revision
  JOIN public.bookkeeping_entries AS entry ON entry.id = revision.entry_id
  WHERE revision.entry_version > entry.version
  UNION ALL
  SELECT revision.id
  FROM public.bookkeeping_entry_revisions AS revision
  WHERE NOT EXISTS (
    SELECT 1 FROM public.bookkeeping_entry_lines AS line
    WHERE line.entry_id = revision.entry_id
      AND line.entry_version = revision.entry_version
  )
)
SELECT
  current_database() AS database_name,
  now() AS checked_at,
  NOT EXISTS (
    SELECT name FROM expected_tables
    EXCEPT SELECT name FROM present_tables
  ) AS tables_ok,
  NOT EXISTS (SELECT 1 FROM present_tables WHERE NOT relrowsecurity) AS rls_ok,
  NOT EXISTS (
    SELECT name, argument_types FROM expected_functions
    EXCEPT SELECT name, argument_types FROM present_functions
  ) AS functions_ok,
  EXISTS (
    SELECT 1 FROM present_functions AS present
    WHERE present.name = 'bookkeeping_assert_entry_payload'
      AND present.argument_types = 'jsonb'
      AND pg_catalog.strpos(
        present.prosrc,
        '((p_entry->''special_cases'') - ARRAY['
      ) > 0
      AND pg_catalog.strpos(
        present.prosrc,
        '(p_entry->''special_cases'' - ARRAY['
      ) = 0
  ) AS entry_validator_operator_precedence_ok,
  NOT EXISTS (
    SELECT expected.table_name, expected.trigger_name, expected.function_schema,
      expected.function_name, expected.trigger_type
    FROM expected_triggers AS expected
    EXCEPT
    SELECT present.table_name, present.trigger_name, present.function_schema,
      present.function_name, present.trigger_type
    FROM present_triggers AS present
    WHERE present.tgenabled IN ('O', 'A')
  ) AND EXISTS (
    SELECT 1 FROM present_triggers AS present
    WHERE present.trigger_name = 'bookkeeping_members_unlink_auth_snapshot'
      AND present.definition LIKE '%BEFORE UPDATE OF user_id ON%'
  ) AS triggers_ok,
  NOT EXISTS (
    SELECT present.table_name, present.trigger_name, present.function_schema,
      present.function_name, present.trigger_type
    FROM present_triggers AS present
    EXCEPT
    SELECT expected.table_name, expected.trigger_name, expected.function_schema,
      expected.function_name, expected.trigger_type
    FROM expected_triggers AS expected
  ) AS no_unexpected_triggers_ok,
  NOT EXISTS (
    SELECT 1
    FROM expected_rpcs AS expected
    JOIN present_functions AS present
      ON present.name = expected.name
     AND present.argument_types = expected.argument_types
    WHERE NOT present.security_definer OR NOT present.fixed_empty_search_path
  ) AS rpc_security_configuration_ok,
  EXISTS (SELECT 1 FROM feature_constraint) AND NOT EXISTS (
    SELECT 1
    FROM expected_feature_keys AS expected
    WHERE NOT EXISTS (
      SELECT 1
      FROM feature_constraint AS present
      WHERE pg_catalog.strpos(
        present.definition,
        pg_catalog.quote_literal(expected.name)
      ) > 0
    )
  ) AS feature_constraint_ok,
  coalesce((
    SELECT jsonb_agg(expected.name ORDER BY expected.name)
    FROM expected_feature_keys AS expected
    WHERE NOT EXISTS (
      SELECT 1
      FROM feature_constraint AS present
      WHERE pg_catalog.strpos(
        present.definition,
        pg_catalog.quote_literal(expected.name)
      ) > 0
    )
  ), '[]'::jsonb) AS missing_required_feature_keys,
  EXISTS (
    SELECT 1 FROM public.ideas
    WHERE slug = 'bokhaldid' AND is_public AND status IN (
      'idea', 'reviewing', 'planned', 'building', 'launched', 'archived'
    )
  ) AS idea_seed_ok,
  (SELECT count(*) FROM information_schema.table_privileges
    WHERE table_schema = 'public'
      AND table_name IN (SELECT name FROM expected_tables)
      AND grantee IN ('PUBLIC', 'anon', 'authenticated'))
    AS browser_table_grants,
  (SELECT count(*) FROM information_schema.table_privileges
    WHERE table_schema = 'public'
      AND table_name IN (SELECT name FROM expected_tables)
      AND grantee = 'service_role')
    AS service_role_table_grants,
  (SELECT count(*) FROM information_schema.column_privileges
    WHERE table_schema = 'public'
      AND table_name IN (SELECT name FROM expected_tables)
      AND grantee IN ('PUBLIC', 'anon', 'authenticated'))
    AS browser_column_grants,
  (SELECT count(*) FROM information_schema.column_privileges
    WHERE table_schema = 'public'
      AND table_name IN (SELECT name FROM expected_tables)
      AND grantee = 'service_role')
    AS service_role_column_grants,
  (SELECT count(*) FROM information_schema.routine_privileges
    WHERE specific_schema = 'public'
      AND routine_name LIKE 'bookkeeping\_%' ESCAPE '\'
      AND grantee IN ('PUBLIC', 'anon', 'authenticated'))
    AS browser_function_execute,
  (SELECT count(*)
    FROM present_functions AS present
    WHERE NOT EXISTS (
      SELECT 1 FROM expected_functions AS expected
      WHERE expected.name = present.name
        AND expected.argument_types = present.argument_types
    )) AS unexpected_bookkeeping_function_overloads,
  (SELECT count(*) FROM expected_rpcs AS expected
    WHERE NOT EXISTS (
      SELECT 1 FROM present_functions AS present
      WHERE present.name = expected.name
        AND present.argument_types = expected.argument_types
        AND pg_catalog.has_function_privilege(
          'service_role', present.oid, 'EXECUTE'
        )
    )) AS missing_service_role_execute,
  (SELECT count(*)
    FROM present_functions AS present
    JOIN expected_functions AS expected
      ON expected.name = present.name
     AND expected.argument_types = present.argument_types
    WHERE NOT expected.service_role_required
      AND pg_catalog.has_function_privilege(
        'service_role', present.oid, 'EXECUTE'
      )) AS service_role_private_helper_execute,
  (SELECT count(*)
    FROM present_triggers AS present
    WHERE NOT EXISTS (
      SELECT 1 FROM expected_triggers AS expected
      WHERE expected.table_name = present.table_name
        AND expected.trigger_name = present.trigger_name
        AND expected.function_schema = present.function_schema
        AND expected.function_name = present.function_name
        AND expected.trigger_type = present.trigger_type
    )) AS unexpected_bookkeeping_triggers,
  (SELECT count(*) FROM pg_catalog.pg_policies
    WHERE schemaname = 'public' AND tablename IN (SELECT name FROM expected_tables))
    AS unexpected_policies,
  (SELECT count(*) FROM line_lifecycle_violations) AS line_lifecycle_violations,
  (SELECT count(*) FROM filing_lifecycle_violations) AS filing_lifecycle_violations,
  (SELECT count(*) FROM revision_lifecycle_violations) AS revision_lifecycle_violations,
  (SELECT count(*) FROM public.bookkeeping_periods
    WHERE (current_payment_state = 'paid' AND current_paid_on IS NULL)
       OR (current_payment_state IS DISTINCT FROM 'paid' AND current_paid_on IS NOT NULL))
    AS payment_lifecycle_violations,
  (SELECT count(*) FROM public.bookkeeping_activity
    WHERE jsonb_typeof(metadata) <> 'object'
       OR octet_length(metadata::text) > 1000
       OR EXISTS (
         SELECT 1 FROM jsonb_object_keys(metadata) AS key
         WHERE key <> ALL (ARRAY[
           'from_state', 'to_state', 'submission_no', 'payment_state',
           'member_unlinked'
         ]::text[])
       ))
    AS audit_metadata_violations,
  (SELECT count(*) FROM public.bookkeeping_entity_members
    WHERE user_id IS NULL AND status = 'active')
    AS active_member_without_auth_violations,
  (SELECT count(*) FROM expected_tables) AS expected_table_count,
  (SELECT count(*) FROM present_tables) AS bookkeeping_table_count,
  (SELECT count(*)
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relkind = 'r'
      AND relation.relname LIKE 'bookkeeping\_%' ESCAPE '\'
      AND relation.relname NOT IN (SELECT name FROM expected_tables))
    AS unexpected_bookkeeping_tables,
  (SELECT count(*) FROM expected_rpcs) AS expected_rpc_count,
  (SELECT count(*)
    FROM present_functions AS present
    JOIN expected_rpcs AS expected
      ON expected.name = present.name
     AND expected.argument_types = present.argument_types)
    AS bookkeeping_rpc_count,
  (SELECT count(*) FROM expected_functions) AS expected_function_count,
  (SELECT count(*) FROM present_functions) AS bookkeeping_function_count,
  (SELECT count(*) FROM public.feature_access WHERE feature_key = 'bokhaldid')
    AS bookkeeping_feature_rows,
  (SELECT definition FROM feature_constraint) AS current_feature_constraint;
