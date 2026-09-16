-- SQL184 MIGRATION: versioned standalone scale=3000, stable item edits and independent receipt total.
-- Stebbi runs only after matching preflight READY and explicit apply handoff. No agent SQL execution.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL search_path='';
DO $guard$
DECLARE result record;
BEGIN
 SELECT * INTO result FROM (WITH predecessor AS (WITH entries AS (
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
),
addition AS (
  SELECT count(*)=1 AND coalesce(bool_and(
    p.oid=to_regprocedure('public.receipt_split_add_item_v1(uuid,uuid,uuid,jsonb)')
    AND md5(replace(p.prosrc,E'\r\n',E'\n'))='147485b03a6061c3d0a0cf714abc69bd'
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
SELECT CASE WHEN seal_ok AND functions_ok AND tables_ok AND no_client_policies AND boundary_ok AND schema_private AND bucket_ok AND storage_policy_ok AND addition_ok THEN 'EXACT_INSTALLED' ELSE 'STOP' END AS operator_state,
checks.*, addition.* FROM checks CROSS JOIN addition)
SELECT CASE WHEN predecessor.operator_state='EXACT_INSTALLED' AND current_user='postgres' AND (NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE (n.nspname='receipt_split' AND p.proname IN ('read_legacy_v1','command_legacy_v1','add_legacy_v1','guard_legacy_v1','validate_v2','validate_item_edit_v2','validate_command_v2'))
 OR (n.nspname='public' AND p.proname IN ('receipt_split_read_v2','receipt_split_command_v2')))
 AND NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('receipt_split.splits') AND attname='contract_version' AND NOT attisdropped)
 AND NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid IN (to_regclass('receipt_split.items'),to_regclass('receipt_split.claims'))
 AND attname IN ('quantity_units','item_revision','original_description','explanation','explanation_needs_review') AND NOT attisdropped)) THEN 'READY' ELSE 'STOP' END AS operator_state,
 predecessor.operator_state AS predecessor_state, current_user='postgres' AS operator_ok, (NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE (n.nspname='receipt_split' AND p.proname IN ('read_legacy_v1','command_legacy_v1','add_legacy_v1','guard_legacy_v1','validate_v2','validate_item_edit_v2','validate_command_v2'))
 OR (n.nspname='public' AND p.proname IN ('receipt_split_read_v2','receipt_split_command_v2')))
 AND NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('receipt_split.splits') AND attname='contract_version' AND NOT attisdropped)
 AND NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid IN (to_regclass('receipt_split.items'),to_regclass('receipt_split.claims'))
 AND attname IN ('quantity_units','item_revision','original_description','explanation','explanation_needs_review') AND NOT attisdropped)) AS targets_absent FROM predecessor) gate;
 IF result.operator_state<>'READY' THEN RAISE EXCEPTION 'SQL184 prerequisite mismatch; stop'; END IF;
END;
$guard$;
ALTER TABLE receipt_split.splits ADD COLUMN contract_version integer NOT NULL DEFAULT 1 CHECK(contract_version IN (1,2));
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
  ADD CONSTRAINT claims_exact_quantity_version CHECK((quantity_milli IS NULL) <> (quantity_units IS NULL));
CREATE FUNCTION receipt_split.read_legacy_v1(p_actor_id uuid,p_split_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE s receipt_split.splits%ROWTYPE; result jsonb;
BEGIN
  PERFORM receipt_split.assert_actor(p_actor_id);
  IF p_split_id IS NULL THEN
    SELECT coalesce(jsonb_agg(x.row ORDER BY x.created_at DESC),'[]'::jsonb) INTO result FROM (
      SELECT jsonb_build_object('id',s.id,'title',s.title,'state',s.state) row,s.created_at
      FROM receipt_split.splits s JOIN receipt_split.members m ON m.split_id = s.id
      WHERE m.user_id = p_actor_id AND s.state <> 'deleted' AND (s.state <> 'deleting' OR s.owner_id=p_actor_id)
      ORDER BY s.created_at DESC LIMIT 100
    ) x;
    RETURN result;
  END IF;
  SELECT * INTO s FROM receipt_split.splits WHERE id = p_split_id AND state <> 'deleted';
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM receipt_split.members WHERE split_id = p_split_id AND user_id = p_actor_id
  ) THEN RAISE EXCEPTION 'split_not_found'; END IF;
  IF s.state='deleting' AND s.owner_id<>p_actor_id THEN RAISE EXCEPTION 'split_not_found'; END IF;
  RETURN jsonb_build_object(
    'id',s.id,'state',s.state,'version',s.version,'title',s.title,'currency',s.currency,
    'incurredOn',s.incurred_on,'totalMinor',s.total_minor,'isOwner',s.owner_id = p_actor_id,'reviewSaved',s.review_saved,
    'imageAvailable',s.image_path IS NOT NULL AND NOT s.image_deleted AND NOT s.image_deleting AND s.state <> 'deleting',
    'deleteScope',CASE WHEN s.owner_id=p_actor_id THEN CASE WHEN s.state='deleting' THEN 'split' WHEN s.image_deleting THEN 'image' END END,
    'inviteToken',CASE WHEN s.owner_id = p_actor_id AND s.state = 'sharing' AND s.invite_expires_at > now() THEN s.invite_token END,
    'members',(SELECT coalesce(jsonb_agg(jsonb_build_object('token',m.token,'name',m.display_name,'isSelf',m.user_id = p_actor_id) ORDER BY m.token),'[]'::jsonb)
      FROM receipt_split.members m WHERE m.split_id = s.id),
    'items',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'kind',i.kind,'description',i.description,'quantityMilli',i.quantity_milli,'totalMinor',i.total_minor) ORDER BY i.ordinal),'[]'::jsonb)
      FROM receipt_split.items i WHERE i.split_id = s.id),
    'claims',(SELECT coalesce(jsonb_agg(jsonb_build_object('itemId',c.item_id,'memberToken',c.member_token,'quantityMilli',c.quantity_milli) ORDER BY c.item_id,c.member_token),'[]'::jsonb)
      FROM receipt_split.claims c WHERE c.split_id = s.id)
  );
END;
$fn$;

CREATE FUNCTION receipt_split.command_legacy_v1(
  p_actor_id uuid,p_command text,p_request_id uuid,p_split_id uuid,p_payload jsonb
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  s receipt_split.splits%ROWTYPE; r receipt_split.requests%ROWTYPE;
  i receipt_split.items%ROWTYPE; member uuid; label text; extraction jsonb;
  result jsonb; qty bigint; used bigint; mine bigint; n integer; item jsonb;
BEGIN
  PERFORM receipt_split.assert_actor(p_actor_id);
  IF p_request_id IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
    OR p_command IS NULL OR p_command NOT IN (
      'create','prepare_image','begin_extraction','apply_extraction','review','confirm',
      'rotate_invite','join','claim','delete','image_target','delete_image','complete_delete'
    ) THEN RAISE EXCEPTION 'split_invalid'; END IF;
  -- Serialize retries before checking the request ledger. Hash collisions
  -- only serialize unrelated requests; they never authorize an operation.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor_id::text || p_request_id::text,0));
  SELECT * INTO r FROM receipt_split.requests WHERE actor_id = p_actor_id AND request_id = p_request_id;
  IF FOUND THEN
    IF r.command <> p_command OR r.split_id IS DISTINCT FROM p_split_id OR r.payload_hash <> sha256(convert_to(p_payload::text,'UTF8')) THEN RAISE EXCEPTION 'split_conflict'; END IF;
    IF p_command IN ('prepare_image','begin_extraction','image_target') AND NOT EXISTS (
      SELECT 1 FROM receipt_split.splits WHERE id=p_split_id AND owner_id=p_actor_id
        AND state NOT IN ('deleted','deleting') AND NOT image_deleted AND NOT image_deleting
        AND (p_command <> 'prepare_image' OR state='uploading')
    ) THEN RAISE EXCEPTION 'split_conflict'; END IF;
    RETURN r.result;
  END IF;
  SELECT left(btrim(display_name),120) INTO label FROM public.profiles WHERE id = p_actor_id;
  IF label IS NULL OR label = '' OR position('@' IN label) > 0 THEN label := NULL; END IF;
  IF p_command IN ('create','prepare_image') THEN
    IF p_split_id IS NULL THEN RAISE EXCEPTION 'split_invalid'; END IF;
    IF p_command = 'create' THEN
      extraction := p_payload->'extraction';
      PERFORM receipt_split.validate(extraction);
      INSERT INTO receipt_split.splits(id,owner_id,state) VALUES(p_split_id,p_actor_id,'review');
    ELSE
      IF p_payload->>'mime' IS NULL OR p_payload->>'mime' NOT IN ('image/jpeg','image/png','image/webp')
        OR coalesce(p_payload->>'size','') !~ '^[0-9]+$'
        OR (p_payload->>'size')::bigint NOT BETWEEN 1 AND 10485760 THEN RAISE EXCEPTION 'split_invalid'; END IF;
      INSERT INTO receipt_split.splits(id,owner_id,state,image_path,image_mime,image_size)
      VALUES(p_split_id,p_actor_id,'uploading',p_actor_id::text || '/' || p_split_id::text,
        p_payload->>'mime',(p_payload->>'size')::integer);
    END IF;
    INSERT INTO receipt_split.members(split_id,user_id,display_name) VALUES(p_split_id,p_actor_id,label);
  END IF;
  IF p_command = 'join' THEN
    IF coalesce(p_payload->>'token','') !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'split_not_found'; END IF;
    SELECT * INTO s FROM receipt_split.splits WHERE invite_token = p_payload->>'token'
      AND state = 'sharing' AND invite_expires_at > now() FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'split_not_found'; END IF;
    IF NOT EXISTS (SELECT 1 FROM receipt_split.members WHERE split_id = s.id AND user_id = p_actor_id)
      AND (SELECT count(*) FROM receipt_split.members WHERE split_id = s.id) >= 50 THEN RAISE EXCEPTION 'split_full'; END IF;
    INSERT INTO receipt_split.members(split_id,user_id,display_name) VALUES(s.id,p_actor_id,label)
      ON CONFLICT (split_id,user_id) DO NOTHING;
  ELSE
    SELECT * INTO s FROM receipt_split.splits WHERE id = p_split_id AND (state <> 'deleted' OR p_command='complete_delete') FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'split_not_found'; END IF;
    SELECT token INTO member FROM receipt_split.members WHERE split_id = s.id AND user_id = p_actor_id;
    IF member IS NULL AND NOT (p_command='complete_delete' AND s.owner_id=p_actor_id) THEN RAISE EXCEPTION 'split_not_found'; END IF;
    IF p_command <> 'claim' AND s.owner_id <> p_actor_id THEN RAISE EXCEPTION 'split_not_allowed'; END IF;
  END IF;
  IF (s.state='deleting' OR s.image_deleting) AND p_command NOT IN ('delete','delete_image','complete_delete') THEN
    RAISE EXCEPTION 'split_conflict';
  END IF;
  IF p_command IN ('review','confirm','delete','delete_image') AND
    (coalesce(p_payload->>'version','') !~ '^[0-9]+$' OR (p_payload->>'version')::bigint <> s.version) THEN
    RAISE EXCEPTION 'split_conflict';
  END IF;
  CASE p_command
    WHEN 'create' THEN NULL;
    WHEN 'prepare_image' THEN NULL;
    WHEN 'begin_extraction' THEN
      IF s.state <> 'uploading' OR s.image_deleted THEN RAISE EXCEPTION 'split_conflict'; END IF;
      UPDATE receipt_split.splits SET state = 'extracting',version = version + 1 WHERE id = s.id;
    WHEN 'apply_extraction' THEN
      IF s.state NOT IN ('uploading','extracting') THEN RAISE EXCEPTION 'split_conflict'; END IF;
      extraction := p_payload->'extraction';
      PERFORM receipt_split.validate(extraction);
    WHEN 'review' THEN
      IF s.state <> 'review' THEN RAISE EXCEPTION 'split_conflict'; END IF;
      extraction := p_payload->'extraction';
      PERFORM receipt_split.validate(extraction);
    WHEN 'confirm' THEN
      IF s.state <> 'review' OR NOT s.review_saved OR s.total_minor <= 0
        OR (SELECT coalesce(sum(total_minor),0) FROM receipt_split.items WHERE split_id=s.id) <> s.total_minor
        OR NOT EXISTS (SELECT 1 FROM receipt_split.items WHERE split_id=s.id AND kind='item' AND total_minor>0)
        THEN RAISE EXCEPTION 'split_total_mismatch'; END IF;
      UPDATE receipt_split.splits SET state='sharing',version=version+1,
        invite_token=replace(gen_random_uuid()::text || gen_random_uuid()::text,'-',''),
        invite_expires_at=now()+interval '30 days' WHERE id=s.id;
    WHEN 'rotate_invite' THEN
      IF s.state <> 'sharing' THEN RAISE EXCEPTION 'split_conflict'; END IF;
      UPDATE receipt_split.splits SET invite_token=replace(gen_random_uuid()::text || gen_random_uuid()::text,'-',''),
        invite_expires_at=now()+interval '30 days' WHERE id=s.id;
    WHEN 'join' THEN NULL;
    WHEN 'claim' THEN
      IF s.state <> 'sharing' OR coalesce(p_payload->>'quantity','') !~ '^[0-9]+$'
        OR (p_payload->>'quantity')::numeric NOT BETWEEN 0 AND 1000000 THEN RAISE EXCEPTION 'split_invalid'; END IF;
      qty := (p_payload->>'quantity')::bigint;
      SELECT * INTO i FROM receipt_split.items WHERE split_id=s.id AND id=(p_payload->>'itemId')::uuid;
      IF NOT FOUND OR i.kind <> 'item' OR i.total_minor <= 0 THEN RAISE EXCEPTION 'split_invalid'; END IF;
      SELECT coalesce(sum(quantity_milli),0),coalesce(max(quantity_milli) FILTER(WHERE member_token=member),0)
        INTO used,mine FROM receipt_split.claims WHERE split_id=s.id AND item_id=i.id;
      -- Compare the caller's previous amount, but allow unrelated members to claim concurrently.
      IF coalesce(p_payload->>'previous','') !~ '^[0-9]+$'
        OR (p_payload->>'previous')::bigint <> mine OR used-mine+qty > i.quantity_milli THEN RAISE EXCEPTION 'split_conflict'; END IF;
      IF qty=0 THEN DELETE FROM receipt_split.claims WHERE split_id=s.id AND item_id=i.id AND member_token=member;
      ELSE
        INSERT INTO receipt_split.claims(split_id,item_id,member_token,quantity_milli) VALUES(s.id,i.id,member,qty)
          ON CONFLICT(split_id,item_id,member_token) DO UPDATE SET quantity_milli=EXCLUDED.quantity_milli;
      END IF;
      UPDATE receipt_split.splits SET version=version+1 WHERE id=s.id;
    WHEN 'delete' THEN
      UPDATE receipt_split.splits SET state='deleting',invite_token=NULL,invite_expires_at=NULL WHERE id=s.id;
    WHEN 'delete_image' THEN
      IF s.image_path IS NULL OR s.state='deleting' THEN RAISE EXCEPTION 'split_conflict'; END IF;
      UPDATE receipt_split.splits SET image_deleting=true WHERE id=s.id;
    WHEN 'complete_delete' THEN
      IF p_payload->>'scope' = 'split' AND s.state IN ('deleting','deleted') THEN
        DELETE FROM receipt_split.claims WHERE split_id=s.id;
        DELETE FROM receipt_split.items WHERE split_id=s.id;
        DELETE FROM receipt_split.members WHERE split_id=s.id;
        UPDATE receipt_split.splits SET state='deleted',title='',total_minor=0,image_path=NULL,
          image_mime=NULL,image_size=NULL,image_deleted=true,image_deleting=false,version=version+1 WHERE id=s.id AND state='deleting';
      ELSIF p_payload->>'scope' = 'image' AND s.state NOT IN ('deleting','deleted') AND (s.image_deleting OR s.image_deleted) THEN
        UPDATE receipt_split.splits SET image_deleted=true,image_deleting=false,version=version+1 WHERE id=s.id AND image_deleting;
      ELSE RAISE EXCEPTION 'split_conflict';
      END IF;
    WHEN 'image_target' THEN
      IF s.image_path IS NULL OR s.image_deleted THEN RAISE EXCEPTION 'split_not_found'; END IF;
  END CASE;
  IF extraction IS NOT NULL THEN
    UPDATE receipt_split.splits SET title=btrim(extraction->>'title'),currency=extraction->>'currency',
      incurred_on=(extraction->>'incurred_on')::date,total_minor=(extraction->>'receipt_total_minor')::bigint,
      state='review',review_saved=(p_command='review'),version=version+1 WHERE id=s.id;
    -- Only private review can replace item IDs; shared items are immutable.
    DELETE FROM receipt_split.items WHERE split_id=s.id;
    n:=0;
    FOR item IN SELECT value FROM jsonb_array_elements(extraction->'items') LOOP
      n:=n+1;
      INSERT INTO receipt_split.items(split_id,ordinal,kind,description,quantity_milli,total_minor)
      VALUES(s.id,n,item->>'kind',btrim(item->>'description'),(item->>'quantity_milli')::bigint,(item->>'total_minor')::bigint);
    END LOOP;
  END IF;
  result:=jsonb_build_object('id',s.id);
  IF p_command IN ('prepare_image','begin_extraction','image_target','delete_image','delete') THEN
    result:=result || jsonb_build_object('path',s.image_path,'mime',s.image_mime,'size',s.image_size);
  END IF;
  INSERT INTO receipt_split.requests(actor_id,request_id,command,split_id,payload_hash,result)
    VALUES(p_actor_id,p_request_id,p_command,p_split_id,sha256(convert_to(p_payload::text,'UTF8')),result);
  RETURN result;
END;
$fn$;

CREATE FUNCTION receipt_split.add_legacy_v1(p_actor_id uuid,p_request_id uuid,p_split_id uuid,p_payload jsonb)
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

CREATE FUNCTION receipt_split.guard_legacy_v1(p_actor uuid,p_request uuid,p_id uuid,p_command text,p_payload jsonb)
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
$fn$;

CREATE OR REPLACE FUNCTION public.receipt_split_read_v1(p_actor_id uuid,p_split_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
  PERFORM receipt_split.assert_actor(p_actor_id);
  IF EXISTS(SELECT 1 FROM receipt_split.splits s JOIN receipt_split.members m ON m.split_id=s.id
    WHERE s.id=p_split_id AND m.user_id=p_actor_id AND s.contract_version=2) THEN
    RAISE EXCEPTION 'split_upgrade_required';
  END IF;
  RETURN receipt_split.read_legacy_v1(p_actor_id,p_split_id);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.receipt_split_command_v1(p_actor_id uuid,p_command text,p_request_id uuid,p_split_id uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
  PERFORM receipt_split.guard_legacy_v1(p_actor_id,p_request_id,p_split_id,p_command,p_payload);
  RETURN receipt_split.command_legacy_v1(p_actor_id,p_command,p_request_id,p_split_id,p_payload);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.receipt_split_add_item_v1(p_actor_id uuid,p_request_id uuid,p_split_id uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
  PERFORM receipt_split.guard_legacy_v1(p_actor_id,p_request_id,p_split_id,'add_item',p_payload);
  RETURN receipt_split.add_legacy_v1(p_actor_id,p_request_id,p_split_id,p_payload);
END;
$fn$;

CREATE FUNCTION receipt_split.validate_v2(p jsonb) RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $fn$
DECLARE i jsonb; d date;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object'
    OR p - ARRAY['contract_version','quantity_scale','title','currency','incurred_on','receipt_total_minor','items'] <> '{}'::jsonb
    OR NOT (p ?& ARRAY['contract_version','quantity_scale','title','currency','incurred_on','receipt_total_minor','items'])
    OR p->'contract_version' IS DISTINCT FROM '2'::jsonb
    OR p->'quantity_scale' IS DISTINCT FROM '3000'::jsonb
    OR jsonb_typeof(p->'title') <> 'string'
    OR length(btrim(p->>'title')) NOT BETWEEN 1 AND 200
    OR p->>'currency' NOT IN ('ISK','EUR','USD','GBP','DKK','NOK','SEK')
    OR jsonb_typeof(p->'incurred_on') <> 'string'
    OR p->>'incurred_on' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    OR jsonb_typeof(p->'receipt_total_minor') <> 'number'
    OR p->>'receipt_total_minor' !~ '^[0-9]+$'
    OR (p->>'receipt_total_minor')::numeric NOT BETWEEN 1 AND 9007199254740991
    OR jsonb_typeof(p->'items') <> 'array' THEN
    RAISE EXCEPTION 'split_invalid';
  END IF;
  d := (p->>'incurred_on')::date;
  IF to_char(d,'YYYY-MM-DD') <> p->>'incurred_on'
    OR jsonb_array_length(p->'items') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'split_invalid'; END IF;
  FOR i IN SELECT value FROM jsonb_array_elements(p->'items') LOOP
    IF jsonb_typeof(i) <> 'object'
      OR i - ARRAY['explanation','explanation_needs_review','kind','description','quantity_units','total_minor','confidence_basis_points','needs_review'] <> '{}'::jsonb
      OR NOT (i ?& ARRAY['kind','description','quantity_units','total_minor','confidence_basis_points','needs_review'])
      OR i->>'kind' NOT IN ('item','discount','tax','tip')
      OR jsonb_typeof(i->'kind') <> 'string'
      OR jsonb_typeof(i->'description') <> 'string'
      OR length(btrim(i->>'description')) NOT BETWEEN 1 AND 200
      OR jsonb_typeof(i->'quantity_units') <> 'number'
      OR i->>'quantity_units' !~ '^[0-9]+$'
      OR (i->>'quantity_units')::numeric NOT BETWEEN 1 AND 3000000
      OR (i->>'kind' <> 'item' AND (i->>'quantity_units')::numeric <> 3000)
      OR jsonb_typeof(i->'total_minor') <> 'number'
      OR i->>'total_minor' !~ '^-?[0-9]+$'
      OR abs((i->>'total_minor')::numeric) > 9007199254740991
      OR (i->>'kind' = 'item' AND (i->>'total_minor')::numeric < 0)
      OR jsonb_typeof(i->'confidence_basis_points') <> 'number'
      OR i->>'confidence_basis_points' !~ '^[0-9]+$'
      OR (i->>'confidence_basis_points')::numeric NOT BETWEEN 0 AND 10000
      OR jsonb_typeof(i->'needs_review') <> 'boolean'
      OR (i ? 'explanation' AND (jsonb_typeof(i->'explanation') <> 'string' OR length(i->>'explanation')>240))
      OR (i ? 'explanation_needs_review' AND jsonb_typeof(i->'explanation_needs_review') <> 'boolean')
      OR EXISTS (SELECT 1 FROM jsonb_each(i) e WHERE e.value = 'null'::jsonb) THEN
      RAISE EXCEPTION 'split_invalid';
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM jsonb_each(p) e WHERE e.value = 'null'::jsonb) THEN RAISE EXCEPTION 'split_invalid'; END IF;
END;
$fn$;

CREATE FUNCTION public.receipt_split_read_v2(p_actor_id uuid,p_split_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE s receipt_split.splits%ROWTYPE; result jsonb;
BEGIN
  PERFORM receipt_split.assert_actor(p_actor_id);
  IF p_split_id IS NULL THEN
    SELECT coalesce(jsonb_agg(x.row ORDER BY x.created_at DESC),'[]'::jsonb) INTO result FROM (
      SELECT jsonb_build_object('id',s.id,'title',s.title,'state',s.state) row,s.created_at
      FROM receipt_split.splits s JOIN receipt_split.members m ON m.split_id = s.id
      WHERE m.user_id = p_actor_id AND s.state <> 'deleted' AND (s.state <> 'deleting' OR s.owner_id=p_actor_id)
      ORDER BY s.created_at DESC LIMIT 100
    ) x;
    RETURN result;
  END IF;
  SELECT * INTO s FROM receipt_split.splits WHERE id = p_split_id AND state <> 'deleted';
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM receipt_split.members WHERE split_id = p_split_id AND user_id = p_actor_id
  ) THEN RAISE EXCEPTION 'split_not_found'; END IF;
  IF s.state='deleting' AND s.owner_id<>p_actor_id THEN RAISE EXCEPTION 'split_not_found'; END IF;
  RETURN jsonb_build_object(
    'contractVersion',2,'quantityScale',3000,'sourceContractVersion',s.contract_version,
    'id',s.id,'state',s.state,'version',s.version,'title',s.title,'currency',s.currency,
    'incurredOn',s.incurred_on,'receiptTotalMinor',s.total_minor,'isOwner',s.owner_id = p_actor_id,'reviewSaved',s.review_saved,
    'imageAvailable',s.image_path IS NOT NULL AND NOT s.image_deleted AND NOT s.image_deleting AND s.state <> 'deleting',
    'deleteScope',CASE WHEN s.owner_id=p_actor_id THEN CASE WHEN s.state='deleting' THEN 'split' WHEN s.image_deleting THEN 'image' END END,
    'inviteToken',CASE WHEN s.owner_id = p_actor_id AND s.state = 'sharing' AND s.invite_expires_at > now() THEN s.invite_token END,
    'members',(SELECT coalesce(jsonb_agg(jsonb_build_object('token',m.token,'name',m.display_name,'isSelf',m.user_id = p_actor_id) ORDER BY m.token),'[]'::jsonb)
      FROM receipt_split.members m WHERE m.split_id = s.id),
    'items',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'kind',i.kind,'description',i.description,'quantityUnits',coalesce(i.quantity_units,i.quantity_milli*3),
        'itemRevision',i.item_revision,'originalDescription',coalesce(i.original_description,i.description),
        'explanation',i.explanation,'explanationNeedsReview',i.explanation_needs_review,'totalMinor',i.total_minor) ORDER BY i.ordinal),'[]'::jsonb)
      FROM receipt_split.items i WHERE i.split_id = s.id),
    'claims',(SELECT coalesce(jsonb_agg(jsonb_build_object('itemId',c.item_id,'memberToken',c.member_token,'quantityUnits',coalesce(c.quantity_units,c.quantity_milli*3)) ORDER BY c.item_id,c.member_token),'[]'::jsonb)
      FROM receipt_split.claims c WHERE c.split_id = s.id)
  );
END;
$fn$;

CREATE FUNCTION receipt_split.validate_item_edit_v2(p jsonb,p_kind text)
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
$fn$;

CREATE FUNCTION receipt_split.validate_command_v2(p_command text,p jsonb)
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
$fn$;

CREATE FUNCTION public.receipt_split_command_v2(
  p_actor_id uuid,p_command text,p_request_id uuid,p_split_id uuid,p_payload jsonb
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  s receipt_split.splits%ROWTYPE; r receipt_split.requests%ROWTYPE;
  i receipt_split.items%ROWTYPE; member uuid; label text; extraction jsonb;
  result jsonb; qty bigint; used bigint; mine bigint; n integer; item jsonb;
BEGIN
  PERFORM receipt_split.assert_actor(p_actor_id);
  IF p_request_id IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
    OR p_payload->'contractVersion' IS DISTINCT FROM '2'::jsonb
    OR p_payload->'quantityScale' IS DISTINCT FROM '3000'::jsonb
    OR p_command IS NULL OR p_command NOT IN (
      'create','prepare_image','begin_extraction','apply_extraction','review','confirm',
      'rotate_invite','join','claim','delete','image_target','delete_image','complete_delete',
      'edit_item','add_item','receipt_total','save_review'
    ) THEN RAISE EXCEPTION 'split_invalid'; END IF;
  PERFORM receipt_split.validate_command_v2(p_command,p_payload);
  -- Serialize retries before checking the request ledger. Hash collisions
  -- only serialize unrelated requests; they never authorize an operation.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor_id::text || p_request_id::text,0));
  SELECT * INTO r FROM receipt_split.requests WHERE actor_id = p_actor_id AND request_id = p_request_id;
  IF FOUND THEN
    IF r.command <> 'v2:' || p_command OR r.split_id IS DISTINCT FROM p_split_id OR r.payload_hash <> sha256(convert_to(p_payload::text,'UTF8')) THEN RAISE EXCEPTION 'split_conflict'; END IF;
    IF p_command IN ('prepare_image','begin_extraction','image_target') AND NOT EXISTS (
      SELECT 1 FROM receipt_split.splits WHERE id=p_split_id AND owner_id=p_actor_id
        AND state NOT IN ('deleted','deleting') AND NOT image_deleted AND NOT image_deleting
        AND (p_command <> 'prepare_image' OR state='uploading')
    ) THEN RAISE EXCEPTION 'split_conflict'; END IF;
    RETURN r.result;
  END IF;
  SELECT left(btrim(display_name),120) INTO label FROM public.profiles WHERE id = p_actor_id;
  IF label IS NULL OR label = '' OR position('@' IN label) > 0 THEN label := NULL; END IF;
  IF p_command IN ('create','prepare_image') THEN
    IF p_split_id IS NULL THEN RAISE EXCEPTION 'split_invalid'; END IF;
    IF p_command = 'create' THEN
      extraction := p_payload->'extraction';
      PERFORM receipt_split.validate_v2(extraction);
      INSERT INTO receipt_split.splits(id,owner_id,state,contract_version) VALUES(p_split_id,p_actor_id,'review',2);
    ELSE
      IF p_payload->>'mime' IS NULL OR p_payload->>'mime' NOT IN ('image/jpeg','image/png','image/webp')
        OR coalesce(p_payload->>'size','') !~ '^[0-9]+$'
        OR (p_payload->>'size')::bigint NOT BETWEEN 1 AND 10485760 THEN RAISE EXCEPTION 'split_invalid'; END IF;
      INSERT INTO receipt_split.splits(id,owner_id,state,image_path,image_mime,image_size,contract_version)
      VALUES(p_split_id,p_actor_id,'uploading',p_actor_id::text || '/' || p_split_id::text,
        p_payload->>'mime',(p_payload->>'size')::integer,2);
    END IF;
    INSERT INTO receipt_split.members(split_id,user_id,display_name) VALUES(p_split_id,p_actor_id,label);
  END IF;
  IF p_command = 'join' THEN
    IF coalesce(p_payload->>'token','') !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'split_not_found'; END IF;
    SELECT * INTO s FROM receipt_split.splits WHERE invite_token = p_payload->>'token'
      AND state = 'sharing' AND invite_expires_at > now() FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'split_not_found'; END IF;
    IF NOT EXISTS (SELECT 1 FROM receipt_split.members WHERE split_id = s.id AND user_id = p_actor_id)
      AND (SELECT count(*) FROM receipt_split.members WHERE split_id = s.id) >= 50 THEN RAISE EXCEPTION 'split_full'; END IF;
    INSERT INTO receipt_split.members(split_id,user_id,display_name) VALUES(s.id,p_actor_id,label)
      ON CONFLICT (split_id,user_id) DO NOTHING;
  ELSE
    SELECT * INTO s FROM receipt_split.splits WHERE id = p_split_id AND (state <> 'deleted' OR p_command='complete_delete') FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'split_not_found'; END IF;
    SELECT token INTO member FROM receipt_split.members WHERE split_id = s.id AND user_id = p_actor_id;
    IF member IS NULL AND NOT (p_command='complete_delete' AND s.owner_id=p_actor_id) THEN RAISE EXCEPTION 'split_not_found'; END IF;
    IF p_command <> 'claim' AND s.owner_id <> p_actor_id THEN RAISE EXCEPTION 'split_not_allowed'; END IF;
  END IF;
  IF (s.state='deleting' OR s.image_deleting) AND p_command NOT IN ('delete','delete_image','complete_delete') THEN
    RAISE EXCEPTION 'split_conflict';
  END IF;
  IF p_command IN ('save_review','confirm','delete','delete_image','receipt_total') AND
    (coalesce(p_payload->>'version','') !~ '^[0-9]+$' OR (p_payload->>'version')::bigint <> s.version) THEN
    RAISE EXCEPTION 'split_conflict';
  END IF;
  -- Upgrade under the same parent lock as every old/new writer. A failed command
  -- rolls this conversion back; no bulk migration guesses historical totals.
  IF s.contract_version=1 THEN
    UPDATE receipt_split.items SET quantity_units=quantity_milli*3,quantity_milli=NULL,
      original_description=description WHERE split_id=s.id;
    UPDATE receipt_split.claims SET quantity_units=quantity_milli*3,quantity_milli=NULL WHERE split_id=s.id;
    UPDATE receipt_split.splits SET contract_version=2 WHERE id=s.id;
  END IF;
  CASE p_command
    WHEN 'create' THEN NULL;
    WHEN 'prepare_image' THEN NULL;
    WHEN 'begin_extraction' THEN
      IF s.state <> 'uploading' OR s.image_deleted THEN RAISE EXCEPTION 'split_conflict'; END IF;
      UPDATE receipt_split.splits SET state = 'extracting',version = version + 1 WHERE id = s.id;
    WHEN 'apply_extraction' THEN
      IF s.state NOT IN ('uploading','extracting') THEN RAISE EXCEPTION 'split_conflict'; END IF;
      extraction := p_payload->'extraction';
      PERFORM receipt_split.validate_v2(extraction);
    WHEN 'review' THEN RAISE EXCEPTION 'split_invalid';
    WHEN 'confirm' THEN
      IF s.state <> 'review' OR NOT s.review_saved OR s.total_minor <= 0
        OR NOT EXISTS (SELECT 1 FROM receipt_split.items WHERE split_id=s.id AND kind='item' AND total_minor>0)
        THEN RAISE EXCEPTION 'split_total_mismatch'; END IF;
      UPDATE receipt_split.splits SET state='sharing',version=version+1,
        invite_token=replace(gen_random_uuid()::text || gen_random_uuid()::text,'-',''),
        invite_expires_at=now()+interval '30 days' WHERE id=s.id;
    WHEN 'rotate_invite' THEN
      IF s.state <> 'sharing' THEN RAISE EXCEPTION 'split_conflict'; END IF;
      UPDATE receipt_split.splits SET invite_token=replace(gen_random_uuid()::text || gen_random_uuid()::text,'-',''),
        invite_expires_at=now()+interval '30 days' WHERE id=s.id;
    WHEN 'join' THEN NULL;
    WHEN 'claim' THEN
      IF s.state <> 'sharing' OR coalesce(p_payload->>'quantityUnits','') !~ '^[0-9]+$'
        OR (p_payload->>'quantityUnits')::numeric NOT BETWEEN 0 AND 3000000 THEN RAISE EXCEPTION 'split_invalid'; END IF;
      qty := (p_payload->>'quantityUnits')::bigint;
      SELECT * INTO i FROM receipt_split.items WHERE split_id=s.id AND id=(p_payload->>'itemId')::uuid;
      IF NOT FOUND OR i.kind <> 'item' OR i.total_minor <= 0 THEN RAISE EXCEPTION 'split_invalid'; END IF;
      IF jsonb_typeof(p_payload->'itemRevision') IS DISTINCT FROM 'number'
        OR coalesce(p_payload->>'itemRevision','') !~ '^[0-9]+$'
        OR (p_payload->>'itemRevision')::numeric <> i.item_revision THEN RAISE EXCEPTION 'split_conflict'; END IF;
      SELECT coalesce(sum(quantity_units),0),coalesce(max(quantity_units) FILTER(WHERE member_token=member),0)
        INTO used,mine FROM receipt_split.claims WHERE split_id=s.id AND item_id=i.id;
      -- Compare the caller's previous amount, but allow unrelated members to claim concurrently.
      IF coalesce(p_payload->>'previousUnits','') !~ '^[0-9]+$'
        OR (p_payload->>'previousUnits')::bigint <> mine OR used-mine+qty > i.quantity_units THEN RAISE EXCEPTION 'split_conflict'; END IF;
      IF qty=0 THEN DELETE FROM receipt_split.claims WHERE split_id=s.id AND item_id=i.id AND member_token=member;
      ELSE
        INSERT INTO receipt_split.claims(split_id,item_id,member_token,quantity_units) VALUES(s.id,i.id,member,qty)
          ON CONFLICT(split_id,item_id,member_token) DO UPDATE SET quantity_units=EXCLUDED.quantity_units;
      END IF;
      UPDATE receipt_split.splits SET version=version+1 WHERE id=s.id;
    WHEN 'save_review' THEN
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
    WHEN 'delete' THEN
      UPDATE receipt_split.splits SET state='deleting',invite_token=NULL,invite_expires_at=NULL WHERE id=s.id;
    WHEN 'delete_image' THEN
      IF s.image_path IS NULL OR s.state='deleting' THEN RAISE EXCEPTION 'split_conflict'; END IF;
      UPDATE receipt_split.splits SET image_deleting=true WHERE id=s.id;
    WHEN 'complete_delete' THEN
      IF p_payload->>'scope' = 'split' AND s.state IN ('deleting','deleted') THEN
        DELETE FROM receipt_split.claims WHERE split_id=s.id;
        DELETE FROM receipt_split.items WHERE split_id=s.id;
        DELETE FROM receipt_split.members WHERE split_id=s.id;
        UPDATE receipt_split.splits SET state='deleted',title='',total_minor=0,image_path=NULL,
          image_mime=NULL,image_size=NULL,image_deleted=true,image_deleting=false,version=version+1 WHERE id=s.id AND state='deleting';
      ELSIF p_payload->>'scope' = 'image' AND s.state NOT IN ('deleting','deleted') AND (s.image_deleting OR s.image_deleted) THEN
        UPDATE receipt_split.splits SET image_deleted=true,image_deleting=false,version=version+1 WHERE id=s.id AND image_deleting;
      ELSE RAISE EXCEPTION 'split_conflict';
      END IF;
    WHEN 'image_target' THEN
      IF s.image_path IS NULL OR s.image_deleted THEN RAISE EXCEPTION 'split_not_found'; END IF;
  END CASE;
  IF extraction IS NOT NULL THEN
    UPDATE receipt_split.splits SET title=btrim(extraction->>'title'),currency=extraction->>'currency',
      incurred_on=(extraction->>'incurred_on')::date,total_minor=(extraction->>'receipt_total_minor')::bigint,
      state='review',review_saved=(p_command='review'),version=version+1 WHERE id=s.id;
    -- Only private review can replace item IDs; shared items are immutable.
    DELETE FROM receipt_split.items WHERE split_id=s.id;
    n:=0;
    FOR item IN SELECT value FROM jsonb_array_elements(extraction->'items') LOOP
      n:=n+1;
      INSERT INTO receipt_split.items(split_id,ordinal,kind,description,original_description,explanation,explanation_needs_review,quantity_units,total_minor)
      VALUES(s.id,n,item->>'kind',btrim(item->>'description'),btrim(item->>'description'),
        coalesce(btrim(item->>'explanation'),''),coalesce((item->>'explanation_needs_review')::boolean,false),
        (item->>'quantity_units')::bigint,(item->>'total_minor')::bigint);
    END LOOP;
  END IF;
  -- Total mismatch is allowed. Arithmetic outside the exact JS money domain is not.
  IF abs((SELECT coalesce(sum(total_minor::numeric),0) FROM receipt_split.items WHERE split_id=s.id))>9007199254740991
    THEN RAISE EXCEPTION 'split_invalid'; END IF;
  IF EXISTS(SELECT 1 FROM receipt_split.splits WHERE id=s.id AND state='sharing')
    AND (SELECT coalesce(sum(total_minor::numeric),0) FROM receipt_split.items WHERE split_id=s.id)<0
    THEN RAISE EXCEPTION 'split_invalid'; END IF;
  result:=jsonb_build_object('id',s.id);
  IF p_command IN ('prepare_image','begin_extraction','image_target','delete_image','delete') THEN
    result:=result || jsonb_build_object('path',s.image_path,'mime',s.image_mime,'size',s.image_size);
  END IF;
  INSERT INTO receipt_split.requests(actor_id,request_id,command,split_id,payload_hash,result)
    VALUES(p_actor_id,p_request_id,'v2:' || p_command,p_split_id,sha256(convert_to(p_payload::text,'UTF8')),result);
  RETURN result;
END;
$fn$;
ALTER FUNCTION receipt_split.read_legacy_v1(uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION receipt_split.read_legacy_v1(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

ALTER FUNCTION receipt_split.command_legacy_v1(uuid,text,uuid,uuid,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION receipt_split.command_legacy_v1(uuid,text,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;

ALTER FUNCTION receipt_split.add_legacy_v1(uuid,uuid,uuid,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION receipt_split.add_legacy_v1(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;

ALTER FUNCTION receipt_split.guard_legacy_v1(uuid,uuid,uuid,text,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION receipt_split.guard_legacy_v1(uuid,uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;

ALTER FUNCTION public.receipt_split_read_v1(uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.receipt_split_read_v1(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.receipt_split_read_v1(uuid,uuid) TO service_role;
ALTER FUNCTION public.receipt_split_command_v1(uuid,text,uuid,uuid,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.receipt_split_command_v1(uuid,text,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.receipt_split_command_v1(uuid,text,uuid,uuid,jsonb) TO service_role;
ALTER FUNCTION public.receipt_split_add_item_v1(uuid,uuid,uuid,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.receipt_split_add_item_v1(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.receipt_split_add_item_v1(uuid,uuid,uuid,jsonb) TO service_role;
ALTER FUNCTION receipt_split.validate_v2(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION receipt_split.validate_v2(jsonb) FROM PUBLIC,anon,authenticated,service_role;

ALTER FUNCTION public.receipt_split_read_v2(uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.receipt_split_read_v2(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.receipt_split_read_v2(uuid,uuid) TO service_role;
ALTER FUNCTION receipt_split.validate_item_edit_v2(jsonb,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION receipt_split.validate_item_edit_v2(jsonb,text) FROM PUBLIC,anon,authenticated,service_role;

ALTER FUNCTION receipt_split.validate_command_v2(text,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION receipt_split.validate_command_v2(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;

ALTER FUNCTION public.receipt_split_command_v2(uuid,text,uuid,uuid,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.receipt_split_command_v2(uuid,text,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.receipt_split_command_v2(uuid,text,uuid,uuid,jsonb) TO service_role;
DO $seal$
DECLARE fingerprint text;
BEGIN
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
) SELECT value INTO fingerprint FROM digest;
 EXECUTE format('COMMENT ON SCHEMA receipt_split IS %L','SQL184:v2:' || fingerprint);
END;
$seal$;
COMMIT;
