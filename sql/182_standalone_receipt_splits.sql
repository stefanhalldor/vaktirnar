-- SQL182 MIGRATION: standalone account-only receipt splitting; no Expense writes.
-- Stebbi runs SQL. Apply only after the matching catalog preflight is READY.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = '';

-- Fail closed on an installed/partial namespace. Never overwrite unknown objects.
DO $guard$
DECLARE readiness record;
BEGIN
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
INTO readiness FROM gates;

  IF readiness.operator_state <> 'READY' THEN
    RAISE EXCEPTION 'sql182_preflight_not_ready';
  END IF;
END;
$guard$;

CREATE SCHEMA receipt_split AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA receipt_split FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA receipt_split REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE TABLE receipt_split.splits (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES auth.users(id),
  state text NOT NULL CHECK (state IN ('uploading','extracting','review','sharing','deleting','deleted')),
  version bigint NOT NULL DEFAULT 1 CHECK (version BETWEEN 1 AND 9007199254740991),
  review_saved boolean NOT NULL DEFAULT false,
  title text NOT NULL DEFAULT '' CHECK (length(title) <= 200),
  currency text NOT NULL DEFAULT 'ISK' CHECK (currency IN ('ISK','EUR','USD','GBP','DKK','NOK','SEK')),
  incurred_on date NOT NULL DEFAULT CURRENT_DATE,
  total_minor bigint NOT NULL DEFAULT 0 CHECK (total_minor BETWEEN 0 AND 9007199254740991),
  invite_token text UNIQUE,
  invite_expires_at timestamptz,
  image_path text UNIQUE,
  image_mime text CHECK (image_mime IN ('image/jpeg','image/png','image/webp')),
  image_size integer CHECK (image_size BETWEEN 1 AND 10485760),
  image_deleted boolean NOT NULL DEFAULT false,
  image_deleting boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((image_path IS NULL) = (image_mime IS NULL)),
  CHECK ((image_path IS NULL) = (image_size IS NULL)),
  CHECK ((invite_token IS NULL) = (invite_expires_at IS NULL))
);
CREATE TABLE receipt_split.members (
  split_id uuid NOT NULL REFERENCES receipt_split.splits(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  display_name text CHECK (display_name IS NULL OR (length(btrim(display_name)) BETWEEN 1 AND 120 AND position('@' IN display_name) = 0)),
  PRIMARY KEY (split_id,user_id),
  UNIQUE (split_id,token)
);
CREATE TABLE receipt_split.items (
  split_id uuid NOT NULL REFERENCES receipt_split.splits(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ordinal integer NOT NULL CHECK (ordinal BETWEEN 1 AND 100),
  kind text NOT NULL CHECK (kind IN ('item','discount','tax','tip')),
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 200),
  quantity_milli bigint NOT NULL CHECK (quantity_milli BETWEEN 1 AND 1000000),
  total_minor bigint NOT NULL CHECK (total_minor BETWEEN -9007199254740991 AND 9007199254740991),
  PRIMARY KEY (split_id,id),
  UNIQUE (split_id,ordinal),
  CHECK (kind <> 'item' OR total_minor >= 0),
  CHECK (kind = 'item' OR quantity_milli = 1000)
);
CREATE TABLE receipt_split.claims (
  split_id uuid NOT NULL,
  item_id uuid NOT NULL,
  member_token uuid NOT NULL,
  quantity_milli bigint NOT NULL CHECK (quantity_milli BETWEEN 1 AND 1000000),
  PRIMARY KEY (split_id,item_id,member_token),
  FOREIGN KEY (split_id,item_id) REFERENCES receipt_split.items(split_id,id),
  FOREIGN KEY (split_id,member_token) REFERENCES receipt_split.members(split_id,token)
);
CREATE TABLE receipt_split.requests (
  actor_id uuid NOT NULL,
  request_id uuid NOT NULL,
  command text NOT NULL,
  split_id uuid,
  payload_hash bytea NOT NULL,
  result jsonb NOT NULL,
  PRIMARY KEY(actor_id,request_id)
);
ALTER TABLE receipt_split.splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_split.splits FORCE ROW LEVEL SECURITY;
ALTER TABLE receipt_split.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_split.members FORCE ROW LEVEL SECURITY;
ALTER TABLE receipt_split.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_split.items FORCE ROW LEVEL SECURITY;
ALTER TABLE receipt_split.claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_split.claims FORCE ROW LEVEL SECURITY;
ALTER TABLE receipt_split.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_split.requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA receipt_split FROM PUBLIC, anon, authenticated, service_role;

-- Strict independent validator, including JSON types, required keys and valid dates.
CREATE FUNCTION receipt_split.validate(p jsonb) RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $fn$
DECLARE i jsonb; d date;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object'
    OR p - ARRAY['title','currency','incurred_on','receipt_total_minor','items'] <> '{}'::jsonb
    OR NOT (p ?& ARRAY['title','currency','incurred_on','receipt_total_minor','items'])
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
      OR i - ARRAY['kind','description','quantity_milli','total_minor','confidence_basis_points','needs_review'] <> '{}'::jsonb
      OR NOT (i ?& ARRAY['kind','description','quantity_milli','total_minor','confidence_basis_points','needs_review'])
      OR i->>'kind' NOT IN ('item','discount','tax','tip')
      OR jsonb_typeof(i->'kind') <> 'string'
      OR jsonb_typeof(i->'description') <> 'string'
      OR length(btrim(i->>'description')) NOT BETWEEN 1 AND 200
      OR jsonb_typeof(i->'quantity_milli') <> 'number'
      OR i->>'quantity_milli' !~ '^[0-9]+$'
      OR (i->>'quantity_milli')::numeric NOT BETWEEN 1 AND 1000000
      OR (i->>'kind' <> 'item' AND (i->>'quantity_milli')::numeric <> 1000)
      OR jsonb_typeof(i->'total_minor') <> 'number'
      OR i->>'total_minor' !~ '^-?[0-9]+$'
      OR abs((i->>'total_minor')::numeric) > 9007199254740991
      OR (i->>'kind' = 'item' AND (i->>'total_minor')::numeric < 0)
      OR jsonb_typeof(i->'confidence_basis_points') <> 'number'
      OR i->>'confidence_basis_points' !~ '^[0-9]+$'
      OR (i->>'confidence_basis_points')::numeric NOT BETWEEN 0 AND 10000
      OR jsonb_typeof(i->'needs_review') <> 'boolean'
      OR EXISTS (SELECT 1 FROM jsonb_each(i) e WHERE e.value = 'null'::jsonb) THEN
      RAISE EXCEPTION 'split_invalid';
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM jsonb_each(p) e WHERE e.value = 'null'::jsonb) THEN RAISE EXCEPTION 'split_invalid'; END IF;
END;
$fn$;

CREATE FUNCTION receipt_split.assert_actor(p_actor uuid) RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $fn$
BEGIN
  -- Only service_role can execute the public boundary. Its actor comes from
  -- auth.getUser() in the server action, never a client-supplied user ID.
  IF p_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = p_actor AND email IS NOT NULL
      AND email_confirmed_at IS NOT NULL AND deleted_at IS NULL
      AND (banned_until IS NULL OR banned_until <= now())
  ) THEN RAISE EXCEPTION 'split_not_allowed'; END IF;
END;
$fn$;

CREATE FUNCTION public.receipt_split_read_v1(p_actor_id uuid,p_split_id uuid)
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

CREATE FUNCTION public.receipt_split_command_v1(
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

ALTER FUNCTION public.receipt_split_read_v1(uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.receipt_split_command_v1(uuid,text,uuid,uuid,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.receipt_split_read_v1(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.receipt_split_command_v1(uuid,text,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.receipt_split_read_v1(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.receipt_split_command_v1(uuid,text,uuid,uuid,jsonb) TO service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA receipt_split FROM PUBLIC,anon,authenticated,service_role;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('bill-split-receipts','bill-split-receipts',false,10485760,ARRAY['image/jpeg','image/png','image/webp']);
-- Restrictive AND policy prevents unrelated broad permissive storage policies
-- from exposing this bucket. Other buckets keep their existing behavior.
CREATE POLICY receipt_split_private_bucket ON storage.objects AS RESTRICTIVE
FOR ALL TO anon,authenticated
USING (bucket_id <> 'bill-split-receipts')
WITH CHECK (bucket_id <> 'bill-split-receipts');
-- No client storage policies or table grants. Upload/download use bounded
-- signed URLs issued only after an owner-authorized command.
-- BEGIN GENERATED SQL182 SEAL
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
)

  SELECT value INTO fingerprint FROM digest;
  EXECUTE format('COMMENT ON SCHEMA receipt_split IS %L','SQL182:v1:' || fingerprint);
END;
$seal$;
-- END GENERATED SQL182 SEAL
COMMIT;
