-- SQL118 postflight — READ ONLY.
WITH scope_constraint AS (
  SELECT pg_get_constraintdef(oid) AS definition, convalidated
  FROM pg_catalog.pg_constraint
  WHERE conrelid = to_regclass('public.teskeid_chat_threads')
    AND conname = 'teskeid_chat_threads_scope_check'
), message_constraints AS (
  SELECT conname, convalidated
  FROM pg_catalog.pg_constraint
  WHERE conrelid = to_regclass('public.teskeid_chat_messages')
    AND conname IN (
      'teskeid_chat_messages_kind_check',
      'teskeid_chat_messages_anchor_pair_check',
      'teskeid_chat_messages_anchor_iceland_check',
      'teskeid_chat_messages_map_note_anchor_check'
    )
)
SELECT
  current_database() AS database_name,
  now() AS checked_at,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='teskeid_chat_messages' AND column_name='anchor_lat' AND data_type='double precision')
    AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='teskeid_chat_messages' AND column_name='anchor_lon' AND data_type='double precision') AS anchor_columns_ok,
  (SELECT count(*) = 1 AND bool_and(convalidated) AND bool_and(definition LIKE '%map_community%') AND bool_and(definition LIKE '%teskeid_feedback%') FROM scope_constraint) AS closed_scope_ok,
  (SELECT count(*) = 4 AND bool_and(convalidated) FROM message_constraints) AS message_constraints_ok,
  (SELECT count(*) = 2 AND bool_and(relrowsecurity) FROM pg_catalog.pg_class WHERE oid IN (to_regclass('public.teskeid_chat_threads'), to_regclass('public.teskeid_chat_messages'))) AS rls_enabled_ok,
  (SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name LIKE 'teskeid_chat_%' AND grantee IN ('anon','authenticated')) AS browser_table_grants,
  (SELECT count(*) FROM pg_catalog.pg_policy WHERE polrelid IN (to_regclass('public.teskeid_chat_threads'), to_regclass('public.teskeid_chat_messages'))) AS browser_policies,
  (SELECT count(*) FROM public.teskeid_chat_messages WHERE (anchor_lat IS NULL) <> (anchor_lon IS NULL)) AS anchor_pair_violations,
  (SELECT count(*) FROM public.teskeid_chat_messages
    WHERE message_kind='map_note' AND anchor_lat IS NULL
      AND metadata ->> 'locationMode' IS DISTINCT FROM 'general') AS map_note_anchor_violations,
  (SELECT count(*) FROM public.teskeid_chat_threads WHERE domain='map' AND target_type='map_community') AS community_threads,
  (SELECT count(*) FROM public.teskeid_chat_threads WHERE domain='map' AND target_type='teskeid_feedback') AS private_feedback_threads;
