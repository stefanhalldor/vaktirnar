-- SQL106 expense context chat preflight — READ ONLY.
-- Expected before first application:
-- prerequisites_ok=true, current_scope_rows_ok=true, unexpected_scope_rows=0,
-- browser_table_grants=0, browser_policies=0, old_transactions=0.
-- already_applied may be true on an idempotent rerun.

WITH required_relations(name) AS (
  VALUES
    ('teskeid_chat_threads'),
    ('teskeid_chat_messages'),
    ('teskeid_chat_read_cursors'),
    ('teskeid_chat_message_reports'),
    ('expenses'),
    ('expense_group_members')
), relation_state AS (
  SELECT name, to_regclass('public.' || name) AS oid
  FROM required_relations
), columns AS (
  SELECT
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'teskeid_chat_messages'
        AND column_name = 'client_message_id'
        AND data_type = 'uuid'
    ) AS client_message_id_ok,
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'teskeid_chat_messages'
        AND column_name = 'idempotency_key'
        AND data_type = 'uuid'
    ) AS idempotency_key_ok
), scope_constraint AS (
  SELECT pg_get_constraintdef(constraint_row.oid) AS definition
  FROM pg_catalog.pg_constraint AS constraint_row
  WHERE constraint_row.conrelid = to_regclass('public.teskeid_chat_threads')
    AND constraint_row.conname IN (
      'teskeid_chat_threads_domain_check',
      'teskeid_chat_threads_target_type_check',
      'teskeid_chat_threads_scope_check'
    )
)
SELECT
  current_database() AS database_name,
  current_user AS database_user,
  now() AS checked_at,
  (SELECT count(*) = 6 AND count(oid) = 6 FROM relation_state) AS prerequisites_ok,
  NOT EXISTS (
    SELECT 1 FROM public.teskeid_chat_threads AS thread
    WHERE NOT (
      thread.domain = 'weather'
      AND thread.target_type IN ('vedurstofan_station', 'vegagerdin_station')
    )
    AND NOT (
      thread.domain = 'expenses'
      AND thread.target_type = 'expense_item'
      AND thread.target_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    )
  ) AS current_scope_rows_ok,
  (SELECT count(*) FROM public.teskeid_chat_threads AS thread
   WHERE NOT (
     (thread.domain = 'weather' AND thread.target_type IN ('vedurstofan_station', 'vegagerdin_station'))
     OR (thread.domain = 'expenses' AND thread.target_type = 'expense_item'
       AND thread.target_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
   )) AS unexpected_scope_rows,
  (SELECT client_message_id_ok AND idempotency_key_ok FROM columns)
    AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid = to_regclass('public.teskeid_chat_threads')
        AND conname = 'teskeid_chat_threads_scope_check'
    ) AS already_applied,
  (SELECT jsonb_agg(definition) FROM scope_constraint) AS current_scope_constraints,
  (SELECT count(*) FROM public.teskeid_chat_threads
   WHERE domain = 'expenses' OR target_type = 'expense_item') AS existing_expense_threads,
  (SELECT count(*)
   FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND table_name LIKE 'teskeid_chat_%'
     AND grantee IN ('anon', 'authenticated')) AS browser_table_grants,
  (SELECT count(*)
   FROM pg_catalog.pg_policy AS policy
   WHERE policy.polrelid IN (
     to_regclass('public.teskeid_chat_threads'),
     to_regclass('public.teskeid_chat_messages'),
     to_regclass('public.teskeid_chat_read_cursors'),
     to_regclass('public.teskeid_chat_message_reports')
   )) AS browser_policies,
  (SELECT count(*) FROM pg_catalog.pg_stat_activity
   WHERE datname = current_database()
     AND pid <> pg_backend_pid()
     AND xact_start IS NOT NULL
     AND xact_start < now() - interval '5 minutes') AS transactions_older_than_five_minutes;
