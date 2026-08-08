-- SQL118 recovery assessment — READ ONLY.
-- This intentionally does not drop columns or scopes. Removing the feature is
-- an application rollback first; destructive schema recovery needs a separate
-- approval after proving all map rows are archived or disposable.
SELECT
  current_database() AS database_name,
  now() AS checked_at,
  (SELECT count(*) FROM public.teskeid_chat_threads WHERE domain='map') AS map_thread_rows,
  (SELECT count(*) FROM public.teskeid_chat_messages AS message
    JOIN public.teskeid_chat_threads AS thread ON thread.id=message.thread_id
    WHERE thread.domain='map') AS map_message_rows,
  (SELECT max(created_at) FROM public.teskeid_chat_messages AS message
    JOIN public.teskeid_chat_threads AS thread ON thread.id=message.thread_id
    WHERE thread.domain='map') AS latest_map_message_at;
