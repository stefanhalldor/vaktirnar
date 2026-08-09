-- DESTRUCTIVE and intentionally NOT RUN. Only for an approved empty-beta rollback.
BEGIN;
DROP FUNCTION IF EXISTS public.kviss_touch_participant(text,uuid);
DROP FUNCTION IF EXISTS public.kviss_send_message(text,uuid,text);
DROP FUNCTION IF EXISTS public.kviss_answer_question(text,uuid,integer,uuid);
DROP FUNCTION IF EXISTS public.kviss_host_command(uuid,uuid,bigint,uuid,text,uuid);
DROP FUNCTION IF EXISTS public.kviss_join_session(text,text,text,text,text);
DROP FUNCTION IF EXISTS public.kviss_create_session(uuid,uuid,uuid,text,text);
DROP TABLE IF EXISTS public.kviss_join_attempts;
DROP TABLE IF EXISTS public.kviss_session_commands;
DROP TABLE IF EXISTS public.kviss_session_messages;
DROP TABLE IF EXISTS public.kviss_answers;
DROP TABLE IF EXISTS public.kviss_participants;
ALTER TABLE IF EXISTS public.kviss_sessions DROP CONSTRAINT IF EXISTS kviss_sessions_active_question_fk;
DROP TABLE IF EXISTS public.kviss_session_questions;
DROP TABLE IF EXISTS public.kviss_sessions;
COMMIT;
