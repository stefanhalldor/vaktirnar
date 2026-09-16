-- SQL189 read-only postflight. EXACT_INSTALLED and every boolean true required.
SET LOCAL search_path='';
WITH funcs AS (
 SELECT p.oid,n.nspname,p.proname,p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) owner,
   pg_get_functiondef(p.oid) definition
 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE p.oid IN ('public.receipt_split_read_v2(uuid,uuid)'::regprocedure,
   'public.receipt_split_set_exchange_v1(uuid,uuid,uuid,bigint,text,text)'::regprocedure)
), checks AS (
 SELECT bool_and(prosecdef AND proconfig=ARRAY['search_path=""'] AND owner='postgres'
     AND has_function_privilege('service_role',oid,'EXECUTE')
     AND NOT has_function_privilege('anon',oid,'EXECUTE')
     AND NOT has_function_privilege('authenticated',oid,'EXECUTE')) security_ok,
   bool_or(proname='receipt_split_read_v2' AND definition LIKE '%''exchangeCurrency'',s.exchange_currency,''exchangeRate'',s.exchange_rate::text%') projection_ok,
   bool_or(proname='receipt_split_set_exchange_v1' AND definition LIKE '%receipt_split.members%' AND definition LIKE '%s.version<>p_version%') member_version_ok
 FROM funcs
)
SELECT CASE WHEN security_ok AND projection_ok AND member_version_ok
    AND (SELECT count(*)=2 FROM pg_catalog.pg_attribute WHERE attrelid='receipt_split.splits'::regclass
      AND attname IN ('exchange_currency','exchange_rate') AND NOT attisdropped)
  THEN 'EXACT_INSTALLED' ELSE 'STOP' END operator_state,
  security_ok,projection_ok,member_version_ok,
  (SELECT count(*)=2 FROM pg_catalog.pg_attribute WHERE attrelid='receipt_split.splits'::regclass
    AND attname IN ('exchange_currency','exchange_rate') AND NOT attisdropped) columns_ok
FROM checks;
