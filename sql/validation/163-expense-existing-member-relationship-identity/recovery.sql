BEGIN;
-- After verified app rollback and separate approval, operator must uncomment:
-- SET LOCAL teskeid.sql163_app_rollback_confirmed = 'yes';
DO $recovery$
DECLARE row record;
BEGIN
 IF current_user<>'postgres' OR session_user<>'postgres'
   OR pg_catalog.current_setting('teskeid.sql163_app_rollback_confirmed',true) IS DISTINCT FROM 'yes'
 THEN RAISE EXCEPTION 'expense_sql163_recovery_not_authorized'; END IF;
 FOR row IN SELECT * FROM (VALUES
  ('public.expense_get_relationship_identity_management_v1(uuid,uuid)','3ac32ce091028d0c73476c88c7fa208f'),
  ('public.expense_bind_member_relationship_identity_v1(uuid,uuid,uuid,uuid,uuid,bigint)','257e4ad0dc53277b984272baadd8a3bf')
 ) expected(signature,source_hash) LOOP
  IF pg_catalog.to_regprocedure(row.signature) IS NULL OR NOT EXISTS(
   SELECT 1 FROM pg_catalog.pg_proc procedure WHERE procedure.oid=pg_catalog.to_regprocedure(row.signature)
    AND pg_catalog.pg_get_userbyid(procedure.proowner)='postgres' AND procedure.prosecdef
    AND procedure.proconfig=ARRAY['search_path=""']::text[]
    AND pg_catalog.md5(pg_catalog.replace(procedure.prosrc,E'\r\n',E'\n'))=row.source_hash
    AND pg_catalog.has_function_privilege('service_role',procedure.oid,'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('anon',procedure.oid,'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('authenticated',procedure.oid,'EXECUTE'))
  THEN RAISE EXCEPTION 'expense_sql163_recovery_target_mismatch:%',row.signature; END IF;
 END LOOP;
END;
$recovery$;
REVOKE EXECUTE ON FUNCTION public.expense_get_relationship_identity_management_v1(uuid,uuid) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.expense_bind_member_relationship_identity_v1(uuid,uuid,uuid,uuid,uuid,bigint) FROM service_role;
DO $verify$
BEGIN
 IF pg_catalog.has_function_privilege('service_role','public.expense_get_relationship_identity_management_v1(uuid,uuid)','EXECUTE')
 OR pg_catalog.has_function_privilege('service_role','public.expense_bind_member_relationship_identity_v1(uuid,uuid,uuid,uuid,uuid,bigint)','EXECUTE')
 THEN RAISE EXCEPTION 'expense_sql163_recovery_revoke_failed'; END IF;
END;
$verify$;
-- No data mutation and no automatic DROP. A later drop needs separate approval.
COMMIT;
