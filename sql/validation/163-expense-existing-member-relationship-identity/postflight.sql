BEGIN TRANSACTION READ ONLY;
WITH expected(signature,arg_names,volatility,source_hash) AS (VALUES
 ('public.expense_get_relationship_identity_management_v1(uuid,uuid)',ARRAY['p_actor_id','p_expense_id']::text[],'s'::char,'3ac32ce091028d0c73476c88c7fa208f'),
 ('public.expense_bind_member_relationship_identity_v1(uuid,uuid,uuid,uuid,uuid,bigint)',ARRAY['p_actor_id','p_request_id','p_expense_id','p_member_id','p_relationship_id','p_expected_financial_version']::text[],'v'::char,'257e4ad0dc53277b984272baadd8a3bf')
), checks AS (SELECT expected.signature,procedure.oid IS NOT NULL target_exists,
 procedure.proargnames=expected.arg_names arg_names_ok,procedure.provolatile=expected.volatility volatility_ok,
 procedure.prorettype='pg_catalog.jsonb'::pg_catalog.regtype return_ok,procedure.prosecdef security_definer_ok,
 procedure.proconfig=ARRAY['search_path=""']::text[] search_path_ok,
 pg_catalog.pg_get_userbyid(procedure.proowner)='postgres' owner_ok,language.lanname='plpgsql' language_ok,
 pg_catalog.md5(pg_catalog.replace(procedure.prosrc,E'\r\n',E'\n'))=expected.source_hash source_hash_ok,
 pg_catalog.has_function_privilege('service_role',procedure.oid,'EXECUTE') service_execute_ok,
 NOT pg_catalog.has_function_privilege('anon',procedure.oid,'EXECUTE') anon_revoked_ok,
 NOT pg_catalog.has_function_privilege('authenticated',procedure.oid,'EXECUTE') authenticated_revoked_ok
 FROM expected LEFT JOIN pg_catalog.pg_proc procedure ON procedure.oid=pg_catalog.to_regprocedure(expected.signature)
 LEFT JOIN pg_catalog.pg_language language ON language.oid=procedure.prolang), final AS (
 SELECT pg_catalog.bool_and(target_exists AND arg_names_ok AND volatility_ok AND return_ok AND security_definer_ok
  AND search_path_ok AND owner_ok AND language_ok AND source_hash_ok AND service_execute_ok
  AND anon_revoked_ok AND authenticated_revoked_ok) targets_ok FROM checks)
SELECT checks.*,final.targets_ok
 AND NOT pg_catalog.has_function_privilege('service_role','public.expense_apply_identity_binding(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid,boolean)','EXECUTE')
 AND current_user='postgres' AND session_user='postgres' AS postconditions_ok
FROM checks CROSS JOIN final ORDER BY checks.signature;
ROLLBACK;
