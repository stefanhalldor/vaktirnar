WITH target_tables(name) AS (
  VALUES
    ('bookkeeping_transactions'), ('bookkeeping_transaction_revisions'),
    ('bookkeeping_attachments'), ('bookkeeping_transaction_attachments'),
    ('bookkeeping_transaction_vat_links')
), target_functions(signature, app_facing) AS (
  VALUES
    ('bookkeeping_create_company_transaction(uuid,uuid,uuid,jsonb)', true),
    ('bookkeeping_update_company_transaction(uuid,uuid,uuid,bigint,jsonb)', true),
    ('bookkeeping_void_company_transaction(uuid,uuid,uuid,bigint,text)', true),
    ('bookkeeping_prepare_attachment_upload(uuid,uuid,uuid,uuid,text,text,bigint)', true),
    ('bookkeeping_finalize_attachment_upload(uuid,uuid,uuid,text,bigint,text)', true),
    ('bookkeeping_reject_attachment_upload(uuid,uuid,uuid,text)', true),
    ('bookkeeping_set_transaction_vat_disposition(uuid,uuid,uuid,bigint,text)', true),
    ('bookkeeping_link_transaction_to_vat_entry(uuid,uuid,uuid,bigint,uuid,jsonb)', true),
    ('bookkeeping_get_company_ledger(uuid,uuid)', true),
    ('bookkeeping_get_company_transaction(uuid,uuid)', true),
    ('bookkeeping_get_attachment_for_download(uuid,uuid)', true),
    ('bookkeeping_get_pending_attachment_for_finalize(uuid,uuid)', true),
    ('bookkeeping_transaction_snapshot(uuid)', false),
    ('bookkeeping_capture_transaction_revision(uuid,uuid,text)', false),
    ('bookkeeping_assert_transaction_payload(jsonb)', false),
    ('bookkeeping_company_transaction_json(uuid)', false)
), table_state AS (
  SELECT count(*)::integer AS table_count,
    count(*) FILTER (WHERE c.relrowsecurity AND c.relforcerowsecurity)::integer AS rls_count
  FROM target_tables t
  LEFT JOIN pg_catalog.pg_class c ON c.oid = to_regclass('public.' || t.name)
), function_state AS (
  SELECT count(*) FILTER (WHERE to_regprocedure('public.' || signature) IS NOT NULL)::integer AS function_count
  FROM target_functions
), grants AS (
  SELECT
    count(*) FILTER (WHERE grantee IN ('anon','authenticated'))::integer AS browser_table_grants,
    count(*) FILTER (WHERE grantee = 'service_role')::integer AS service_role_table_grants
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name IN (SELECT name FROM target_tables)
), function_grants AS (
  SELECT
    count(*) FILTER (WHERE grantee IN ('anon','authenticated'))::integer AS browser_execute,
    count(*) FILTER (WHERE grantee = 'service_role' AND tf.app_facing)::integer AS service_role_app_execute,
    count(*) FILTER (WHERE grantee = 'service_role' AND NOT tf.app_facing)::integer AS service_role_helper_execute
  FROM information_schema.routine_privileges rp
  JOIN target_functions tf ON split_part(tf.signature, '(', 1) = rp.routine_name
  WHERE rp.routine_schema = 'public' AND rp.privilege_type = 'EXECUTE'
), target_rows AS (
  SELECT
    (SELECT count(*) FROM public.bookkeeping_transactions)::integer AS transactions,
    (SELECT count(*) FROM public.bookkeeping_attachments)::integer AS attachments,
    (SELECT count(*) FROM public.bookkeeping_transaction_vat_links)::integer AS vat_links
), bucket AS (
  SELECT count(*)::integer AS count,
    bool_and(NOT public AND file_size_limit = 15728640
      AND allowed_mime_types @> ARRAY['image/jpeg','image/png','image/webp','application/pdf']::text[]) AS secure
  FROM storage.buckets WHERE id = 'bookkeeping-private'
), totals AS (
  SELECT
    (SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND c.relname LIKE 'bookkeeping\_%' ESCAPE '\')::integer AS table_count,
    (SELECT count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname LIKE 'bookkeeping\_%' ESCAPE '\')::integer AS function_count,
    (SELECT count(*) FROM information_schema.routine_privileges
      WHERE routine_schema = 'public' AND routine_name LIKE 'bookkeeping\_%' ESCAPE '\'
        AND grantee = 'service_role' AND privilege_type = 'EXECUTE')::integer AS rpc_count
)
SELECT
  current_database() AS database_name,
  now() AS checked_at,
  (SELECT table_count = 5 FROM table_state) AS tables_ok,
  (SELECT rls_count = 5 FROM table_state) AS rls_force_ok,
  (SELECT function_count = 16 FROM function_state) AS functions_ok,
  (SELECT count = 1 AND secure FROM bucket) AS private_bucket_ok,
  (SELECT browser_table_grants = 0 FROM grants) AS browser_table_grants_ok,
  (SELECT service_role_table_grants = 0 FROM grants) AS service_role_direct_table_grants_ok,
  (SELECT browser_execute = 0 FROM function_grants) AS browser_function_execute_ok,
  (SELECT service_role_app_execute = 12 FROM function_grants) AS service_role_rpc_execute_ok,
  (SELECT service_role_helper_execute = 0 FROM function_grants) AS private_helper_execute_ok,
  (SELECT table_count = 16 AND function_count = 57 AND rpc_count = 30 FROM totals) AS exact_bookkeeping_object_counts_ok,
  (SELECT transactions = 0 AND attachments = 0 AND vat_links = 0 FROM target_rows) AS no_backfill_ok,
  (SELECT transactions FROM target_rows) AS transaction_rows,
  (SELECT attachments FROM target_rows) AS attachment_rows,
  (SELECT vat_links FROM target_rows) AS vat_link_rows;
