-- SQL118 preflight — READ ONLY. Run only against an explicitly named target.
SELECT
  current_database() AS database_name,
  current_user AS database_user,
  now() AS checked_at,
  to_regclass('public.teskeid_chat_threads') IS NOT NULL
    AND to_regclass('public.teskeid_chat_messages') IS NOT NULL AS prerequisites_ok,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'teskeid_chat_messages'
      AND column_name = 'client_message_id' AND data_type = 'uuid'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'teskeid_chat_messages'
      AND column_name = 'idempotency_key' AND data_type = 'uuid'
  ) AS sql106_idempotency_ok,
  (SELECT count(*) FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name LIKE 'teskeid_chat_%'
     AND grantee IN ('anon', 'authenticated')) AS browser_table_grants,
  (SELECT count(*) FROM pg_catalog.pg_policy
   WHERE polrelid IN (to_regclass('public.teskeid_chat_threads'), to_regclass('public.teskeid_chat_messages'))) AS browser_policies,
  (SELECT count(*) FROM public.teskeid_chat_threads AS thread
   WHERE NOT (
     (thread.domain = 'weather' AND thread.target_type IN ('vedurstofan_station', 'vegagerdin_station'))
     OR (thread.domain = 'expenses' AND thread.target_type = 'expense_item'
       AND thread.target_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
     OR (thread.domain = 'map' AND (
       (thread.target_type = 'map_community' AND thread.target_id = 'iceland-community-v1')
       OR (thread.target_type = 'teskeid_feedback' AND thread.target_id = 'iceland-feedback-v1')
     ))
   )) AS unexpected_scope_rows;
