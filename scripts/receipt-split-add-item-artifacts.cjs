// Generates SQL artifacts only. Never connects to or executes against a database.
const fs = require('node:fs')
const crypto = require('node:crypto')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const original = fs.readFileSync(path.join(root, 'sql/validation/182-standalone-receipt-splits/postflight.sql'), 'utf8')
const ctes = original.slice(original.indexOf('WITH entries AS'), original.lastIndexOf('\nSELECT CASE WHEN seal_ok'))
const base = 'seal_ok AND functions_ok AND tables_ok AND no_client_policies AND boundary_ok AND schema_private AND bucket_ok AND storage_policy_ok'
const absent = "NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='receipt_split_add_item_v1')"
const preflight = ctes + "\nSELECT CASE WHEN " + base + " AND current_user='postgres' AND " + absent + " THEN 'READY' ELSE 'STOP' END AS operator_state, checks.*, current_user='postgres' AS operator_ok, " + absent + ' AS target_absent FROM checks;\n'
const body = `
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
`
const signature = 'public.receipt_split_add_item_v1(uuid,uuid,uuid,jsonb)'
const bodyHash = crypto.createHash('md5').update(body).digest('hex')
const migration = `-- SQL183 MIGRATION: owner appends an unclaimed item to a shared split; existing claims remain.
-- Stebbi runs SQL only after the matching preflight is READY. Never reapply blindly.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL search_path='';
DO $guard$
DECLARE gate record;
BEGIN
  SELECT * INTO gate FROM (
${preflight.trim().replace(/;$/, '')}
  ) readiness;
  IF gate.operator_state <> 'READY' THEN RAISE EXCEPTION 'SQL183 prerequisite mismatch; stop'; END IF;
END;
$guard$;
CREATE FUNCTION public.receipt_split_add_item_v1(p_actor_id uuid,p_request_id uuid,p_split_id uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$${body}$fn$;
ALTER FUNCTION ${signature} OWNER TO postgres;
REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION ${signature} TO service_role;
COMMIT;
`
const postflight = ctes + `,
addition AS (
  SELECT count(*)=1 AND coalesce(bool_and(
    p.oid=to_regprocedure('${signature}')
    AND md5(replace(p.prosrc,E'\\r\\n',E'\\n'))='${bodyHash}'
    AND p.prosecdef AND p.provolatile='v'
    AND pg_get_userbyid(p.proowner)='postgres'
    AND p.proconfig=ARRAY['search_path=""']
    AND has_function_privilege('service_role',p.oid,'EXECUTE')
    AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
    AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
    AND NOT EXISTS (
      SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      WHERE a.grantee NOT IN (p.proowner,(SELECT oid FROM pg_roles WHERE rolname='service_role'))
    )
  ),false) AS addition_ok
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='receipt_split_add_item_v1'
)
SELECT CASE WHEN ${base} AND addition_ok THEN 'EXACT_INSTALLED' ELSE 'STOP' END AS operator_state,
checks.*, addition.* FROM checks CROSS JOIN addition;
`
const directory = path.join(root, 'sql/validation/183-receipt-split-add-item')
fs.mkdirSync(directory, { recursive: true })
fs.writeFileSync(path.join(directory, 'preflight.sql'), '-- SQL183 PREFLIGHT: catalog-only SQL182 seal and absent new RPC. Stebbi runs SQL.\nSET search_path=pg_catalog;\n' + preflight)
fs.writeFileSync(path.join(directory, 'postflight.sql'), '-- SQL183 POSTFLIGHT: catalog-only unchanged SQL182 seal plus exact new RPC and grants.\nSET search_path=pg_catalog;\n' + postflight)
fs.writeFileSync(path.join(root, 'sql/183_receipt_split_add_item.sql'), migration)
console.log('Generated SQL183 artifacts without database access; function body MD5 ' + bodyHash)
