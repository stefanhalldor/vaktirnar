-- SQL106 expense context chat postflight — READ ONLY.
-- Expected: every *_ok=true and every unexpected/grant/policy/violation
-- counter=0. Row counts are informational.

WITH scope_constraint AS (
  SELECT pg_get_constraintdef(constraint_row.oid) AS definition,
    constraint_row.convalidated
  FROM pg_catalog.pg_constraint AS constraint_row
  WHERE constraint_row.conrelid = to_regclass('public.teskeid_chat_threads')
    AND constraint_row.conname = 'teskeid_chat_threads_scope_check'
), index_state AS (
  SELECT indexname, indexdef
  FROM pg_catalog.pg_indexes
  WHERE schemaname = 'public'
    AND indexname IN (
      'teskeid_chat_messages_client_message_unique_idx',
      'teskeid_chat_messages_idempotency_unique_idx'
    )
)
SELECT
  current_database() AS database_name,
  now() AS checked_at,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'teskeid_chat_messages'
      AND column_name = 'client_message_id' AND data_type = 'uuid'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'teskeid_chat_messages'
      AND column_name = 'idempotency_key' AND data_type = 'uuid'
  ) AS idempotency_columns_ok,
  (SELECT count(*) = 1
     AND bool_and(convalidated)
     AND bool_and(definition LIKE '%weather%')
     AND bool_and(definition LIKE '%expenses%')
     AND bool_and(definition LIKE '%expense_item%')
     AND bool_and(definition LIKE '%vedurstofan_station%')
     AND bool_and(definition LIKE '%vegagerdin_station%')
   FROM scope_constraint) AS closed_scope_constraint_ok,
  EXISTS (
    SELECT 1 FROM index_state
    WHERE indexname = 'teskeid_chat_messages_client_message_unique_idx'
      AND indexdef LIKE 'CREATE UNIQUE INDEX%'
      AND indexdef LIKE '%(thread_id, user_id, client_message_id)%'
      AND indexdef LIKE '%WHERE (client_message_id IS NOT NULL)%'
  ) AND EXISTS (
    SELECT 1 FROM index_state
    WHERE indexname = 'teskeid_chat_messages_idempotency_unique_idx'
      AND indexdef LIKE 'CREATE UNIQUE INDEX%'
      AND indexdef LIKE '%(thread_id, user_id, idempotency_key)%'
      AND indexdef LIKE '%WHERE (idempotency_key IS NOT NULL)%'
  ) AS idempotency_indexes_ok,
  NOT EXISTS (
    SELECT 1 FROM public.teskeid_chat_threads AS thread
    WHERE NOT (
      (thread.domain = 'weather' AND thread.target_type IN ('vedurstofan_station', 'vegagerdin_station'))
      OR (thread.domain = 'expenses' AND thread.target_type = 'expense_item'
        AND thread.target_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
    )
  ) AS scope_rows_ok,
  (SELECT count(*) = 4 AND bool_and(class.relrowsecurity)
   FROM pg_catalog.pg_class AS class
   WHERE class.oid IN (
     to_regclass('public.teskeid_chat_threads'),
     to_regclass('public.teskeid_chat_messages'),
     to_regclass('public.teskeid_chat_read_cursors'),
     to_regclass('public.teskeid_chat_message_reports')
   )) AS rls_enabled_ok,
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
  (SELECT count(*) FROM (
    SELECT thread_id, user_id, client_message_id
    FROM public.teskeid_chat_messages
    WHERE client_message_id IS NOT NULL
    GROUP BY thread_id, user_id, client_message_id
    HAVING count(*) > 1
  ) AS duplicate) AS client_message_id_violations,
  (SELECT count(*) FROM (
    SELECT thread_id, user_id, idempotency_key
    FROM public.teskeid_chat_messages
    WHERE idempotency_key IS NOT NULL
    GROUP BY thread_id, user_id, idempotency_key
    HAVING count(*) > 1
  ) AS duplicate) AS idempotency_key_violations,
  (SELECT count(*) FROM public.teskeid_chat_threads
   WHERE domain = 'expenses' AND target_type = 'expense_item') AS expense_thread_rows,
  (SELECT count(*) FROM public.teskeid_chat_messages AS message
   JOIN public.teskeid_chat_threads AS thread ON thread.id = message.thread_id
   WHERE thread.domain = 'expenses' AND thread.target_type = 'expense_item') AS expense_message_rows,
  (SELECT count(*) FROM pg_catalog.pg_stat_activity
   WHERE datname = current_database()
     AND pid <> pg_backend_pid()
     AND xact_start IS NOT NULL
     AND xact_start < now() - interval '5 minutes') AS transactions_older_than_five_minutes;
