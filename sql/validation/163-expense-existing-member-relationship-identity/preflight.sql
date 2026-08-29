BEGIN TRANSACTION READ ONLY;
WITH expected(signature,arg_names,volatility,source_hash) AS (VALUES
 ('public.expense_get_relationship_identity_management_v1(uuid,uuid)',ARRAY['p_actor_id','p_expense_id']::text[],'s'::char,'3ac32ce091028d0c73476c88c7fa208f'),
 ('public.expense_bind_member_relationship_identity_v1(uuid,uuid,uuid,uuid,uuid,bigint)',ARRAY['p_actor_id','p_request_id','p_expense_id','p_member_id','p_relationship_id','p_expected_financial_version']::text[],'v'::char,'257e4ad0dc53277b984272baadd8a3bf')
), target AS (
 SELECT expected.*,procedure.oid,procedure.proargnames,procedure.provolatile,procedure.prosecdef,procedure.proconfig,
  procedure.prorettype='pg_catalog.jsonb'::pg_catalog.regtype return_ok,
  pg_catalog.pg_get_userbyid(procedure.proowner) owner_name,language.lanname,
  pg_catalog.md5(pg_catalog.replace(procedure.prosrc,E'\r\n',E'\n')) actual_hash,
  pg_catalog.has_function_privilege('service_role',procedure.oid,'EXECUTE') service_execute,
  pg_catalog.has_function_privilege('anon',procedure.oid,'EXECUTE') anon_execute,
  pg_catalog.has_function_privilege('authenticated',procedure.oid,'EXECUTE') authenticated_execute
 FROM expected LEFT JOIN pg_catalog.pg_proc procedure ON procedure.oid=pg_catalog.to_regprocedure(expected.signature)
 LEFT JOIN pg_catalog.pg_language language ON language.oid=procedure.prolang
), contract AS (SELECT pg_catalog.bool_and(oid IS NOT NULL AND proargnames=arg_names AND provolatile=volatility
 AND prosecdef AND proconfig=ARRAY['search_path=""']::text[] AND return_ok AND owner_name='postgres' AND lanname='plpgsql'
 AND actual_hash=source_hash AND service_execute AND NOT anon_execute AND NOT authenticated_execute) exact_installed FROM target),
 prereq AS (SELECT current_user='postgres' AND session_user='postgres'
  AND pg_catalog.to_regprocedure('public.expense_apply_identity_binding(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid,boolean)') IS NOT NULL
  AND (SELECT pg_catalog.md5(pg_catalog.replace(prosrc,E'\r\n',E'\n'))='819b2e024aac1e00c7e14145b0d6b373' FROM pg_catalog.pg_proc WHERE oid='public.expense_apply_identity_binding(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid,boolean)'::pg_catalog.regprocedure)
  AND NOT pg_catalog.has_function_privilege('service_role','public.expense_apply_identity_binding(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid,boolean)','EXECUTE')
  AND pg_catalog.to_regclass('public.expense_claim_disputes') IS NOT NULL
  AND pg_catalog.to_regclass('public.teskeid_event_expense_participant_sources') IS NOT NULL
  AND pg_catalog.to_regclass('public.relationships') IS NOT NULL AS ok),
 counts AS (SELECT pg_catalog.count(*) FILTER(WHERE oid IS NOT NULL) installed_count FROM target)
SELECT prereq.ok AS prerequisites_ok,counts.installed_count=0 AS clean_initial_state,
 contract.exact_installed,contract.exact_installed AS lost_response_safe,
 prereq.ok AND (counts.installed_count=0 OR contract.exact_installed) AS operator_state_ok,
 counts.installed_count NOT IN(0,2) OR (counts.installed_count=2 AND NOT contract.exact_installed) AS partial_or_inconsistent_stop
FROM prereq,counts,contract;
ROLLBACK;
