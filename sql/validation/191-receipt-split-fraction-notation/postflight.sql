-- SQL191 POSTFLIGHT: verify exact fraction-notation installation.
SET LOCAL search_path='';
WITH funcs AS (SELECT p.oid,p.proname,p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) owner,pg_get_functiondef(p.oid) definition
 FROM pg_catalog.pg_proc p WHERE p.oid IN ('public.receipt_split_read_v2(uuid,uuid)'::regprocedure,'public.receipt_split_command_v2(uuid,text,uuid,uuid,jsonb)'::regprocedure)), checks AS (
 SELECT bool_and(prosecdef AND proconfig=ARRAY['search_path=""'] AND owner='postgres' AND has_function_privilege('service_role',oid,'EXECUTE') AND NOT has_function_privilege('anon',oid,'EXECUTE') AND NOT has_function_privilege('authenticated',oid,'EXECUTE')) security_ok,
 bool_or(proname='receipt_split_read_v2' AND definition LIKE '%''fractionNumerator'',c.fraction_numerator,''fractionDenominator'',c.fraction_denominator%') projection_ok,
 bool_or(proname='receipt_split_command_v2' AND definition LIKE '%fraction_numerator=EXCLUDED.fraction_numerator%' AND definition LIKE '%i.quantity_units*fraction_numerator + fraction_denominator/2%') command_ok FROM funcs)
SELECT CASE WHEN security_ok AND projection_ok AND command_ok
 AND (SELECT count(*)=2 FROM pg_catalog.pg_attribute WHERE attrelid='receipt_split.claims'::regclass AND attname IN ('fraction_numerator','fraction_denominator') AND NOT attisdropped)
 AND EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='receipt_split.claims'::regclass AND conname='claims_fraction_notation_chk')
 THEN 'EXACT_INSTALLED' ELSE 'STOP' END operator_state,security_ok,projection_ok,command_ok,
 (SELECT count(*)=2 FROM pg_catalog.pg_attribute WHERE attrelid='receipt_split.claims'::regclass AND attname IN ('fraction_numerator','fraction_denominator') AND NOT attisdropped) columns_ok,
 EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='receipt_split.claims'::regclass AND conname='claims_fraction_notation_chk') constraint_ok FROM checks;
