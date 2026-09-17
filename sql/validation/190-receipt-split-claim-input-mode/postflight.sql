-- SQL190 POSTFLIGHT: verify exact claim input-mode installation.
SET LOCAL search_path='';
WITH funcs AS (
 SELECT p.oid,n.nspname,p.proname,p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) owner,
   pg_get_functiondef(p.oid) definition
 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE p.oid IN ('public.receipt_split_read_v2(uuid,uuid)'::regprocedure,
   'public.receipt_split_command_v2(uuid,text,uuid,uuid,jsonb)'::regprocedure)
), checks AS (
 SELECT bool_and(prosecdef AND proconfig=ARRAY['search_path=""'] AND owner='postgres'
     AND has_function_privilege('service_role',oid,'EXECUTE')
     AND NOT has_function_privilege('anon',oid,'EXECUTE')
     AND NOT has_function_privilege('authenticated',oid,'EXECUTE')) security_ok,
   bool_or(proname='receipt_split_read_v2' AND definition LIKE '%''inputMode'',c.input_mode%') projection_ok,
   bool_or(proname='receipt_split_command_v2' AND definition LIKE '%input_mode=EXCLUDED.input_mode%'
     AND definition LIKE '%input_mode := p_payload->>''inputMode''%') command_ok
 FROM funcs
)
SELECT CASE WHEN security_ok AND projection_ok AND command_ok
    AND EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='receipt_split.claims'::regclass
      AND attname='input_mode' AND NOT attisdropped AND attnotnull)
    AND EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='receipt_split.claims'::regclass
      AND conname='claims_input_mode_chk')
  THEN 'EXACT_INSTALLED' ELSE 'STOP' END operator_state,
  security_ok,projection_ok,command_ok,
  EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='receipt_split.claims'::regclass
    AND attname='input_mode' AND NOT attisdropped AND attnotnull) column_ok,
  EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='receipt_split.claims'::regclass
    AND conname='claims_input_mode_chk') constraint_ok
FROM checks;
