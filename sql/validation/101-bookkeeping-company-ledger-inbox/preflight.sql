WITH required_relations(name) AS (
  VALUES
    ('bookkeeping_entities'), ('bookkeeping_entity_members'),
    ('bookkeeping_vat_registrations'), ('bookkeeping_periods'),
    ('bookkeeping_entries'), ('bookkeeping_entry_lines'),
    ('bookkeeping_entry_revisions'), ('bookkeeping_filing_snapshots'),
    ('bookkeeping_activity'), ('bookkeeping_mutation_requests'),
    ('bookkeeping_entry_settlements')
), target_relations(name) AS (
  VALUES
    ('bookkeeping_transactions'), ('bookkeeping_transaction_revisions'),
    ('bookkeeping_attachments'), ('bookkeeping_transaction_attachments'),
    ('bookkeeping_transaction_vat_links')
), target_functions(signature) AS (
  VALUES
    ('bookkeeping_create_company_transaction(uuid,uuid,uuid,jsonb)'),
    ('bookkeeping_update_company_transaction(uuid,uuid,uuid,bigint,jsonb)'),
    ('bookkeeping_void_company_transaction(uuid,uuid,uuid,bigint,text)'),
    ('bookkeeping_prepare_attachment_upload(uuid,uuid,uuid,uuid,text,text,bigint)'),
    ('bookkeeping_finalize_attachment_upload(uuid,uuid,uuid,text,bigint,text)'),
    ('bookkeeping_reject_attachment_upload(uuid,uuid,uuid,text)'),
    ('bookkeeping_set_transaction_vat_disposition(uuid,uuid,uuid,bigint,text)'),
    ('bookkeeping_link_transaction_to_vat_entry(uuid,uuid,uuid,bigint,uuid,jsonb)'),
    ('bookkeeping_get_company_ledger(uuid,uuid)'),
    ('bookkeeping_get_company_transaction(uuid,uuid)'),
    ('bookkeeping_get_attachment_for_download(uuid,uuid)'),
    ('bookkeeping_get_pending_attachment_for_finalize(uuid,uuid)')
), current_bookkeeping AS (
  SELECT count(*)::integer AS relation_count
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
    AND c.relname LIKE 'bookkeeping\_%' ESCAPE '\'
), current_functions AS (
  SELECT count(*)::integer AS function_count
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname LIKE 'bookkeeping\_%' ESCAPE '\'
), current_service_role_rpcs AS (
  SELECT count(*)::integer AS rpc_count
  FROM information_schema.routine_privileges
  WHERE routine_schema = 'public' AND routine_name LIKE 'bookkeeping\_%' ESCAPE '\'
    AND grantee = 'service_role' AND privilege_type = 'EXECUTE'
), missing_required AS (
  SELECT coalesce(jsonb_agg(name ORDER BY name), '[]'::jsonb) AS names
  FROM required_relations WHERE to_regclass('public.' || name) IS NULL
), existing_targets AS (
  SELECT coalesce(jsonb_agg(name ORDER BY name), '[]'::jsonb) AS names
  FROM target_relations WHERE to_regclass('public.' || name) IS NOT NULL
), existing_functions AS (
  SELECT coalesce(jsonb_agg(signature ORDER BY signature), '[]'::jsonb) AS signatures
  FROM target_functions WHERE to_regprocedure('public.' || signature) IS NOT NULL
), long_transactions AS (
  SELECT count(*)::integer AS count
  FROM pg_catalog.pg_stat_activity
  WHERE xact_start IS NOT NULL
    AND now() - xact_start > interval '5 minutes'
    AND pid <> pg_backend_pid()
)
SELECT
  current_database() AS database_name,
  current_user AS database_user,
  now() AS checked_at,
  (SELECT names = '[]'::jsonb FROM missing_required)
    AND to_regprocedure('public.bookkeeping_set_entry_settlement_state(uuid,uuid,uuid,bigint,text)') IS NOT NULL
    AND (SELECT relation_count = 11 FROM current_bookkeeping)
    AND (SELECT function_count = 41 FROM current_functions)
    AND (SELECT rpc_count = 18 FROM current_service_role_rpcs) AS prerequisites_ok,
  (SELECT names FROM missing_required) AS missing_required_relations,
  (SELECT relation_count FROM current_bookkeeping) AS current_bookkeeping_table_count,
  (SELECT function_count FROM current_functions) AS current_bookkeeping_function_count,
  (SELECT rpc_count FROM current_service_role_rpcs) AS current_bookkeeping_rpc_count,
  (SELECT names FROM existing_targets) AS existing_target_relations,
  (SELECT signatures FROM existing_functions) AS existing_target_functions,
  EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'storage')
    AND to_regclass('storage.buckets') IS NOT NULL
    AND to_regclass('storage.objects') IS NOT NULL AS storage_prerequisites_ok,
  (SELECT count FROM long_transactions) AS transactions_older_than_five_minutes;
