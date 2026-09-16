-- SQL182 PREFLIGHT: catalog-only readiness for an independent receipt-split schema.
-- No application rows, secrets, account names, emails or invite tokens are read.
WITH required_columns(relation_name,column_name,type_name) AS (
  VALUES
    ('auth.users','id','uuid'),('auth.users','email','text'),
    ('auth.users','email_confirmed_at','timestamp with time zone'),
    ('auth.users','deleted_at','timestamp with time zone'),
    ('auth.users','banned_until','timestamp with time zone'),
    ('public.profiles','id','uuid'),('public.profiles','display_name','text')
), column_checks AS (
  SELECT r.*, EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute a
    WHERE a.attrelid=pg_catalog.to_regclass(r.relation_name)
      AND a.attname=r.column_name AND a.attnum>0 AND NOT a.attisdropped
      AND (pg_catalog.format_type(a.atttypid,a.atttypmod)=r.type_name
        OR (r.type_name='text' AND a.atttypid IN ('text'::regtype,'varchar'::regtype)))
  ) AS ok FROM required_columns r
), gates AS (
  SELECT
    current_user='postgres' AS operator_ok,
    (SELECT bool_and(ok) FROM column_checks) AS columns_ok,
    (SELECT count(*)=4 FROM pg_catalog.pg_roles WHERE rolname IN ('postgres','anon','authenticated','service_role')) AS roles_ok,
    EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='postgres' AND rolbypassrls) AS definer_ok,
    pg_catalog.to_regprocedure('pg_catalog.gen_random_uuid()') IS NOT NULL
      AND pg_catalog.to_regprocedure('pg_catalog.sha256(bytea)') IS NOT NULL
      AND pg_catalog.to_regprocedure('pg_catalog.hashtextextended(text,bigint)') IS NOT NULL AS primitives_ok,
    EXISTS(SELECT 1 FROM pg_catalog.pg_class WHERE oid=pg_catalog.to_regclass('storage.objects') AND relrowsecurity) AS storage_rls_ok,
    pg_catalog.to_regnamespace('receipt_split') IS NULL
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname IN ('receipt_split_read_v1','receipt_split_command_v1'))
      AND NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='bill-split-receipts')
      AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid=pg_catalog.to_regclass('storage.objects') AND polname='receipt_split_private_bucket') AS targets_absent
)
SELECT CASE WHEN operator_ok AND columns_ok AND roles_ok AND definer_ok AND primitives_ok AND storage_rls_ok AND targets_absent
  THEN 'READY' ELSE 'STOP' END AS operator_state,
  gates.*,
  (SELECT coalesce(jsonb_agg(jsonb_build_object('relation',relation_name,'column',column_name,'expected_type',type_name)) FILTER (WHERE NOT ok),'[]'::jsonb) FROM column_checks) AS missing_columns
FROM gates;
