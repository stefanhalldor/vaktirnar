// Artifact generation only. No database connection or SQL execution.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const root = path.resolve(__dirname, '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n')
const source = read('sql/182_standalone_receipt_splits.sql')
const addSource = read('sql/183_receipt_split_add_item.sql')
const extract = (sql, name) => {
  const start = sql.indexOf('CREATE FUNCTION ' + name + '(')
  if (start < 0) throw new Error('missing function ' + name)
  const end = sql.indexOf('$fn$;', start) + 5
  return sql.slice(start, end)
}
const replaceOnce = (text, from, to) => {
  if (!text.includes(from) || text.indexOf(from) !== text.lastIndexOf(from)) throw new Error('non-unique replacement ' + from)
  return text.replace(from, () => to)
}
const originalRead = extract(source, 'public.receipt_split_read_v1')
const originalCommand = extract(source, 'public.receipt_split_command_v1')
const originalAdd = extract(addSource, 'public.receipt_split_add_item_v1')
const originals = [extract(source, 'receipt_split.validate'), extract(source, 'receipt_split.assert_actor')]
const functions = []
functions.push(originalRead.replace('public.receipt_split_read_v1(', 'receipt_split.read_legacy_v1('))
functions.push(originalCommand.replace('public.receipt_split_command_v1(', 'receipt_split.command_legacy_v1('))
functions.push(originalAdd.replace('public.receipt_split_add_item_v1(', 'receipt_split.add_legacy_v1('))

// The request lock must always precede the parent lock, including legacy calls.
functions.push(`CREATE FUNCTION receipt_split.guard_legacy_v1(p_actor uuid,p_request uuid,p_id uuid,p_command text,p_payload jsonb)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $fn$
DECLARE v integer;
BEGIN
  PERFORM receipt_split.assert_actor(p_actor);
  IF p_request IS NULL THEN RAISE EXCEPTION 'split_invalid'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text || p_request::text,0));
  IF p_command='join' THEN
    SELECT contract_version INTO v FROM receipt_split.splits
      WHERE invite_token=p_payload->>'token' AND state='sharing' AND invite_expires_at>now() FOR UPDATE;
  ELSE
    SELECT contract_version INTO v FROM receipt_split.splits s WHERE id=p_id
      AND (s.owner_id=p_actor OR EXISTS(SELECT 1 FROM receipt_split.members m WHERE m.split_id=s.id AND m.user_id=p_actor)) FOR UPDATE;
  END IF;
  IF v=2 THEN RAISE EXCEPTION 'split_upgrade_required'; END IF;
END;
$fn$;`)
functions.push(`CREATE OR REPLACE FUNCTION public.receipt_split_read_v1(p_actor_id uuid,p_split_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
  PERFORM receipt_split.assert_actor(p_actor_id);
  IF EXISTS(SELECT 1 FROM receipt_split.splits s JOIN receipt_split.members m ON m.split_id=s.id
    WHERE s.id=p_split_id AND m.user_id=p_actor_id AND s.contract_version=2) THEN
    RAISE EXCEPTION 'split_upgrade_required';
  END IF;
  RETURN receipt_split.read_legacy_v1(p_actor_id,p_split_id);
END;
$fn$;`)
functions.push(`CREATE OR REPLACE FUNCTION public.receipt_split_command_v1(p_actor_id uuid,p_command text,p_request_id uuid,p_split_id uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
  PERFORM receipt_split.guard_legacy_v1(p_actor_id,p_request_id,p_split_id,p_command,p_payload);
  RETURN receipt_split.command_legacy_v1(p_actor_id,p_command,p_request_id,p_split_id,p_payload);
END;
$fn$;`)
functions.push(`CREATE OR REPLACE FUNCTION public.receipt_split_add_item_v1(p_actor_id uuid,p_request_id uuid,p_split_id uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
  PERFORM receipt_split.guard_legacy_v1(p_actor_id,p_request_id,p_split_id,'add_item',p_payload);
  RETURN receipt_split.add_legacy_v1(p_actor_id,p_request_id,p_split_id,p_payload);
END;
$fn$;`)

let validator = extract(source, 'receipt_split.validate')
  .replace('receipt_split.validate(', 'receipt_split.validate_v2(')
  .replaceAll('quantity_milli', 'quantity_units').replaceAll('1000000', '3000000')
  .replace("::numeric <> 1000)", "::numeric <> 3000)")
validator = replaceOnce(validator, "p - ARRAY['title'", "p - ARRAY['contract_version','quantity_scale','title'")
validator = replaceOnce(validator, "NOT (p ?& ARRAY['title'", "NOT (p ?& ARRAY['contract_version','quantity_scale','title'")
validator = replaceOnce(validator, "OR jsonb_typeof(p->'title')", "OR p->'contract_version' IS DISTINCT FROM '2'::jsonb\n    OR p->'quantity_scale' IS DISTINCT FROM '3000'::jsonb\n    OR jsonb_typeof(p->'title')")
validator = replaceOnce(validator, "i - ARRAY['kind'", "i - ARRAY['explanation','explanation_needs_review','kind'")
validator = replaceOnce(validator, "OR jsonb_typeof(i->'needs_review') <> 'boolean'", "OR jsonb_typeof(i->'needs_review') <> 'boolean'\n      OR (i ? 'explanation' AND (jsonb_typeof(i->'explanation') <> 'string' OR length(i->>'explanation')>240))\n      OR (i ? 'explanation_needs_review' AND jsonb_typeof(i->'explanation_needs_review') <> 'boolean')")
functions.push(validator)

let readV2 = originalRead.replace('public.receipt_split_read_v1(', 'public.receipt_split_read_v2(')
readV2 = replaceOnce(readV2, "'id',s.id,'state'", "'contractVersion',2,'quantityScale',3000,'sourceContractVersion',s.contract_version,\n    'id',s.id,'state'")
readV2 = readV2.replace("'totalMinor',s.total_minor", "'receiptTotalMinor',s.total_minor")
readV2 = readV2.replace("'quantityMilli',i.quantity_milli", "'quantityUnits',coalesce(i.quantity_units,i.quantity_milli*3),\n        'itemRevision',i.item_revision,'originalDescription',coalesce(i.original_description,i.description),\n        'explanation',i.explanation,'explanationNeedsReview',i.explanation_needs_review")
readV2 = readV2.replace("'quantityMilli',c.quantity_milli", "'quantityUnits',coalesce(c.quantity_units,c.quantity_milli*3)")
functions.push(readV2)

// Build v2 lifecycle from the reviewed v1 implementation. Unknown source drift fails generation.
let command = originalCommand.replace('public.receipt_split_command_v1(', 'public.receipt_split_command_v2(')
  .replaceAll('receipt_split.validate(', 'receipt_split.validate_v2(')
  .replaceAll('quantity_milli', 'quantity_units').replaceAll('1000000', '3000000')
command = replaceOnce(command, "OR p_command IS NULL OR p_command NOT IN (", "OR p_payload->'contractVersion' IS DISTINCT FROM '2'::jsonb\n    OR p_payload->'quantityScale' IS DISTINCT FROM '3000'::jsonb\n    OR p_command IS NULL OR p_command NOT IN (")
command = replaceOnce(command, "'rotate_invite','join','claim','delete','image_target','delete_image','complete_delete'", "'rotate_invite','join','claim','delete','image_target','delete_image','complete_delete',\n      'edit_item','add_item','receipt_total','save_review'")
command = replaceOnce(command, "  -- Serialize retries before checking the request ledger.", `  PERFORM receipt_split.validate_command_v2(p_command,p_payload);
  -- Serialize retries before checking the request ledger.`)
command = command.replaceAll("p_payload->>'quantity'", "p_payload->>'quantityUnits'")
  .replaceAll("p_payload->>'previous'", "p_payload->>'previousUnits'")
command = command.replace("IF r.command <> p_command OR", "IF r.command <> 'v2:' || p_command OR")
command = replaceOnce(command, "INSERT INTO receipt_split.splits(id,owner_id,state) VALUES(p_split_id,p_actor_id,'review');", "INSERT INTO receipt_split.splits(id,owner_id,state,contract_version) VALUES(p_split_id,p_actor_id,'review',2);")
command = replaceOnce(command, "INSERT INTO receipt_split.splits(id,owner_id,state,image_path,image_mime,image_size)", "INSERT INTO receipt_split.splits(id,owner_id,state,image_path,image_mime,image_size,contract_version)")
command = replaceOnce(command, "p_payload->>'mime',(p_payload->>'size')::integer);", "p_payload->>'mime',(p_payload->>'size')::integer,2);")
// No bulk ID replacement during review: item-level edits preserve original identity/name.
command = replaceOnce(command, "WHEN 'review' THEN\n      IF s.state <> 'review' THEN RAISE EXCEPTION 'split_conflict'; END IF;\n      extraction := p_payload->'extraction';\n      PERFORM receipt_split.validate_v2(extraction);", "WHEN 'review' THEN RAISE EXCEPTION 'split_invalid';")
command = replaceOnce(command, "IF p_command IN ('review','confirm','delete','delete_image') AND", "IF p_command IN ('save_review','confirm','delete','delete_image','receipt_total') AND")
command = replaceOnce(command, "  CASE p_command", `  -- Upgrade under the same parent lock as every old/new writer. A failed command
  -- rolls this conversion back; no bulk migration guesses historical totals.
  IF s.contract_version=1 THEN
    UPDATE receipt_split.items SET quantity_units=quantity_milli*3,quantity_milli=NULL,
      original_description=description WHERE split_id=s.id;
    UPDATE receipt_split.claims SET quantity_units=quantity_milli*3,quantity_milli=NULL WHERE split_id=s.id;
    UPDATE receipt_split.splits SET contract_version=2 WHERE id=s.id;
  END IF;
  CASE p_command`)
command = replaceOnce(command, "        OR (SELECT coalesce(sum(total_minor),0) FROM receipt_split.items WHERE split_id=s.id) <> s.total_minor\n", '')
command = replaceOnce(command, "IF NOT FOUND OR i.kind <> 'item' OR i.total_minor <= 0 THEN RAISE EXCEPTION 'split_invalid'; END IF;", `IF NOT FOUND OR i.kind <> 'item' OR i.total_minor <= 0 THEN RAISE EXCEPTION 'split_invalid'; END IF;
      IF jsonb_typeof(p_payload->'itemRevision') IS DISTINCT FROM 'number'
        OR coalesce(p_payload->>'itemRevision','') !~ '^[0-9]+$'
        OR (p_payload->>'itemRevision')::numeric <> i.item_revision THEN RAISE EXCEPTION 'split_conflict'; END IF;`)
command = replaceOnce(command, "    WHEN 'delete' THEN", `    WHEN 'save_review' THEN
      IF s.state<>'review' THEN RAISE EXCEPTION 'split_conflict'; END IF;
      UPDATE receipt_split.splits SET review_saved=true,version=version+1 WHERE id=s.id;
    WHEN 'receipt_total' THEN
      IF s.state NOT IN ('review','sharing') THEN RAISE EXCEPTION 'split_conflict'; END IF;
      IF jsonb_typeof(p_payload->'receiptTotalMinor') IS DISTINCT FROM 'number'
        OR coalesce(p_payload->>'receiptTotalMinor','') !~ '^[0-9]+$'
        OR (p_payload->>'receiptTotalMinor')::numeric NOT BETWEEN 1 AND 9007199254740991
      THEN RAISE EXCEPTION 'split_invalid'; END IF;
      UPDATE receipt_split.splits SET total_minor=(p_payload->>'receiptTotalMinor')::bigint,
        review_saved=false,version=version+1 WHERE id=s.id;
    WHEN 'edit_item' THEN
      IF s.state NOT IN ('review','sharing') THEN RAISE EXCEPTION 'split_conflict'; END IF;
      SELECT * INTO i FROM receipt_split.items WHERE split_id=s.id AND id=(p_payload->>'itemId')::uuid;
      IF NOT FOUND THEN RAISE EXCEPTION 'split_not_found'; END IF;
      IF jsonb_typeof(p_payload->'itemRevision') IS DISTINCT FROM 'number'
        OR coalesce(p_payload->>'itemRevision','') !~ '^[0-9]+$'
        OR (p_payload->>'itemRevision')::numeric <> i.item_revision THEN RAISE EXCEPTION 'split_conflict'; END IF;
      PERFORM receipt_split.validate_item_edit_v2(p_payload,i.kind);
      SELECT coalesce(sum(quantity_units),0) INTO used FROM receipt_split.claims WHERE split_id=s.id AND item_id=i.id;
      IF (p_payload->>'quantityUnits')::bigint < used THEN RAISE EXCEPTION 'split_quantity_claimed'; END IF;
      IF (p_payload->>'totalMinor')::bigint=0 AND used>0 THEN RAISE EXCEPTION 'split_return_claims_first'; END IF;
      UPDATE receipt_split.items SET description=btrim(p_payload->>'description'),
        explanation=btrim(p_payload->>'explanation'),explanation_needs_review=false,
        original_description=coalesce(original_description,description),
        quantity_units=(p_payload->>'quantityUnits')::bigint,total_minor=(p_payload->>'totalMinor')::bigint,
        item_revision=item_revision+1 WHERE split_id=s.id AND id=i.id;
      UPDATE receipt_split.splits SET review_saved=false,version=version+1 WHERE id=s.id;
    WHEN 'add_item' THEN
      IF s.state NOT IN ('review','sharing') THEN RAISE EXCEPTION 'split_conflict'; END IF;
      PERFORM receipt_split.validate_item_edit_v2(p_payload,'item');
      SELECT coalesce(max(ordinal),0)+1 INTO n FROM receipt_split.items WHERE split_id=s.id;
      IF n>100 THEN RAISE EXCEPTION 'split_invalid'; END IF;
      INSERT INTO receipt_split.items(split_id,ordinal,kind,description,original_description,explanation,quantity_units,total_minor)
        VALUES(s.id,n,'item',btrim(p_payload->>'description'),btrim(p_payload->>'description'),
          btrim(p_payload->>'explanation'),(p_payload->>'quantityUnits')::bigint,(p_payload->>'totalMinor')::bigint);
      UPDATE receipt_split.splits SET review_saved=false,version=version+1 WHERE id=s.id;
    WHEN 'delete' THEN`)
command = replaceOnce(command, "INSERT INTO receipt_split.items(split_id,ordinal,kind,description,quantity_units,total_minor)\n      VALUES(s.id,n,item->>'kind',btrim(item->>'description'),(item->>'quantity_units')::bigint,(item->>'total_minor')::bigint);", `INSERT INTO receipt_split.items(split_id,ordinal,kind,description,original_description,explanation,explanation_needs_review,quantity_units,total_minor)
      VALUES(s.id,n,item->>'kind',btrim(item->>'description'),btrim(item->>'description'),
        coalesce(btrim(item->>'explanation'),''),coalesce((item->>'explanation_needs_review')::boolean,false),
        (item->>'quantity_units')::bigint,(item->>'total_minor')::bigint);`)
command = replaceOnce(command, "  result:=jsonb_build_object('id',s.id);", `  -- Total mismatch is allowed. Arithmetic outside the exact JS money domain is not.
  IF abs((SELECT coalesce(sum(total_minor::numeric),0) FROM receipt_split.items WHERE split_id=s.id))>9007199254740991
    THEN RAISE EXCEPTION 'split_invalid'; END IF;
  IF EXISTS(SELECT 1 FROM receipt_split.splits WHERE id=s.id AND state='sharing')
    AND (SELECT coalesce(sum(total_minor::numeric),0) FROM receipt_split.items WHERE split_id=s.id)<0
    THEN RAISE EXCEPTION 'split_invalid'; END IF;
  result:=jsonb_build_object('id',s.id);`)
command = replaceOnce(command, "VALUES(p_actor_id,p_request_id,p_command,p_split_id,sha256", "VALUES(p_actor_id,p_request_id,'v2:' || p_command,p_split_id,sha256")
functions.push(`CREATE FUNCTION receipt_split.validate_item_edit_v2(p jsonb,p_kind text)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $fn$
BEGIN
  IF jsonb_typeof(p->'description') IS DISTINCT FROM 'string' OR length(btrim(p->>'description')) NOT BETWEEN 1 AND 200
    OR jsonb_typeof(p->'explanation') IS DISTINCT FROM 'string' OR length(p->>'explanation')>240
    OR jsonb_typeof(p->'quantityUnits') IS DISTINCT FROM 'number'
    OR coalesce(p->>'quantityUnits','') !~ '^[0-9]+$'
    OR (p->>'quantityUnits')::numeric NOT BETWEEN 1 AND 3000000
    OR (p_kind<>'item' AND (p->>'quantityUnits')::numeric<>3000)
    OR jsonb_typeof(p->'totalMinor') IS DISTINCT FROM 'number'
    OR coalesce(p->>'totalMinor','') !~ '^-?[0-9]+$'
    OR abs((p->>'totalMinor')::numeric)>9007199254740991
    OR (p_kind='item' AND (p->>'totalMinor')::numeric<0)
  THEN RAISE EXCEPTION 'split_invalid'; END IF;
END;
$fn$;`)
functions.push(`CREATE FUNCTION receipt_split.validate_command_v2(p_command text,p jsonb)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $fn$
DECLARE fields text[]; key text;
BEGIN
  fields := CASE p_command
    WHEN 'create' THEN ARRAY['extraction'] WHEN 'apply_extraction' THEN ARRAY['extraction']
    WHEN 'prepare_image' THEN ARRAY['mime','size']
    WHEN 'begin_extraction' THEN ARRAY[]::text[] WHEN 'image_target' THEN ARRAY[]::text[]
    WHEN 'rotate_invite' THEN ARRAY[]::text[] WHEN 'join' THEN ARRAY['token']
    WHEN 'claim' THEN ARRAY['itemId','itemRevision','previousUnits','quantityUnits']
    WHEN 'edit_item' THEN ARRAY['itemId','itemRevision','description','explanation','quantityUnits','totalMinor']
    WHEN 'add_item' THEN ARRAY['description','explanation','quantityUnits','totalMinor']
    WHEN 'receipt_total' THEN ARRAY['receiptTotalMinor','version']
    WHEN 'save_review' THEN ARRAY['version'] WHEN 'confirm' THEN ARRAY['version']
    WHEN 'delete' THEN ARRAY['version'] WHEN 'delete_image' THEN ARRAY['version']
    WHEN 'complete_delete' THEN ARRAY['scope'] ELSE NULL END;
  IF fields IS NULL OR NOT(p ?& fields) OR p-(fields || ARRAY['contractVersion','quantityScale'])<>'{}'::jsonb
    OR EXISTS(SELECT 1 FROM jsonb_each(p) e WHERE e.value='null'::jsonb)
  THEN RAISE EXCEPTION 'split_invalid'; END IF;
  FOREACH key IN ARRAY ARRAY['version','itemRevision','previousUnits','quantityUnits','totalMinor','receiptTotalMinor','size'] LOOP
    IF p ? key AND jsonb_typeof(p->key) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'split_invalid'; END IF;
  END LOOP;
END;
$fn$;`)
functions.push(command)

const schema = `ALTER TABLE receipt_split.splits ADD COLUMN contract_version integer NOT NULL DEFAULT 1 CHECK(contract_version IN (1,2));
ALTER TABLE receipt_split.items
  ALTER COLUMN quantity_milli DROP NOT NULL,
  ADD COLUMN quantity_units bigint CHECK(quantity_units BETWEEN 1 AND 3000000),
  ADD COLUMN item_revision bigint NOT NULL DEFAULT 1 CHECK(item_revision BETWEEN 1 AND 9007199254740991),
  ADD COLUMN original_description text CHECK(length(btrim(original_description)) BETWEEN 1 AND 200),
  ADD COLUMN explanation text NOT NULL DEFAULT '' CHECK(length(explanation)<=240),
  ADD COLUMN explanation_needs_review boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT items_exact_quantity_version CHECK((quantity_milli IS NULL) <> (quantity_units IS NULL)),
  ADD CONSTRAINT items_v2_adjustment_quantity CHECK(kind='item' OR quantity_units IS NULL OR quantity_units=3000);
ALTER TABLE receipt_split.claims
  ALTER COLUMN quantity_milli DROP NOT NULL,
  ADD COLUMN quantity_units bigint CHECK(quantity_units BETWEEN 1 AND 3000000),
  ADD CONSTRAINT claims_exact_quantity_version CHECK((quantity_milli IS NULL) <> (quantity_units IS NULL));`

const priorPost = read('sql/validation/183-receipt-split-add-item/postflight.sql')
const priorQuery = priorPost.slice(priorPost.indexOf('WITH entries AS')).trim().replace(/;$/, '')
const newNames = ['read_legacy_v1','command_legacy_v1','add_legacy_v1','guard_legacy_v1','validate_v2','validate_item_edit_v2','validate_command_v2']
const absent = `NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE (n.nspname='receipt_split' AND p.proname IN (${newNames.map(n=>"'"+n+"'").join(',')}))
 OR (n.nspname='public' AND p.proname IN ('receipt_split_read_v2','receipt_split_command_v2')))
 AND NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('receipt_split.splits') AND attname='contract_version' AND NOT attisdropped)
 AND NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid IN (to_regclass('receipt_split.items'),to_regclass('receipt_split.claims'))
 AND attname IN ('quantity_units','item_revision','original_description','explanation','explanation_needs_review') AND NOT attisdropped)`
const preflight = `WITH predecessor AS (${priorQuery})
SELECT CASE WHEN predecessor.operator_state='EXACT_INSTALLED' AND current_user='postgres' AND (${absent}) THEN 'READY' ELSE 'STOP' END AS operator_state,
 predecessor.operator_state AS predecessor_state, current_user='postgres' AS operator_ok, (${absent}) AS targets_absent FROM predecessor`
const getMeta = fn => {
  const m = fn.match(/CREATE (?:OR REPLACE )?FUNCTION (\S+)\(([^)]*)\)/)
  const args = m[2].split(',').map(a=>a.trim().split(/\s+/).at(-1)).join(',')
  return { name:m[1], signature:m[1]+'('+args+')', body:fn.slice(fn.indexOf('$fn$')+4,fn.lastIndexOf('$fn$')),
    definer:fn.includes('SECURITY DEFINER'), stable:fn.includes('STABLE') }
}
const metadata = [...originals,...functions].map(getMeta)
const acl = functions.map(getMeta).map(m=>`ALTER FUNCTION ${m.signature} OWNER TO postgres;
REVOKE ALL ON FUNCTION ${m.signature} FROM PUBLIC,anon,authenticated,service_role;
${m.name.startsWith('public.') ? 'GRANT EXECUTE ON FUNCTION '+m.signature+' TO service_role;' : ''}`).join('\n')
let fingerprint = priorPost.slice(priorPost.indexOf('WITH entries AS'), priorPost.indexOf(',\nexpected('))
fingerprint = fingerprint.replaceAll("'receipt_split_read_v1','receipt_split_command_v1'", "'receipt_split_read_v1','receipt_split_command_v1','receipt_split_add_item_v1','receipt_split_read_v2','receipt_split_command_v2'")
const expected = metadata.map(m=>`('${m.signature}','${crypto.createHash('md5').update(m.body).digest('hex')}',${m.definer},'${m.stable?'s':'v'}',${m.name.startsWith('public.')})`).join(',\n')
const postflight = `${fingerprint}, expected(signature,body_md5,is_definer,volatility,is_public) AS (VALUES ${expected}), checks AS (
 SELECT
 (SELECT value FROM digest)=replace(obj_description(to_regnamespace('receipt_split'),'pg_namespace'),'SQL184:v2:','') AS seal_ok,
 (SELECT bool_and(p.oid IS NOT NULL AND md5(replace(p.prosrc,E'\\r\\n',E'\\n'))=e.body_md5
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
SELECT CASE WHEN seal_ok AND functions_ok AND tables_ok AND no_client_policies AND schema_private AND tables_private AND bucket_ok THEN 'EXACT_INSTALLED' ELSE 'STOP' END AS operator_state, checks.* FROM checks`
const migration = `-- SQL184 MIGRATION: versioned standalone scale=3000, stable item edits and independent receipt total.
-- Stebbi runs only after matching preflight READY and explicit apply handoff. No agent SQL execution.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL search_path='';
DO $guard$
DECLARE result record;
BEGIN
 SELECT * INTO result FROM (${preflight}) gate;
 IF result.operator_state<>'READY' THEN RAISE EXCEPTION 'SQL184 prerequisite mismatch; stop'; END IF;
END;
$guard$;
${schema}
${functions.join('\n\n')}
${acl}
DO $seal$
DECLARE fingerprint text;
BEGIN
 ${fingerprint} SELECT value INTO fingerprint FROM digest;
 EXECUTE format('COMMENT ON SCHEMA receipt_split IS %L','SQL184:v2:' || fingerprint);
END;
$seal$;
COMMIT;
`
const dir = path.join(root,'sql/validation/184-receipt-split-v2')
fs.mkdirSync(dir,{recursive:true})
fs.writeFileSync(path.join(root,'sql/184_receipt_split_v2.sql'),migration)
fs.writeFileSync(path.join(dir,'preflight.sql'),'-- SQL184 PREFLIGHT: read-only catalog comparison of SQL182/183 and absent v2 targets. Stebbi runs SQL.\nSET search_path=pg_catalog;\n'+preflight+';\n')
fs.writeFileSync(path.join(dir,'postflight.sql'),'-- SQL184 POSTFLIGHT: read-only exact v2 body/ACL/catalog seal. Stebbi runs SQL.\nSET search_path=pg_catalog;\n'+postflight+';\n')
console.log('Generated SQL184 artifacts only; no database execution.')
