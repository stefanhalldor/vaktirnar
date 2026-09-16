"""Generate SQL182 catalog seal and postflight, without executing SQL.

The catalog seal covers objects created by SQL182 only. It is captured after
DDL in the guarded transaction and checked against current catalogs later.
Function bodies are additionally pinned to the reviewed source in postflight.
"""
from pathlib import Path
import hashlib
import re

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / 'sql/182_standalone_receipt_splits.sql'
POST = ROOT / 'sql/validation/182-standalone-receipt-splits/postflight.sql'
START = '-- BEGIN GENERATED SQL182 SEAL'
END = '-- END GENERATED SQL182 SEAL'

CATALOG = """
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
  WHERE n.nspname='receipt_split' OR (n.nspname='public' AND p.proname IN ('receipt_split_read_v1','receipt_split_command_v1'))
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
  SELECT md5(string_agg(entry,E'\\n' ORDER BY entry COLLATE "C")) AS value FROM entries
)
"""

def main():
    source = MIGRATION.read_text(encoding='utf-8')
    preflight = (POST.parent / 'preflight.sql').read_text(encoding='utf-8')
    query = preflight[preflight.index('WITH required_columns'):].replace('FROM gates;', 'INTO readiness FROM gates;')
    guard = """DO $guard$
DECLARE readiness record;
BEGIN
""" + query + """
  IF readiness.operator_state <> 'READY' THEN
    RAISE EXCEPTION 'sql182_preflight_not_ready';
  END IF;
END;
$guard$;"""
    source = re.sub(r'DO \$guard\$.*?\$guard\$;', lambda _: guard, source, count=1, flags=re.S)
    seal = START + """
DO $seal$
DECLARE fingerprint text;
BEGIN
""" + CATALOG + """
  SELECT value INTO fingerprint FROM digest;
  EXECUTE format('COMMENT ON SCHEMA receipt_split IS %L','SQL182:v1:' || fingerprint);
END;
$seal$;
""" + END
    if START in source:
        source = source[:source.index(START)] + seal + source[source.index(END)+len(END):]
    else:
        source = source.replace("COMMENT ON SCHEMA receipt_split IS 'SQL182 standalone receipt split v1';", seal)
    MIGRATION.write_text(source, encoding='utf-8', newline='\n')
    signatures = {
        'receipt_split.validate': 'receipt_split.validate(jsonb)',
        'receipt_split.assert_actor': 'receipt_split.assert_actor(uuid)',
        'public.receipt_split_read_v1': 'public.receipt_split_read_v1(uuid,uuid)',
        'public.receipt_split_command_v1': 'public.receipt_split_command_v1(uuid,text,uuid,uuid,jsonb)',
    }
    rows = []
    for name, signature in signatures.items():
        match = re.search(r'CREATE FUNCTION ' + re.escape(name) + r'\(.*?AS \$fn\$(.*?)\$fn\$;', source, re.S)
        if not match:
            raise RuntimeError('Missing function ' + name)
        digest = hashlib.md5(match.group(1).encode()).hexdigest()
        rows.append("    ('" + signature + "','" + digest + "')")
    post = """-- SQL182 POSTFLIGHT: catalog-only seal, exact function bodies and access boundaries.
-- Run only after reviewed apply. Does not read application rows or execute feature RPCs.
SET search_path = pg_catalog;
""" + CATALOG.rstrip() + """,
expected(signature,body_md5) AS (VALUES
""" + ',\n'.join(rows) + """
), checks AS (
  SELECT
    (SELECT value FROM digest) = replace(obj_description(to_regnamespace('receipt_split'),'pg_namespace'),'SQL182:v1:','') AS seal_ok,
    (SELECT bool_and(p.oid IS NOT NULL AND md5(replace(p.prosrc,E'\\r\\n',E'\\n'))=e.body_md5 AND pg_get_userbyid(p.proowner)='postgres' AND p.proconfig=ARRAY['search_path=""'])
      FROM expected e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature)) AS functions_ok,
    (SELECT count(*)=5 AND bool_and(c.relrowsecurity AND c.relforcerowsecurity AND pg_get_userbyid(c.relowner)='postgres')
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='receipt_split' AND c.relkind='r') AS tables_ok,
    NOT EXISTS(SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='receipt_split') AS no_client_policies,
    (SELECT count(*)=2 AND bool_and(p.prosecdef AND has_function_privilege('service_role',p.oid,'EXECUTE')
      AND NOT has_function_privilege('anon',p.oid,'EXECUTE') AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE'))
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname IN ('receipt_split_read_v1','receipt_split_command_v1')) AS boundary_ok,
    NOT EXISTS(SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a WHERE n.nspname='receipt_split' AND a.grantee<>n.nspowner) AS schema_private,
    EXISTS(SELECT 1 FROM storage.buckets WHERE id='bill-split-receipts' AND NOT public AND file_size_limit=10485760 AND allowed_mime_types=ARRAY['image/jpeg','image/png','image/webp']) AS bucket_ok,
    EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=to_regclass('storage.objects') AND polname='receipt_split_private_bucket' AND NOT polpermissive AND polcmd='*') AS storage_policy_ok
)
SELECT CASE WHEN seal_ok AND functions_ok AND tables_ok AND no_client_policies AND boundary_ok AND schema_private AND bucket_ok AND storage_policy_ok
  THEN 'EXACT_INSTALLED' ELSE 'STOP' END AS operator_state,checks.* FROM checks;
"""
    POST.write_text(post, encoding='utf-8', newline='\n')
    print('Generated SQL182 seal and exact-body postflight. No SQL executed.')

if __name__ == '__main__':
    main()
