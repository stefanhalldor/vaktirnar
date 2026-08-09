-- DESTRUCTIVE and intentionally NOT RUN. Only for an approved empty-beta rollback.
BEGIN;
DROP FUNCTION IF EXISTS public.kviss_archive_question(uuid,uuid,uuid,integer);
DROP FUNCTION IF EXISTS public.kviss_save_template(uuid,uuid,uuid,integer,text,text[],jsonb);
DROP FUNCTION IF EXISTS public.kviss_upsert_question(uuid,uuid,uuid,integer,text,jsonb,integer[],integer,integer,boolean,text[],integer);
DROP FUNCTION IF EXISTS public.kviss_assert_author(uuid,uuid);
DROP TABLE IF EXISTS public.kviss_template_questions;
DROP TABLE IF EXISTS public.kviss_templates;
DROP TABLE IF EXISTS public.kviss_questions;
-- The dynamic feature-key union is deliberately not narrowed here.
COMMIT;
