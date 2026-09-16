-- SQL184 POSTFLIGHT: read-only exact v2 body/ACL/catalog seal. Stebbi runs SQL.
SET search_path=pg_catalog;
WITH entries AS (
  SELECT 'namespace:' || n.nspname || ':' || pg_get_userbyid(n.nspowner) || ':' || coalesce(n.nspacl::text,'') AS entry
  FROM pg_namespace n WHERE n.nspname='receipt_split'
  UNION ALL
  SELECT 'relation:' || c.relname || ':' || c.relkind::text || ':' || c.relrowsecurity::text || ':' || c.relforcerowsecurity::text || ':' || pg_get_userbyid(c.relowner) || ':' || coalesce(c.relacl::text,'')
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='receipt_split'
  UNION ALL
  SELECT 'attribute:' || c.relname || ':' || a.attnum::text || ':' || a.attname || ':' || format_type(a.atttypid,a.atttypmod) || ':' || a.attnotnull::text || ':' || a.attisdropped::text || ':' || coalesce(pg_get_expr(d.adbin,d.adrelid),'')
  FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
  WHERE n.nspname='receipt_split' AND a.attnum>0
  UNION ALL
  SELECT 'constraint:' || c.relname || ':' || con.conname || ':' || pg_get_constraintdef(con.oid,true)
  FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='receipt_split'
  UNION ALL
  SELECT 'index:' || pg_get_indexdef(i.indexrelid)
  FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='receipt_split'
  UNION ALL
  SELECT 'function:' || pg_get_functiondef(p.oid) || ':' || pg_get_userbyid(p.proowner) || ':' || coalesce(p.proacl::text,'')
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='receipt_split' OR (n.nspname='public' AND p.proname IN ('receipt_split_read_v1','receipt_split_command_v1','receipt_split_add_item_v1','receipt_split_read_v2','receipt_split_command_v2'))
  UNION ALL
  SELECT 'policy:' || p.polname || ':' || p.polpermissive::text || ':' || p.polcmd::text || ':' || p.polroles::text || ':' || coalesce(pg_get_expr(p.polqual,p.polrelid),'') || ':' || coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'')
  FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='receipt_split' OR (n.nspname='storage' AND c.relname='objects' AND p.polname='receipt_split_private_bucket')
  UNION ALL
  SELECT 'trigger:' || pg_get_triggerdef(t.oid,true)
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='receipt_split' AND NOT t.tgisinternal
  UNION ALL
  SELECT 'bucket:' || id || ':' || name || ':' || public::text || ':' || coalesce(file_size_limit::text,'') || ':' || coalesce(allowed_mime_types::text,'')
  FROM storage.buckets WHERE id='bill-split-receipts'
), digest AS (
  SELECT md5(string_agg(entry,E'\n' ORDER BY entry COLLATE "C")) AS value FROM entries
), expected(signature,body_md5,is_definer,volatility,is_public) AS (VALUES ('receipt_split.validate(jsonb)','4ef1cb6a6b75466a662d63f5d1ae1ab8',false,'v',false),
('receipt_split.assert_actor(uuid)','0a155ddfd376604688417250993e3cf6',false,'v',false),
('receipt_split.read_legacy_v1(uuid,uuid)','b9b48125a1232e74a65291ef917577a9',true,'s',false),
('receipt_split.command_legacy_v1(uuid,text,uuid,uuid,jsonb)','64366f49d716d83989038cd38ed68396',true,'v',false),
('receipt_split.add_legacy_v1(uuid,uuid,uuid,jsonb)','147485b03a6061c3d0a0cf714abc69bd',true,'v',false),
('receipt_split.guard_legacy_v1(uuid,uuid,uuid,text,jsonb)','2cd170ba22694d4e023ab7a4c5332ff9',false,'v',false),
('public.receipt_split_read_v1(uuid,uuid)','ab545568c05674506b3810f544c23f41',true,'s',true),
('public.receipt_split_command_v1(uuid,text,uuid,uuid,jsonb)','3539ee4b848928b4276197045d76c7b4',true,'v',true),
('public.receipt_split_add_item_v1(uuid,uuid,uuid,jsonb)','b5a22725c4abdbd4f7dd859b69c368ca',true,'v',true),
('receipt_split.validate_v2(jsonb)','3de8d61d7b8d873e5916bed3e0d68f20',false,'v',false),
('public.receipt_split_read_v2(uuid,uuid)','d514854023df411f59cd3731c2502769',true,'s',true),
('receipt_split.validate_item_edit_v2(jsonb,text)','22ffe16d71ec8f942b1b5b88d8791758',false,'v',false),
('receipt_split.validate_command_v2(text,jsonb)','b4cb3ebcc0d568bb4072922883096a59',false,'v',false),
('public.receipt_split_command_v2(uuid,text,uuid,uuid,jsonb)','e369944399d7cdd4219460244e7a3dfa',true,'v',true)), checks AS (
 SELECT
 (SELECT value FROM digest)=replace(obj_description(to_regnamespace('receipt_split'),'pg_namespace'),'SQL184:v2:','') AS seal_ok,
 (SELECT bool_and(p.oid IS NOT NULL AND md5(replace(p.prosrc,E'\r\n',E'\n'))=e.body_md5
 AND p.prosecdef=e.is_definer AND p.provolatile::text=e.volatility AND pg_get_userbyid(p.proowner)='postgres' AND p.proconfig=ARRAY['search_path=""']
 AND has_function_privilege('service_role',p.oid,'EXECUTE')=e.is_public
 AND NOT has_function_privilege('anon',p.oid,'EXECUTE') AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
 AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   WHERE a.grantee<>p.proowner AND (NOT e.is_public OR a.grantee<>(SELECT oid FROM pg_roles WHERE rolname='service_role'))))
 FROM expected e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature)) AS functions_ok,
 (SELECT count(*)=5 AND bool_and(relrowsecurity AND relforcerowsecurity AND pg_get_userbyid(relowner)='postgres') FROM pg_class WHERE relnamespace=to_regnamespace('receipt_split') AND relkind='r') AS tables_ok,
 NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid IN(SELECT oid FROM pg_class WHERE relnamespace=to_regnamespace('receipt_split'))) AS no_client_policies,
 NOT EXISTS(SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a WHERE n.nspname='receipt_split' AND a.grantee<>n.nspowner) AS schema_private,
 NOT EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE c.relnamespace=to_regnamespace('receipt_split') AND c.relkind='r' AND a.grantee<>c.relowner) AS tables_private,
 EXISTS(SELECT 1 FROM storage.buckets WHERE id='bill-split-receipts' AND NOT public AND file_size_limit=10485760 AND allowed_mime_types=ARRAY['image/jpeg','image/png','image/webp']) AS bucket_ok
)
SELECT CASE WHEN seal_ok AND functions_ok AND tables_ok AND no_client_policies AND schema_private AND tables_private AND bucket_ok THEN 'EXACT_INSTALLED' ELSE 'STOP' END AS operator_state, checks.* FROM checks;
