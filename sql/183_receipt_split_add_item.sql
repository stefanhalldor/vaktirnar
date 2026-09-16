-- SQL183 MIGRATION: owner appends an unclaimed item to a shared split; existing claims remain.
-- Stebbi runs SQL only after the matching preflight is READY. Never reapply blindly.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL search_path='';
DO $guard$
DECLARE gate record;
BEGIN
  SELECT * INTO gate FROM (
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
  SELECT md5(string_agg(entry,E'\n' ORDER BY entry COLLATE "C")) AS value FROM entries
),
expected(signature,body_md5) AS (VALUES
    ('receipt_split.validate(jsonb)','4ef1cb6a6b75466a662d63f5d1ae1ab8'),
    ('receipt_split.assert_actor(uuid)','0a155ddfd376604688417250993e3cf6'),
    ('public.receipt_split_read_v1(uuid,uuid)','b9b48125a1232e74a65291ef917577a9'),
    ('public.receipt_split_command_v1(uuid,text,uuid,uuid,jsonb)','64366f49d716d83989038cd38ed68396')
), checks AS (
  SELECT
    (SELECT value FROM digest) = replace(obj_description(to_regnamespace('receipt_split'),'pg_namespace'),'SQL182:v1:','') AS seal_ok,
    (SELECT bool_and(p.oid IS NOT NULL AND md5(replace(p.prosrc,E'\r\n',E'\n'))=e.body_md5 AND pg_get_userbyid(p.proowner)='postgres' AND p.proconfig=ARRAY['search_path=""'])
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
SELECT CASE WHEN seal_ok AND functions_ok AND tables_ok AND no_client_policies AND boundary_ok AND schema_private AND bucket_ok AND storage_policy_ok AND current_user='postgres' AND NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='receipt_split_add_item_v1') THEN 'READY' ELSE 'STOP' END AS operator_state, checks.*, current_user='postgres' AS operator_ok, NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='receipt_split_add_item_v1') AS target_absent FROM checks
  ) readiness;
  IF gate.operator_state <> 'READY' THEN RAISE EXCEPTION 'SQL183 prerequisite mismatch; stop'; END IF;
END;
$guard$;
CREATE FUNCTION public.receipt_split_add_item_v1(p_actor_id uuid,p_request_id uuid,p_split_id uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE
  s receipt_split.splits%ROWTYPE; r receipt_split.requests%ROWTYPE;
  qty bigint; amount bigint; next_ordinal integer; result jsonb;
BEGIN
  PERFORM receipt_split.assert_actor(p_actor_id);
  IF p_request_id IS NULL OR p_split_id IS NULL OR p_payload IS NULL
    OR jsonb_typeof(p_payload) <> 'object'
    OR p_payload - ARRAY['description','quantity','amount'] <> '{}'::jsonb
    OR NOT (p_payload ?& ARRAY['description','quantity','amount'])
    OR jsonb_typeof(p_payload->'description') <> 'string'
    OR length(btrim(p_payload->>'description')) NOT BETWEEN 1 AND 200
    OR jsonb_typeof(p_payload->'quantity') <> 'number'
    OR coalesce(p_payload->>'quantity','') !~ '^[0-9]+$'
    OR (p_payload->>'quantity')::numeric NOT BETWEEN 1 AND 1000000
    OR jsonb_typeof(p_payload->'amount') <> 'number'
    OR coalesce(p_payload->>'amount','') !~ '^[0-9]+$'
    OR (p_payload->>'amount')::numeric NOT BETWEEN 1 AND 9007199254740991
  THEN RAISE EXCEPTION 'split_invalid'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor_id::text || p_request_id::text,0));
  SELECT * INTO r FROM receipt_split.requests WHERE actor_id=p_actor_id AND request_id=p_request_id;
  IF FOUND THEN
    IF r.command <> 'add_item' OR r.split_id IS DISTINCT FROM p_split_id
      OR r.payload_hash <> sha256(convert_to(p_payload::text,'UTF8'))
    THEN RAISE EXCEPTION 'split_conflict'; END IF;
    RETURN r.result;
  END IF;
  -- Same parent-row lock as claims/delete: additions cannot race the total or limit.
  SELECT * INTO s FROM receipt_split.splits WHERE id=p_split_id AND owner_id=p_actor_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'split_not_found'; END IF;
  IF s.state <> 'sharing' OR s.image_deleting
    OR NOT EXISTS (SELECT 1 FROM receipt_split.members WHERE split_id=s.id AND user_id=p_actor_id)
  THEN RAISE EXCEPTION 'split_conflict'; END IF;
  qty := (p_payload->>'quantity')::bigint;
  amount := (p_payload->>'amount')::bigint;
  IF s.total_minor::numeric + amount > 9007199254740991
    OR (SELECT coalesce(sum(total_minor),0) FROM receipt_split.items WHERE split_id=s.id) <> s.total_minor
  THEN RAISE EXCEPTION 'split_total_mismatch'; END IF;
  SELECT coalesce(max(ordinal),0)+1 INTO next_ordinal FROM receipt_split.items WHERE split_id=s.id;
  IF next_ordinal > 100 THEN RAISE EXCEPTION 'split_invalid'; END IF;
  INSERT INTO receipt_split.items(split_id,ordinal,kind,description,quantity_milli,total_minor)
    VALUES(s.id,next_ordinal,'item',btrim(p_payload->>'description'),qty,amount);
  -- Existing item IDs, amounts and all claim quantities are left intact.
  UPDATE receipt_split.splits SET total_minor=total_minor+amount,version=version+1 WHERE id=s.id;
  result := jsonb_build_object('id',s.id);
  INSERT INTO receipt_split.requests(actor_id,request_id,command,split_id,payload_hash,result)
    VALUES(p_actor_id,p_request_id,'add_item',s.id,sha256(convert_to(p_payload::text,'UTF8')),result);
  RETURN result;
END;
$fn$;
ALTER FUNCTION public.receipt_split_add_item_v1(uuid,uuid,uuid,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.receipt_split_add_item_v1(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.receipt_split_add_item_v1(uuid,uuid,uuid,jsonb) TO service_role;
COMMIT;
