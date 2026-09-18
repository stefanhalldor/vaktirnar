-- SQL192 MIGRATION: participant-created Split items and restaurant menu/order foundation.
-- SOURCE ARTIFACT ONLY. Stebbi runs this manually after the matching preflight returns READY.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = '';

DO $guard$
DECLARE feature_check text;
BEGIN
  IF current_user <> 'postgres'
    OR pg_catalog.to_regclass('receipt_split.members') IS NULL
    OR pg_catalog.to_regclass('receipt_split.items') IS NULL
    OR pg_catalog.to_regclass('receipt_split.claims') IS NULL
    OR pg_catalog.to_regclass('receipt_split.requests') IS NULL
    OR pg_catalog.to_regclass('public.business_profiles') IS NULL
    OR pg_catalog.to_regclass('public.feature_access') IS NULL
    OR pg_catalog.to_regprocedure('public.receipt_split_read_v2(uuid,uuid)') IS NULL
    OR pg_catalog.to_regprocedure('public.receipt_split_command_v2(uuid,text,uuid,uuid,jsonb)') IS NULL
    OR pg_catalog.to_regclass('public.restaurant_capabilities') IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM pg_catalog.pg_attribute
      WHERE attrelid IN ('receipt_split.members'::regclass,'receipt_split.items'::regclass)
        AND attname IN ('status','created_by_user_id','created_by_member_token','source_kind','cancelled_at')
        AND NOT attisdropped
    )
  THEN RAISE EXCEPTION 'SQL192 prerequisite mismatch; stop'; END IF;

  SELECT pg_catalog.pg_get_constraintdef(oid) INTO feature_check
  FROM pg_catalog.pg_constraint
  WHERE conrelid='public.feature_access'::regclass
    AND conname='feature_access_feature_key_check';
  IF feature_check IS NULL THEN RAISE EXCEPTION 'SQL192 feature key constraint missing; stop'; END IF;
END;
$guard$;

DO $feature_keys$
DECLARE definition text;
BEGIN
  SELECT pg_catalog.pg_get_expr(conbin,conrelid) INTO definition
  FROM pg_catalog.pg_constraint
  WHERE conrelid='public.feature_access'::regclass
    AND conname='feature_access_feature_key_check';
  IF pg_catalog.strpos(definition,'''veitingastadir''')=0
    OR pg_catalog.strpos(definition,'''veitingastadir_starfsfolk''')=0
    OR pg_catalog.strpos(definition,'''veitingastadir_gestir''')=0
  THEN
    ALTER TABLE public.feature_access DROP CONSTRAINT feature_access_feature_key_check;
    EXECUTE pg_catalog.format(
      'ALTER TABLE public.feature_access ADD CONSTRAINT feature_access_feature_key_check CHECK ((%s) OR feature_key IN (%L,%L,%L))',
      definition,
      'veitingastadir','veitingastadir_starfsfolk','veitingastadir_gestir'
    );
  END IF;
END;
$feature_keys$;

ALTER TABLE receipt_split.members
  ADD COLUMN status text NOT NULL DEFAULT 'active',
  ADD COLUMN revoked_at timestamptz,
  ADD COLUMN revoked_by uuid REFERENCES auth.users(id);
ALTER TABLE receipt_split.members
  ADD CONSTRAINT members_status_chk CHECK(status IN ('active','revoked')),
  ADD CONSTRAINT members_revocation_chk CHECK(
    (status='active' AND revoked_at IS NULL AND revoked_by IS NULL)
    OR (status='revoked' AND revoked_at IS NOT NULL AND revoked_by IS NOT NULL)
  );

ALTER TABLE receipt_split.items
  ADD COLUMN created_by_user_id uuid REFERENCES auth.users(id),
  ADD COLUMN created_by_member_token uuid,
  ADD COLUMN source_kind text NOT NULL DEFAULT 'legacy',
  ADD COLUMN cancelled_at timestamptz,
  ADD COLUMN cancelled_by_user_id uuid REFERENCES auth.users(id);
ALTER TABLE receipt_split.items
  ADD CONSTRAINT items_creator_member_fk
    FOREIGN KEY(split_id,created_by_member_token)
    REFERENCES receipt_split.members(split_id,token),
  ADD CONSTRAINT items_source_kind_chk
    CHECK(source_kind IN ('legacy','manual','restaurant_menu')),
  ADD CONSTRAINT items_creator_pair_chk CHECK(
    (created_by_user_id IS NULL AND created_by_member_token IS NULL AND source_kind='legacy')
    OR (created_by_user_id IS NOT NULL AND created_by_member_token IS NOT NULL AND source_kind<>'legacy')
  ),
  ADD CONSTRAINT items_cancellation_pair_chk CHECK(
    (cancelled_at IS NULL)=(cancelled_by_user_id IS NULL)
  );
CREATE INDEX receipt_split_items_creator_idx
  ON receipt_split.items(split_id,created_by_member_token)
  WHERE created_by_member_token IS NOT NULL;

CREATE FUNCTION receipt_split.guard_item_provenance()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $fn$
BEGIN
  IF TG_OP='UPDATE' AND (
    NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
    OR NEW.created_by_member_token IS DISTINCT FROM OLD.created_by_member_token
    OR NEW.source_kind IS DISTINCT FROM OLD.source_kind
  ) THEN RAISE EXCEPTION 'split_creator_immutable'; END IF;
  RETURN NEW;
END;
$fn$;
CREATE TRIGGER receipt_split_item_provenance_immutable
BEFORE UPDATE ON receipt_split.items
FOR EACH ROW EXECUTE FUNCTION receipt_split.guard_item_provenance();

CREATE FUNCTION public.receipt_split_participant_add_item_v1(
  p_actor_id uuid,p_request_id uuid,p_split_id uuid,p_expected_version bigint,p_payload jsonb
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE s receipt_split.splits%ROWTYPE; m receipt_split.members%ROWTYPE;
  r receipt_split.requests%ROWTYPE; next_ordinal integer; new_item uuid;
  payload_hash bytea; result jsonb; initial_claim bigint;
BEGIN
  PERFORM receipt_split.assert_actor(p_actor_id);
  IF p_request_id IS NULL OR p_split_id IS NULL OR p_expected_version IS NULL
    OR p_expected_version<1 OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object'
    OR p_payload-ARRAY['description','explanation','quantityUnits','totalMinor','sourceKind','initialClaimUnits']<>'{}'::jsonb
    OR NOT(p_payload?&ARRAY['description','explanation','quantityUnits','totalMinor','sourceKind','initialClaimUnits'])
    OR jsonb_typeof(p_payload->'description')<>'string'
    OR length(btrim(p_payload->>'description')) NOT BETWEEN 1 AND 200
    OR jsonb_typeof(p_payload->'explanation')<>'string'
    OR length(btrim(p_payload->>'explanation'))>240
    OR coalesce(p_payload->>'quantityUnits','')!~'^[0-9]+$'
    OR (p_payload->>'quantityUnits')::numeric NOT BETWEEN 1 AND 3000000
    OR coalesce(p_payload->>'totalMinor','')!~'^[0-9]+$'
    OR (p_payload->>'totalMinor')::numeric>9007199254740991
    OR p_payload->>'sourceKind' NOT IN ('manual','restaurant_menu')
    OR coalesce(p_payload->>'initialClaimUnits','')!~'^[0-9]+$'
    OR (p_payload->>'initialClaimUnits')::numeric>(p_payload->>'quantityUnits')::numeric
  THEN RAISE EXCEPTION 'split_invalid'; END IF;
  payload_hash:=sha256(convert_to(
    jsonb_build_object('expectedVersion',p_expected_version,'payload',p_payload)::text,'UTF8'));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor_id::text||p_request_id::text,0));
  SELECT * INTO r FROM receipt_split.requests
    WHERE actor_id=p_actor_id AND request_id=p_request_id;
  IF FOUND THEN
    IF r.command<>'participant_add_item:v1' OR r.split_id IS DISTINCT FROM p_split_id
      OR r.payload_hash<>payload_hash THEN RAISE EXCEPTION 'split_conflict'; END IF;
    RETURN r.result;
  END IF;
  SELECT * INTO s FROM receipt_split.splits WHERE id=p_split_id FOR UPDATE;
  IF NOT FOUND OR s.state<>'sharing' OR s.version<>p_expected_version
    THEN RAISE EXCEPTION 'split_conflict'; END IF;
  SELECT * INTO m FROM receipt_split.members
    WHERE split_id=s.id AND user_id=p_actor_id AND status='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'split_not_found'; END IF;
  SELECT coalesce(max(ordinal),0)+1 INTO next_ordinal
    FROM receipt_split.items WHERE split_id=s.id;
  IF next_ordinal>100 THEN RAISE EXCEPTION 'split_invalid'; END IF;
  INSERT INTO receipt_split.items(
    split_id,ordinal,kind,description,original_description,explanation,
    quantity_units,total_minor,created_by_user_id,created_by_member_token,source_kind
  ) VALUES(
    s.id,next_ordinal,'item',btrim(p_payload->>'description'),btrim(p_payload->>'description'),
    btrim(p_payload->>'explanation'),(p_payload->>'quantityUnits')::bigint,
    (p_payload->>'totalMinor')::bigint,p_actor_id,m.token,p_payload->>'sourceKind'
  ) RETURNING id INTO new_item;
  initial_claim:=(p_payload->>'initialClaimUnits')::bigint;
  IF initial_claim>0 THEN
    INSERT INTO receipt_split.claims(
      split_id,item_id,member_token,quantity_units,input_mode,
      fraction_numerator,fraction_denominator
    ) VALUES(s.id,new_item,m.token,initial_claim,'quantity',NULL,NULL);
  END IF;
  UPDATE receipt_split.splits SET version=version+1,review_saved=false WHERE id=s.id;
  result:=jsonb_build_object('id',s.id,'itemId',new_item,'itemRevision',1,'splitVersion',s.version+1);
  INSERT INTO receipt_split.requests(actor_id,request_id,command,split_id,payload_hash,result)
    VALUES(p_actor_id,p_request_id,'participant_add_item:v1',s.id,payload_hash,result);
  RETURN result;
END;
$fn$;

CREATE FUNCTION public.receipt_split_participant_edit_item_v1(
  p_actor_id uuid,p_request_id uuid,p_split_id uuid,p_expected_version bigint,p_payload jsonb
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE s receipt_split.splits%ROWTYPE; m receipt_split.members%ROWTYPE;
  i receipt_split.items%ROWTYPE; r receipt_split.requests%ROWTYPE;
  used bigint; payload_hash bytea; result jsonb;
BEGIN
  PERFORM receipt_split.assert_actor(p_actor_id);
  IF p_request_id IS NULL OR p_split_id IS NULL OR p_expected_version IS NULL
    OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object'
    OR p_payload-ARRAY['itemId','itemRevision','description','explanation','quantityUnits','totalMinor']<>'{}'::jsonb
    OR NOT(p_payload?&ARRAY['itemId','itemRevision','description','explanation','quantityUnits','totalMinor'])
  THEN RAISE EXCEPTION 'split_invalid'; END IF;
  payload_hash:=sha256(convert_to(jsonb_build_object('expectedVersion',p_expected_version,'payload',p_payload)::text,'UTF8'));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor_id::text||p_request_id::text,0));
  SELECT * INTO r FROM receipt_split.requests WHERE actor_id=p_actor_id AND request_id=p_request_id;
  IF FOUND THEN
    IF r.command<>'participant_edit_item:v1' OR r.split_id IS DISTINCT FROM p_split_id OR r.payload_hash<>payload_hash
      THEN RAISE EXCEPTION 'split_conflict'; END IF;
    RETURN r.result;
  END IF;
  SELECT * INTO s FROM receipt_split.splits WHERE id=p_split_id FOR UPDATE;
  IF NOT FOUND OR s.state<>'sharing' OR s.version<>p_expected_version THEN RAISE EXCEPTION 'split_conflict'; END IF;
  SELECT * INTO m FROM receipt_split.members WHERE split_id=s.id AND user_id=p_actor_id AND status='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'split_not_found'; END IF;
  SELECT * INTO i FROM receipt_split.items WHERE split_id=s.id AND id=(p_payload->>'itemId')::uuid AND cancelled_at IS NULL;
  IF NOT FOUND OR (i.source_kind='legacy' AND s.owner_id<>p_actor_id)
    OR (i.source_kind<>'legacy' AND (i.created_by_user_id<>p_actor_id OR i.created_by_member_token<>m.token))
    THEN RAISE EXCEPTION 'split_not_allowed'; END IF;
  IF i.source_kind='restaurant_menu' THEN RAISE EXCEPTION 'split_not_allowed'; END IF;
  IF (p_payload->>'itemRevision')::bigint<>i.item_revision THEN RAISE EXCEPTION 'split_conflict'; END IF;
  PERFORM receipt_split.validate_item_edit_v2(p_payload,'item');
  SELECT coalesce(sum(quantity_units),0) INTO used FROM receipt_split.claims WHERE split_id=s.id AND item_id=i.id;
  IF (p_payload->>'quantityUnits')::bigint<used THEN RAISE EXCEPTION 'split_quantity_claimed'; END IF;
  IF (p_payload->>'totalMinor')::bigint=0 AND used>0 THEN RAISE EXCEPTION 'split_return_claims_first'; END IF;
  UPDATE receipt_split.items SET description=btrim(p_payload->>'description'),
    explanation=btrim(p_payload->>'explanation'),quantity_units=(p_payload->>'quantityUnits')::bigint,
    total_minor=(p_payload->>'totalMinor')::bigint,item_revision=item_revision+1
    WHERE split_id=s.id AND id=i.id;
  UPDATE receipt_split.splits SET version=version+1,review_saved=false WHERE id=s.id;
  result:=jsonb_build_object('id',s.id,'itemId',i.id,'itemRevision',i.item_revision+1,'splitVersion',s.version+1);
  INSERT INTO receipt_split.requests VALUES(p_actor_id,p_request_id,'participant_edit_item:v1',s.id,payload_hash,result);
  RETURN result;
END;
$fn$;

CREATE FUNCTION public.receipt_split_participant_cancel_item_v1(
  p_actor_id uuid,p_request_id uuid,p_split_id uuid,p_item_id uuid,
  p_item_revision bigint,p_expected_version bigint
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE s receipt_split.splits%ROWTYPE; m receipt_split.members%ROWTYPE;
  i receipt_split.items%ROWTYPE; r receipt_split.requests%ROWTYPE;
  payload_hash bytea; result jsonb; operational_locked boolean;
BEGIN
  PERFORM receipt_split.assert_actor(p_actor_id);
  IF p_request_id IS NULL OR p_split_id IS NULL OR p_item_id IS NULL
    OR p_item_revision<1 OR p_expected_version<1 THEN RAISE EXCEPTION 'split_invalid'; END IF;
  payload_hash:=sha256(convert_to(jsonb_build_object('itemId',p_item_id,'itemRevision',p_item_revision,'expectedVersion',p_expected_version)::text,'UTF8'));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor_id::text||p_request_id::text,0));
  SELECT * INTO r FROM receipt_split.requests WHERE actor_id=p_actor_id AND request_id=p_request_id;
  IF FOUND THEN
    IF r.command<>'participant_cancel_item:v1' OR r.split_id IS DISTINCT FROM p_split_id OR r.payload_hash<>payload_hash
      THEN RAISE EXCEPTION 'split_conflict'; END IF;
    RETURN r.result;
  END IF;
  SELECT * INTO s FROM receipt_split.splits WHERE id=p_split_id FOR UPDATE;
  IF NOT FOUND OR s.state<>'sharing' OR s.version<>p_expected_version THEN RAISE EXCEPTION 'split_conflict'; END IF;
  SELECT * INTO m FROM receipt_split.members WHERE split_id=s.id AND user_id=p_actor_id AND status='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'split_not_found'; END IF;
  SELECT * INTO i FROM receipt_split.items WHERE split_id=s.id AND id=p_item_id FOR UPDATE;
  IF NOT FOUND OR i.cancelled_at IS NOT NULL OR i.item_revision<>p_item_revision
    THEN RAISE EXCEPTION 'split_conflict'; END IF;
  IF (i.source_kind='legacy' AND s.owner_id<>p_actor_id)
    OR (i.source_kind<>'legacy' AND (i.created_by_user_id<>p_actor_id OR i.created_by_member_token<>m.token))
    THEN RAISE EXCEPTION 'split_not_allowed'; END IF;
  EXECUTE 'SELECT EXISTS(SELECT 1 FROM public.restaurant_split_items
    WHERE split_id=$1 AND item_id=$2 AND status<>''nytt'')'
    INTO operational_locked USING s.id,i.id;
  IF operational_locked THEN RAISE EXCEPTION 'split_return_claims_first'; END IF;
  IF EXISTS(SELECT 1 FROM receipt_split.claims WHERE split_id=s.id AND item_id=i.id AND member_token<>m.token)
    THEN RAISE EXCEPTION 'split_return_claims_first'; END IF;
  DELETE FROM receipt_split.claims WHERE split_id=s.id AND item_id=i.id AND member_token=m.token;
  EXECUTE 'DELETE FROM public.restaurant_split_items WHERE split_id=$1 AND item_id=$2' USING s.id,i.id;
  UPDATE receipt_split.items SET cancelled_at=now(),cancelled_by_user_id=p_actor_id,item_revision=item_revision+1
    WHERE split_id=s.id AND id=i.id;
  UPDATE receipt_split.splits SET version=version+1,review_saved=false WHERE id=s.id;
  result:=jsonb_build_object('id',s.id,'itemId',i.id,'itemRevision',i.item_revision+1,'splitVersion',s.version+1);
  INSERT INTO receipt_split.requests VALUES(p_actor_id,p_request_id,'participant_cancel_item:v1',s.id,payload_hash,result);
  RETURN result;
END;
$fn$;

CREATE TABLE public.restaurant_capabilities (
  space_id uuid NOT NULL,
  business_profile_id uuid NOT NULL,
  revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(space_id,business_profile_id),
  FOREIGN KEY(space_id,business_profile_id)
    REFERENCES public.business_profiles(space_id,id) ON DELETE CASCADE
);
CREATE TABLE public.restaurant_staff_memberships (
  space_id uuid NOT NULL,
  business_profile_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  role text NOT NULL CHECK(role IN ('menu_editor','menu_publisher','floor_staff','order_viewer')),
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
  revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
  PRIMARY KEY(space_id,business_profile_id,user_id,role),
  FOREIGN KEY(space_id,business_profile_id)
    REFERENCES public.restaurant_capabilities(space_id,business_profile_id) ON DELETE CASCADE
);
CREATE TABLE public.restaurant_venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL,
  business_profile_id uuid NOT NULL,
  slug text NOT NULL UNIQUE CHECK(slug~'^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  display_name text NOT NULL CHECK(length(btrim(display_name)) BETWEEN 1 AND 120),
  timezone text NOT NULL DEFAULT 'Atlantic/Reykjavik',
  active boolean NOT NULL DEFAULT true,
  revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
  FOREIGN KEY(space_id,business_profile_id)
    REFERENCES public.restaurant_capabilities(space_id,business_profile_id) ON DELETE CASCADE
);
CREATE TABLE public.restaurant_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.restaurant_venues(id) ON DELETE CASCADE,
  label text NOT NULL CHECK(length(btrim(label)) BETWEEN 1 AND 40),
  active boolean NOT NULL DEFAULT true,
  revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
  UNIQUE(venue_id,label)
);
CREATE TABLE public.restaurant_menus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.restaurant_venues(id) ON DELETE CASCADE,
  title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 120),
  currency text NOT NULL CHECK(currency IN ('ISK','EUR','USD','GBP','DKK','NOK','SEK')),
  active_version integer,
  revision bigint NOT NULL DEFAULT 1 CHECK(revision>0)
);
CREATE TABLE public.restaurant_menu_versions (
  menu_id uuid NOT NULL REFERENCES public.restaurant_menus(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK(version>0),
  published_at timestamptz NOT NULL DEFAULT now(),
  published_by uuid NOT NULL REFERENCES auth.users(id),
  PRIMARY KEY(menu_id,version)
);
CREATE TABLE public.restaurant_menu_items (
  menu_id uuid NOT NULL,
  menu_version integer NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 500),
  name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),
  description text NOT NULL DEFAULT '' CHECK(length(description)<=1000),
  price_minor bigint NOT NULL CHECK(price_minor BETWEEN 0 AND 9007199254740991),
  available boolean NOT NULL DEFAULT true,
  modifiers jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(modifiers)='array'),
  PRIMARY KEY(menu_id,menu_version,id),
  FOREIGN KEY(menu_id,menu_version)
    REFERENCES public.restaurant_menu_versions(menu_id,version) ON DELETE CASCADE,
  UNIQUE(menu_id,menu_version,ordinal)
);
ALTER TABLE public.restaurant_menus ADD CONSTRAINT restaurant_menus_active_version_fk
  FOREIGN KEY(id,active_version) REFERENCES public.restaurant_menu_versions(menu_id,version);
CREATE TABLE public.restaurant_table_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL REFERENCES public.restaurant_tables(id),
  menu_id uuid NOT NULL,
  menu_version integer NOT NULL,
  split_id uuid REFERENCES receipt_split.splits(id),
  state text NOT NULL DEFAULT 'open' CHECK(state IN ('open','closing','closed')),
  qr_token_hash bytea NOT NULL UNIQUE,
  revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  FOREIGN KEY(menu_id,menu_version)
    REFERENCES public.restaurant_menu_versions(menu_id,version)
);
CREATE UNIQUE INDEX restaurant_one_open_table_session_idx
  ON public.restaurant_table_sessions(table_id) WHERE state='open';
CREATE UNIQUE INDEX restaurant_one_active_split_binding_idx
  ON public.restaurant_table_sessions(split_id) WHERE split_id IS NOT NULL AND state<>'closed';
CREATE TABLE public.restaurant_preorder_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.restaurant_venues(id),
  split_id uuid NOT NULL UNIQUE REFERENCES receipt_split.splits(id),
  arrival_at timestamptz NOT NULL,
  party_size integer NOT NULL CHECK(party_size BETWEEN 1 AND 100),
  state text NOT NULL DEFAULT 'planned' CHECK(state IN ('planned','arrived','cancelled','no_show')),
  table_session_id uuid UNIQUE REFERENCES public.restaurant_table_sessions(id),
  revision bigint NOT NULL DEFAULT 1 CHECK(revision>0)
);
CREATE TABLE public.restaurant_split_items (
  split_id uuid NOT NULL,
  item_id uuid NOT NULL,
  venue_id uuid NOT NULL REFERENCES public.restaurant_venues(id),
  table_session_id uuid REFERENCES public.restaurant_table_sessions(id),
  menu_id uuid NOT NULL,
  menu_version integer NOT NULL,
  menu_item_id uuid NOT NULL,
  name_snapshot text NOT NULL,
  unit_price_minor bigint NOT NULL,
  currency text NOT NULL,
  quantity_units bigint NOT NULL,
  modifiers_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  service_note text NOT NULL DEFAULT '' CHECK(length(service_note)<=500),
  status text NOT NULL DEFAULT 'nytt' CHECK(status IN ('nytt','i_vinnslu','afgreitt')),
  status_revision bigint NOT NULL DEFAULT 1 CHECK(status_revision>0),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(split_id,item_id),
  FOREIGN KEY(split_id,item_id) REFERENCES receipt_split.items(split_id,id),
  FOREIGN KEY(menu_id,menu_version,menu_item_id)
    REFERENCES public.restaurant_menu_items(menu_id,menu_version,id)
);
CREATE TABLE public.restaurant_requests (
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  request_id uuid NOT NULL,
  command text NOT NULL,
  split_id uuid REFERENCES receipt_split.splits(id),
  payload_hash bytea NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(actor_id,request_id)
);

ALTER TABLE public.restaurant_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_capabilities FORCE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_staff_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_staff_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_venues FORCE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_tables FORCE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_menus FORCE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_menu_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_menu_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_menu_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_table_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_table_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_preorder_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_preorder_visits FORCE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_split_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_split_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.restaurant_capabilities,public.restaurant_staff_memberships,
  public.restaurant_venues,public.restaurant_tables,public.restaurant_menus,
  public.restaurant_menu_versions,public.restaurant_menu_items,
  public.restaurant_table_sessions,public.restaurant_preorder_visits,
  public.restaurant_split_items,public.restaurant_requests FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.restaurant_assert_owner_v1(
  p_actor_id uuid,p_space_id uuid,p_business_profile_id uuid
) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
  PERFORM receipt_split.assert_actor(p_actor_id);
  IF NOT EXISTS(
    SELECT 1 FROM auth.users account
    JOIN public.feature_access entitlement
      ON entitlement.email=lower(btrim(account.email))
      AND entitlement.feature_key='veitingastadir'
    JOIN public.space_members membership
      ON membership.user_id=account.id AND membership.space_id=p_space_id
      AND membership.role='owner'
    JOIN public.business_profiles profile
      ON profile.space_id=membership.space_id AND profile.id=p_business_profile_id
      AND profile.archived_at IS NULL
    WHERE account.id=p_actor_id
  ) THEN RAISE EXCEPTION 'restaurant_not_found'; END IF;
END;
$fn$;

CREATE FUNCTION public.restaurant_enable_capability_v1(
  p_actor_id uuid,p_space_id uuid,p_business_profile_id uuid
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
  PERFORM public.restaurant_assert_owner_v1(p_actor_id,p_space_id,p_business_profile_id);
  INSERT INTO public.restaurant_capabilities(space_id,business_profile_id)
    VALUES(p_space_id,p_business_profile_id)
    ON CONFLICT(space_id,business_profile_id) DO UPDATE
      SET active=true,revision=public.restaurant_capabilities.revision+1,updated_at=now();
  RETURN jsonb_build_object('spaceId',p_space_id,'businessProfileId',p_business_profile_id);
END;
$fn$;

CREATE FUNCTION public.restaurant_set_staff_v1(
  p_actor_id uuid,p_space_id uuid,p_business_profile_id uuid,p_staff_user_id uuid,
  p_role text,p_active boolean
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
  PERFORM public.restaurant_assert_owner_v1(p_actor_id,p_space_id,p_business_profile_id);
  IF p_staff_user_id IS NULL OR p_role NOT IN ('menu_editor','menu_publisher','floor_staff','order_viewer')
    THEN RAISE EXCEPTION 'restaurant_invalid'; END IF;
  INSERT INTO public.restaurant_staff_memberships(space_id,business_profile_id,user_id,role,status)
    VALUES(p_space_id,p_business_profile_id,p_staff_user_id,p_role,CASE WHEN p_active THEN 'active' ELSE 'revoked' END)
    ON CONFLICT(space_id,business_profile_id,user_id,role) DO UPDATE
      SET status=excluded.status,revision=public.restaurant_staff_memberships.revision+1;
  RETURN jsonb_build_object('userId',p_staff_user_id,'role',p_role,'active',p_active);
END;
$fn$;

CREATE FUNCTION public.restaurant_upsert_venue_v1(
  p_actor_id uuid,p_space_id uuid,p_business_profile_id uuid,p_venue_id uuid,
  p_expected_revision bigint,p_slug text,p_display_name text,p_timezone text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE venue public.restaurant_venues%ROWTYPE; result_id uuid;
BEGIN
  PERFORM public.restaurant_assert_owner_v1(p_actor_id,p_space_id,p_business_profile_id);
  IF p_slug!~'^[a-z0-9]+(?:-[a-z0-9]+)*$' OR length(btrim(p_display_name)) NOT BETWEEN 1 AND 120
    OR length(btrim(p_timezone)) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'restaurant_invalid'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.restaurant_capabilities
    WHERE space_id=p_space_id AND business_profile_id=p_business_profile_id AND active)
    THEN RAISE EXCEPTION 'restaurant_not_found'; END IF;
  IF p_venue_id IS NULL THEN
    INSERT INTO public.restaurant_venues(space_id,business_profile_id,slug,display_name,timezone)
      VALUES(p_space_id,p_business_profile_id,p_slug,btrim(p_display_name),btrim(p_timezone)) RETURNING id INTO result_id;
  ELSE
    SELECT * INTO venue FROM public.restaurant_venues WHERE id=p_venue_id
      AND space_id=p_space_id AND business_profile_id=p_business_profile_id FOR UPDATE;
    IF NOT FOUND OR venue.revision<>p_expected_revision THEN RAISE EXCEPTION 'restaurant_conflict'; END IF;
    UPDATE public.restaurant_venues SET slug=p_slug,display_name=btrim(p_display_name),timezone=btrim(p_timezone),revision=revision+1
      WHERE id=venue.id RETURNING id INTO result_id;
  END IF;
  RETURN jsonb_build_object('venueId',result_id);
END;
$fn$;

CREATE FUNCTION public.restaurant_upsert_table_v1(
  p_actor_id uuid,p_space_id uuid,p_business_profile_id uuid,p_venue_id uuid,
  p_table_id uuid,p_expected_revision bigint,p_label text,p_active boolean
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE table_row public.restaurant_tables%ROWTYPE; result_id uuid;
BEGIN
  PERFORM public.restaurant_assert_owner_v1(p_actor_id,p_space_id,p_business_profile_id);
  IF length(btrim(p_label)) NOT BETWEEN 1 AND 40 OR NOT EXISTS(
    SELECT 1 FROM public.restaurant_venues WHERE id=p_venue_id AND space_id=p_space_id
      AND business_profile_id=p_business_profile_id
  ) THEN RAISE EXCEPTION 'restaurant_not_found'; END IF;
  IF p_table_id IS NULL THEN
    INSERT INTO public.restaurant_tables(venue_id,label,active) VALUES(p_venue_id,btrim(p_label),p_active)
      RETURNING id INTO result_id;
  ELSE
    SELECT * INTO table_row FROM public.restaurant_tables WHERE id=p_table_id AND venue_id=p_venue_id FOR UPDATE;
    IF NOT FOUND OR table_row.revision<>p_expected_revision THEN RAISE EXCEPTION 'restaurant_conflict'; END IF;
    UPDATE public.restaurant_tables SET label=btrim(p_label),active=p_active,revision=revision+1
      WHERE id=p_table_id RETURNING id INTO result_id;
  END IF;
  RETURN jsonb_build_object('tableId',result_id);
END;
$fn$;

CREATE FUNCTION public.restaurant_publish_menu_v1(
  p_actor_id uuid,p_space_id uuid,p_business_profile_id uuid,p_venue_id uuid,
  p_menu_id uuid,p_expected_revision bigint,p_title text,p_currency text,p_items jsonb
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE menu public.restaurant_menus%ROWTYPE; result_id uuid; next_version integer; entry jsonb; ordinal integer:=0;
BEGIN
  PERFORM public.restaurant_assert_owner_v1(p_actor_id,p_space_id,p_business_profile_id);
  IF NOT EXISTS(SELECT 1 FROM public.restaurant_venues WHERE id=p_venue_id AND space_id=p_space_id
      AND business_profile_id=p_business_profile_id AND active)
    OR length(btrim(p_title)) NOT BETWEEN 1 AND 120
    OR p_currency NOT IN ('ISK','EUR','USD','GBP','DKK','NOK','SEK')
    OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 500
  THEN RAISE EXCEPTION 'restaurant_invalid'; END IF;
  IF p_menu_id IS NULL THEN
    INSERT INTO public.restaurant_menus(venue_id,title,currency) VALUES(p_venue_id,btrim(p_title),p_currency)
      RETURNING * INTO menu;
    result_id:=menu.id;
  ELSE
    SELECT * INTO menu FROM public.restaurant_menus WHERE id=p_menu_id AND venue_id=p_venue_id FOR UPDATE;
    IF NOT FOUND OR menu.revision<>p_expected_revision THEN RAISE EXCEPTION 'restaurant_conflict'; END IF;
    result_id:=menu.id;
  END IF;
  next_version:=coalesce(menu.active_version,0)+1;
  INSERT INTO public.restaurant_menu_versions(menu_id,version,published_by) VALUES(result_id,next_version,p_actor_id);
  FOR entry IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    ordinal:=ordinal+1;
    IF entry-ARRAY['id','name','description','priceMinor','available','modifiers']<>'{}'::jsonb
      OR NOT(entry?&ARRAY['name','description','priceMinor','available','modifiers'])
      OR length(btrim(entry->>'name')) NOT BETWEEN 1 AND 200
      OR length(entry->>'description')>1000 OR coalesce(entry->>'priceMinor','')!~'^[0-9]+$'
      OR (entry->>'priceMinor')::numeric>9007199254740991 OR jsonb_typeof(entry->'available')<>'boolean'
      OR jsonb_typeof(entry->'modifiers')<>'array'
    THEN RAISE EXCEPTION 'restaurant_invalid'; END IF;
    INSERT INTO public.restaurant_menu_items(menu_id,menu_version,id,ordinal,name,description,price_minor,available,modifiers)
      VALUES(result_id,next_version,coalesce((entry->>'id')::uuid,gen_random_uuid()),ordinal,btrim(entry->>'name'),entry->>'description',
        (entry->>'priceMinor')::bigint,(entry->>'available')::boolean,entry->'modifiers');
  END LOOP;
  UPDATE public.restaurant_menus SET title=btrim(p_title),currency=p_currency,active_version=next_version,revision=revision+1
    WHERE id=result_id;
  RETURN jsonb_build_object('menuId',result_id,'menuVersion',next_version);
END;
$fn$;

CREATE FUNCTION public.restaurant_open_table_v1(
  p_actor_id uuid,p_space_id uuid,p_business_profile_id uuid,p_venue_id uuid,
  p_table_id uuid,p_menu_id uuid,p_menu_version integer
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE raw_token text; session_id uuid;
BEGIN
  PERFORM public.restaurant_assert_owner_v1(p_actor_id,p_space_id,p_business_profile_id);
  IF NOT EXISTS(SELECT 1 FROM public.restaurant_tables table_row JOIN public.restaurant_venues venue ON venue.id=table_row.venue_id
      WHERE table_row.id=p_table_id AND table_row.active AND venue.id=p_venue_id AND venue.space_id=p_space_id
        AND venue.business_profile_id=p_business_profile_id)
    OR NOT EXISTS(SELECT 1 FROM public.restaurant_menus WHERE id=p_menu_id AND venue_id=p_venue_id AND active_version=p_menu_version)
  THEN RAISE EXCEPTION 'restaurant_not_found'; END IF;
  raw_token:=encode(gen_random_bytes(32),'hex');
  INSERT INTO public.restaurant_table_sessions(table_id,menu_id,menu_version,qr_token_hash)
    VALUES(p_table_id,p_menu_id,p_menu_version,sha256(convert_to(raw_token,'UTF8'))) RETURNING id INTO session_id;
  RETURN jsonb_build_object('tableSessionId',session_id,'qrToken',raw_token,'revision',1);
END;
$fn$;

CREATE FUNCTION public.restaurant_assert_staff_v1(
  p_actor_id uuid,p_venue_id uuid,p_allowed_roles text[]
) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
  PERFORM receipt_split.assert_actor(p_actor_id);
  IF p_allowed_roles IS NULL OR NOT EXISTS(
    SELECT 1 FROM auth.users account
    JOIN public.feature_access entitlement
      ON entitlement.email=lower(btrim(account.email))
      AND entitlement.feature_key='veitingastadir_starfsfolk'
    JOIN public.restaurant_venues venue ON venue.id=p_venue_id
    JOIN public.restaurant_staff_memberships staff
      ON staff.space_id=venue.space_id AND staff.business_profile_id=venue.business_profile_id
      AND staff.user_id=account.id AND staff.status='active'
      AND staff.role=ANY(p_allowed_roles)
    WHERE account.id=p_actor_id
  ) THEN RAISE EXCEPTION 'restaurant_not_found'; END IF;
END;
$fn$;

CREATE FUNCTION public.restaurant_operational_view_v1(
  p_actor_id uuid,p_venue_id uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE allowed boolean; result jsonb;
BEGIN
  allowed:=EXISTS(
    SELECT 1 FROM public.restaurant_venues venue
    JOIN auth.users account ON account.id=p_actor_id
    JOIN public.feature_access entitlement ON entitlement.email=lower(btrim(account.email))
      AND entitlement.feature_key='veitingastadir'
    JOIN public.space_members membership ON membership.space_id=venue.space_id
      AND membership.user_id=p_actor_id AND membership.role='owner'
    WHERE venue.id=p_venue_id
  );
  IF NOT allowed THEN
    PERFORM public.restaurant_assert_staff_v1(p_actor_id,p_venue_id,ARRAY['floor_staff','order_viewer']);
  END IF;
  SELECT jsonb_build_object(
    'orders',coalesce(jsonb_agg(jsonb_build_object(
      'splitItemId',operational.item_id,'tableSessionId',operational.table_session_id,
      'name',operational.name_snapshot,'quantityUnits',operational.quantity_units,
      'unitPriceMinor',operational.unit_price_minor,'currency',operational.currency,
      'modifiers',operational.modifiers_snapshot,'serviceNote',operational.service_note,
      'status',operational.status,'statusRevision',operational.status_revision,
      'submittedAt',operational.submitted_at
    ) ORDER BY operational.submitted_at) FILTER(WHERE operational.item_id IS NOT NULL),'[]'::jsonb)
  ) INTO result FROM public.restaurant_split_items operational WHERE operational.venue_id=p_venue_id;
  RETURN result;
END;
$fn$;

CREATE FUNCTION public.restaurant_set_order_status_v1(
  p_actor_id uuid,p_split_id uuid,p_item_id uuid,p_expected_revision bigint,p_status text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE operational public.restaurant_split_items%ROWTYPE;
BEGIN
  IF p_status NOT IN ('nytt','i_vinnslu','afgreitt') OR p_expected_revision<1
    THEN RAISE EXCEPTION 'restaurant_invalid'; END IF;
  SELECT * INTO operational FROM public.restaurant_split_items
    WHERE split_id=p_split_id AND item_id=p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'restaurant_not_found'; END IF;
  PERFORM public.restaurant_assert_staff_v1(p_actor_id,operational.venue_id,ARRAY['floor_staff']);
  IF operational.status_revision<>p_expected_revision
    OR (operational.status='afgreitt' AND p_status<>'afgreitt')
    OR (operational.status='i_vinnslu' AND p_status='nytt')
  THEN RAISE EXCEPTION 'restaurant_conflict'; END IF;
  UPDATE public.restaurant_split_items SET status=p_status,status_revision=status_revision+1
    WHERE split_id=p_split_id AND item_id=p_item_id;
  RETURN jsonb_build_object('splitItemId',p_item_id,'status',p_status,'statusRevision',operational.status_revision+1);
END;
$fn$;

CREATE FUNCTION public.restaurant_forecast_v1(
  p_actor_id uuid,p_venue_id uuid,p_from timestamptz,p_until timestamptz
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE allowed boolean;
BEGIN
  IF p_from IS NULL OR p_until IS NULL OR p_until<=p_from OR p_until>p_from+interval '31 days'
    THEN RAISE EXCEPTION 'restaurant_invalid'; END IF;
  allowed:=EXISTS(SELECT 1 FROM public.restaurant_venues venue
    JOIN auth.users account ON account.id=p_actor_id
    JOIN public.feature_access entitlement ON entitlement.email=lower(btrim(account.email))
      AND entitlement.feature_key='veitingastadir'
    JOIN public.space_members membership ON membership.space_id=venue.space_id
      AND membership.user_id=p_actor_id AND membership.role='owner'
    WHERE venue.id=p_venue_id);
  IF NOT allowed THEN
    PERFORM public.restaurant_assert_staff_v1(p_actor_id,p_venue_id,ARRAY['floor_staff','order_viewer']);
  END IF;
  RETURN jsonb_build_object(
    'window',jsonb_build_object('from',p_from,'until',p_until),
    'visits',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'arrivalAt',visit.arrival_at,'partySize',visit.party_size,'state',visit.state,
      'lastChangedAt',greatest(visit.arrival_at,session.opened_at)
    ) ORDER BY visit.arrival_at) FROM public.restaurant_preorder_visits visit
      LEFT JOIN public.restaurant_table_sessions session ON session.id=visit.table_session_id
      WHERE visit.venue_id=p_venue_id AND visit.arrival_at>=p_from AND visit.arrival_at<p_until),'[]'::jsonb),
    'items',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'menuItemId',summary.menu_item_id,'name',summary.name_snapshot,
      'quantityUnits',summary.quantity_units,'lastChangedAt',summary.last_changed_at
    ) ORDER BY summary.name_snapshot) FROM (
      SELECT menu_item_id,name_snapshot,sum(quantity_units) quantity_units,max(submitted_at) last_changed_at
      FROM public.restaurant_split_items WHERE venue_id=p_venue_id
        AND submitted_at>=p_from AND submitted_at<p_until
      GROUP BY menu_item_id,name_snapshot
    ) summary),'[]'::jsonb)
  );
END;
$fn$;

CREATE FUNCTION public.restaurant_resolve_public_menu_v1(p_venue_slug text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $fn$
  SELECT jsonb_build_object(
    'venue',jsonb_build_object('id',v.id,'slug',v.slug,'name',v.display_name,'timezone',v.timezone),
    'menu',jsonb_build_object('id',m.id,'version',m.active_version,'title',m.title,'currency',m.currency),
    'items',coalesce(jsonb_agg(jsonb_build_object(
      'id',i.id,'name',i.name,'description',i.description,'priceMinor',i.price_minor,
      'available',i.available,'modifiers',i.modifiers
    ) ORDER BY i.ordinal) FILTER(WHERE i.id IS NOT NULL),'[]'::jsonb)
  )
  FROM public.restaurant_venues v
  JOIN public.restaurant_capabilities c ON c.space_id=v.space_id
    AND c.business_profile_id=v.business_profile_id AND c.active
  JOIN public.restaurant_menus m ON m.venue_id=v.id AND m.active_version IS NOT NULL
  JOIN public.restaurant_menu_versions mv ON mv.menu_id=m.id AND mv.version=m.active_version
  LEFT JOIN public.restaurant_menu_items i ON i.menu_id=m.id AND i.menu_version=mv.version
  WHERE v.slug=p_venue_slug AND v.active
  GROUP BY v.id,m.id;
$fn$;

CREATE FUNCTION public.restaurant_resolve_qr_v1(p_token text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $fn$
  SELECT jsonb_build_object('venueSlug',venue.slug,'tableSessionId',session.id,
    'sessionRevision',session.revision,'menuId',session.menu_id,'menuVersion',session.menu_version)
  FROM public.restaurant_table_sessions session
  JOIN public.restaurant_tables table_row ON table_row.id=session.table_id AND table_row.active
  JOIN public.restaurant_venues venue ON venue.id=table_row.venue_id AND venue.active
  JOIN public.restaurant_capabilities capability ON capability.space_id=venue.space_id
    AND capability.business_profile_id=venue.business_profile_id AND capability.active
  WHERE p_token~'^[0-9a-f]{64}$' AND session.qr_token_hash=sha256(convert_to(p_token,'UTF8'))
    AND session.state='open';
$fn$;

CREATE FUNCTION public.receipt_split_item_provenance_v1(
  p_actor_id uuid,p_split_id uuid
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $fn$
  SELECT CASE WHEN EXISTS(
    SELECT 1 FROM receipt_split.members member
    WHERE member.split_id=p_split_id AND member.user_id=p_actor_id AND member.status='active'
  ) THEN jsonb_build_object(
    'creators',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'itemId',item.id,'memberToken',item.created_by_member_token,
      'displayName',coalesce(profile.display_name,'Teskeiðarnotandi'),
      'sourceKind',item.source_kind
    ) ORDER BY item.ordinal) FROM receipt_split.items item
      LEFT JOIN public.profiles profile ON profile.id=item.created_by_user_id
      WHERE item.split_id=p_split_id AND item.cancelled_at IS NULL),'[]'::jsonb),
    'cancelledItemIds',coalesce((SELECT jsonb_agg(item.id ORDER BY item.ordinal)
      FROM receipt_split.items item
      WHERE item.split_id=p_split_id AND item.cancelled_at IS NOT NULL),'[]'::jsonb)
  ) ELSE NULL END;
$fn$;

CREATE FUNCTION public.restaurant_bind_split_to_table_v1(
  p_actor_id uuid,p_request_id uuid,p_table_session_id uuid,p_split_id uuid,
  p_expected_session_revision bigint
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE session_row public.restaurant_table_sessions%ROWTYPE;
  split_row receipt_split.splits%ROWTYPE; request_row receipt_split.requests%ROWTYPE;
  payload_hash bytea; result jsonb;
BEGIN
  PERFORM receipt_split.assert_actor(p_actor_id);
  IF p_request_id IS NULL OR p_table_session_id IS NULL OR p_split_id IS NULL
    OR p_expected_session_revision<1 OR NOT EXISTS(
      SELECT 1 FROM auth.users u JOIN public.feature_access f
        ON f.email=lower(btrim(u.email)) AND f.feature_key='veitingastadir_gestir'
      WHERE u.id=p_actor_id
    ) THEN RAISE EXCEPTION 'restaurant_not_found'; END IF;
  payload_hash:=sha256(convert_to(jsonb_build_object(
    'tableSessionId',p_table_session_id,'splitId',p_split_id,
    'expectedSessionRevision',p_expected_session_revision)::text,'UTF8'));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor_id::text||p_request_id::text,0));
  SELECT * INTO request_row FROM receipt_split.requests
    WHERE actor_id=p_actor_id AND request_id=p_request_id;
  IF FOUND THEN
    IF request_row.command<>'restaurant_bind_table:v1'
      OR request_row.split_id IS DISTINCT FROM p_split_id
      OR request_row.payload_hash<>payload_hash THEN RAISE EXCEPTION 'split_conflict'; END IF;
    RETURN request_row.result;
  END IF;
  SELECT * INTO split_row FROM receipt_split.splits WHERE id=p_split_id FOR UPDATE;
  IF NOT FOUND OR split_row.state<>'sharing' OR NOT EXISTS(
    SELECT 1 FROM receipt_split.members
    WHERE split_id=p_split_id AND user_id=p_actor_id AND status='active'
  ) THEN RAISE EXCEPTION 'split_not_found'; END IF;
  SELECT * INTO session_row FROM public.restaurant_table_sessions
    WHERE id=p_table_session_id FOR UPDATE;
  IF NOT FOUND OR session_row.state<>'open'
    OR session_row.revision<>p_expected_session_revision
    OR (session_row.split_id IS NOT NULL AND session_row.split_id<>p_split_id)
  THEN RAISE EXCEPTION 'restaurant_conflict'; END IF;
  UPDATE public.restaurant_table_sessions
    SET split_id=p_split_id,revision=revision+1
    WHERE id=session_row.id;
  result:=jsonb_build_object('id',p_split_id,'tableSessionId',session_row.id,
    'tableSessionRevision',session_row.revision+1);
  INSERT INTO receipt_split.requests(actor_id,request_id,command,split_id,payload_hash,result)
    VALUES(p_actor_id,p_request_id,'restaurant_bind_table:v1',p_split_id,payload_hash,result);
  RETURN result;
END;
$fn$;

CREATE FUNCTION public.restaurant_create_preorder_v1(
  p_actor_id uuid,p_request_id uuid,p_venue_id uuid,p_split_id uuid,
  p_arrival_at timestamptz,p_party_size integer
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE request_row public.restaurant_requests%ROWTYPE; visit_id uuid; payload_hash bytea; result jsonb;
BEGIN
  PERFORM receipt_split.assert_actor(p_actor_id);
  IF p_request_id IS NULL OR p_arrival_at<=now()-interval '1 hour'
    OR p_arrival_at>now()+interval '1 year' OR p_party_size NOT BETWEEN 1 AND 100
    OR NOT EXISTS(SELECT 1 FROM auth.users account JOIN public.feature_access entitlement
      ON entitlement.email=lower(btrim(account.email)) AND entitlement.feature_key='veitingastadir_gestir'
      WHERE account.id=p_actor_id)
    OR NOT EXISTS(SELECT 1 FROM receipt_split.members WHERE split_id=p_split_id AND user_id=p_actor_id AND status='active')
    OR NOT EXISTS(SELECT 1 FROM public.restaurant_venues WHERE id=p_venue_id AND active)
  THEN RAISE EXCEPTION 'restaurant_not_found'; END IF;
  payload_hash:=sha256(convert_to(jsonb_build_object('venueId',p_venue_id,'splitId',p_split_id,
    'arrivalAt',p_arrival_at,'partySize',p_party_size)::text,'UTF8'));
  PERFORM pg_advisory_xact_lock(hashtextextended('restaurant:'||p_actor_id::text||p_request_id::text,0));
  SELECT * INTO request_row FROM public.restaurant_requests WHERE actor_id=p_actor_id AND request_id=p_request_id;
  IF FOUND THEN
    IF request_row.command<>'create_preorder:v1' OR request_row.split_id IS DISTINCT FROM p_split_id
      OR request_row.payload_hash<>payload_hash THEN RAISE EXCEPTION 'restaurant_conflict'; END IF;
    RETURN request_row.result;
  END IF;
  INSERT INTO public.restaurant_preorder_visits(venue_id,split_id,arrival_at,party_size)
    VALUES(p_venue_id,p_split_id,p_arrival_at,p_party_size) RETURNING id INTO visit_id;
  result:=jsonb_build_object('visitId',visit_id,'splitId',p_split_id,'revision',1);
  INSERT INTO public.restaurant_requests(actor_id,request_id,command,split_id,payload_hash,result)
    VALUES(p_actor_id,p_request_id,'create_preorder:v1',p_split_id,payload_hash,result);
  RETURN result;
END;
$fn$;

CREATE FUNCTION public.restaurant_assign_preorder_table_v1(
  p_actor_id uuid,p_request_id uuid,p_visit_id uuid,p_expected_visit_revision bigint,
  p_table_session_id uuid,p_expected_session_revision bigint
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE visit public.restaurant_preorder_visits%ROWTYPE; session public.restaurant_table_sessions%ROWTYPE;
  table_row public.restaurant_tables%ROWTYPE; request_row public.restaurant_requests%ROWTYPE;
  payload_hash bytea; result jsonb;
BEGIN
  SELECT * INTO visit FROM public.restaurant_preorder_visits WHERE id=p_visit_id FOR UPDATE;
  SELECT * INTO session FROM public.restaurant_table_sessions WHERE id=p_table_session_id FOR UPDATE;
  SELECT * INTO table_row FROM public.restaurant_tables WHERE id=session.table_id;
  IF visit.id IS NULL OR session.id IS NULL THEN RAISE EXCEPTION 'restaurant_conflict'; END IF;
  PERFORM public.restaurant_assert_staff_v1(p_actor_id,visit.venue_id,ARRAY['floor_staff']);
  payload_hash:=sha256(convert_to(jsonb_build_object('visitId',p_visit_id,
    'expectedVisitRevision',p_expected_visit_revision,'tableSessionId',p_table_session_id,
    'expectedSessionRevision',p_expected_session_revision)::text,'UTF8'));
  PERFORM pg_advisory_xact_lock(hashtextextended('restaurant:'||p_actor_id::text||p_request_id::text,0));
  SELECT * INTO request_row FROM public.restaurant_requests WHERE actor_id=p_actor_id AND request_id=p_request_id;
  IF FOUND THEN
    IF request_row.command<>'assign_preorder_table:v1' OR request_row.split_id IS DISTINCT FROM visit.split_id
      OR request_row.payload_hash<>payload_hash THEN RAISE EXCEPTION 'restaurant_conflict'; END IF;
    RETURN request_row.result;
  END IF;
  IF visit.id IS NULL OR session.id IS NULL OR table_row.venue_id<>visit.venue_id
    OR visit.state NOT IN ('planned','arrived') OR visit.revision<>p_expected_visit_revision
    OR session.state<>'open' OR session.revision<>p_expected_session_revision
    OR visit.table_session_id IS NOT NULL
    OR (session.split_id IS NOT NULL AND session.split_id<>visit.split_id)
  THEN RAISE EXCEPTION 'restaurant_conflict'; END IF;
  UPDATE public.restaurant_preorder_visits SET table_session_id=session.id,state='arrived',revision=revision+1 WHERE id=visit.id;
  UPDATE public.restaurant_table_sessions SET split_id=visit.split_id,revision=revision+1 WHERE id=session.id;
  UPDATE public.restaurant_split_items SET table_session_id=session.id
    WHERE split_id=visit.split_id AND table_session_id IS NULL;
  result:=jsonb_build_object('visitId',visit.id,'splitId',visit.split_id,'tableSessionId',session.id,
    'visitRevision',visit.revision+1,'tableSessionRevision',session.revision+1);
  INSERT INTO public.restaurant_requests(actor_id,request_id,command,split_id,payload_hash,result)
    VALUES(p_actor_id,p_request_id,'assign_preorder_table:v1',visit.split_id,payload_hash,result);
  RETURN result;
END;
$fn$;

CREATE FUNCTION public.restaurant_submit_menu_item_v1(
  p_actor_id uuid,p_request_id uuid,p_table_session_id uuid,p_split_id uuid,
  p_expected_split_version bigint,p_menu_item_id uuid,p_quantity integer,
  p_modifiers jsonb,p_service_note text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE session_row public.restaurant_table_sessions%ROWTYPE;
  menu_row public.restaurant_menus%ROWTYPE; item_row public.restaurant_menu_items%ROWTYPE;
  request_row public.restaurant_requests%ROWTYPE; add_result jsonb;
  quantity_units bigint; total_minor bigint; payload_hash bytea;
BEGIN
  PERFORM receipt_split.assert_actor(p_actor_id);
  IF p_quantity NOT BETWEEN 1 AND 1000 OR p_modifiers IS NULL
    OR jsonb_typeof(p_modifiers)<>'array' OR length(coalesce(p_service_note,''))>500
    OR NOT EXISTS(
      SELECT 1 FROM auth.users u JOIN public.feature_access f
        ON f.email=lower(btrim(u.email)) AND f.feature_key='veitingastadir_gestir'
      WHERE u.id=p_actor_id
    )
  THEN RAISE EXCEPTION 'restaurant_not_found'; END IF;
  payload_hash:=sha256(convert_to(jsonb_build_object(
    'tableSessionId',p_table_session_id,'splitId',p_split_id,
    'expectedSplitVersion',p_expected_split_version,'menuItemId',p_menu_item_id,
    'quantity',p_quantity,'modifiers',p_modifiers,
    'serviceNote',coalesce(p_service_note,''))::text,'UTF8'));
  PERFORM pg_advisory_xact_lock(hashtextextended('restaurant:'||p_actor_id::text||p_request_id::text,0));
  SELECT * INTO request_row FROM public.restaurant_requests
    WHERE actor_id=p_actor_id AND request_id=p_request_id;
  IF FOUND THEN
    IF request_row.command<>'submit_menu_item:v1'
      OR request_row.split_id IS DISTINCT FROM p_split_id
      OR request_row.payload_hash<>payload_hash THEN RAISE EXCEPTION 'split_conflict'; END IF;
    RETURN request_row.result;
  END IF;
  SELECT * INTO session_row FROM public.restaurant_table_sessions
    WHERE id=p_table_session_id AND split_id=p_split_id AND state='open';
  IF NOT FOUND THEN RAISE EXCEPTION 'restaurant_not_found'; END IF;
  SELECT * INTO menu_row FROM public.restaurant_menus
    WHERE id=session_row.menu_id AND active_version=session_row.menu_version;
  SELECT * INTO item_row FROM public.restaurant_menu_items
    WHERE menu_id=session_row.menu_id AND menu_version=session_row.menu_version
      AND id=p_menu_item_id AND available;
  IF NOT FOUND OR menu_row.id IS NULL THEN RAISE EXCEPTION 'restaurant_conflict'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_modifiers) choice
    WHERE NOT (item_row.modifiers @> jsonb_build_array(choice))) THEN
    RAISE EXCEPTION 'restaurant_conflict';
  END IF;
  quantity_units:=p_quantity::bigint*3000;
  total_minor:=item_row.price_minor*p_quantity;
  add_result:=public.receipt_split_participant_add_item_v1(
    p_actor_id,p_request_id,p_split_id,p_expected_split_version,
    jsonb_build_object('description',item_row.name,'explanation',coalesce(p_service_note,''),
      'quantityUnits',quantity_units,'totalMinor',total_minor,
      'sourceKind','restaurant_menu','initialClaimUnits',quantity_units)
  );
  INSERT INTO public.restaurant_split_items(
    split_id,item_id,venue_id,table_session_id,menu_id,menu_version,menu_item_id,
    name_snapshot,unit_price_minor,currency,quantity_units,modifiers_snapshot,service_note
  ) VALUES(
    p_split_id,(add_result->>'itemId')::uuid,
    (SELECT t.venue_id FROM public.restaurant_tables t WHERE t.id=session_row.table_id),
    session_row.id,menu_row.id,session_row.menu_version,item_row.id,item_row.name,
    item_row.price_minor,menu_row.currency,quantity_units,p_modifiers,coalesce(p_service_note,'')
  );
  INSERT INTO public.restaurant_requests(actor_id,request_id,command,split_id,payload_hash,result)
    VALUES(p_actor_id,p_request_id,'submit_menu_item:v1',p_split_id,payload_hash,add_result);
  RETURN add_result;
END;
$fn$;

ALTER FUNCTION public.receipt_split_participant_add_item_v1(uuid,uuid,uuid,bigint,jsonb) OWNER TO postgres;
ALTER FUNCTION public.receipt_split_participant_edit_item_v1(uuid,uuid,uuid,bigint,jsonb) OWNER TO postgres;
ALTER FUNCTION public.receipt_split_participant_cancel_item_v1(uuid,uuid,uuid,uuid,bigint,bigint) OWNER TO postgres;
ALTER FUNCTION public.receipt_split_item_provenance_v1(uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.restaurant_resolve_public_menu_v1(text) OWNER TO postgres;
ALTER FUNCTION public.restaurant_resolve_qr_v1(text) OWNER TO postgres;
ALTER FUNCTION public.restaurant_bind_split_to_table_v1(uuid,uuid,uuid,uuid,bigint) OWNER TO postgres;
ALTER FUNCTION public.restaurant_create_preorder_v1(uuid,uuid,uuid,uuid,timestamptz,integer) OWNER TO postgres;
ALTER FUNCTION public.restaurant_assign_preorder_table_v1(uuid,uuid,uuid,bigint,uuid,bigint) OWNER TO postgres;
ALTER FUNCTION public.restaurant_submit_menu_item_v1(uuid,uuid,uuid,uuid,bigint,uuid,integer,jsonb,text) OWNER TO postgres;
ALTER FUNCTION public.restaurant_assert_owner_v1(uuid,uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.restaurant_enable_capability_v1(uuid,uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.restaurant_set_staff_v1(uuid,uuid,uuid,uuid,text,boolean) OWNER TO postgres;
ALTER FUNCTION public.restaurant_upsert_venue_v1(uuid,uuid,uuid,uuid,bigint,text,text,text) OWNER TO postgres;
ALTER FUNCTION public.restaurant_upsert_table_v1(uuid,uuid,uuid,uuid,uuid,bigint,text,boolean) OWNER TO postgres;
ALTER FUNCTION public.restaurant_publish_menu_v1(uuid,uuid,uuid,uuid,uuid,bigint,text,text,jsonb) OWNER TO postgres;
ALTER FUNCTION public.restaurant_open_table_v1(uuid,uuid,uuid,uuid,uuid,uuid,integer) OWNER TO postgres;
ALTER FUNCTION public.restaurant_assert_staff_v1(uuid,uuid,text[]) OWNER TO postgres;
ALTER FUNCTION public.restaurant_operational_view_v1(uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.restaurant_set_order_status_v1(uuid,uuid,uuid,bigint,text) OWNER TO postgres;
ALTER FUNCTION public.restaurant_forecast_v1(uuid,uuid,timestamptz,timestamptz) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.receipt_split_participant_add_item_v1(uuid,uuid,uuid,bigint,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.receipt_split_participant_edit_item_v1(uuid,uuid,uuid,bigint,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.receipt_split_participant_cancel_item_v1(uuid,uuid,uuid,uuid,bigint,bigint) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.receipt_split_item_provenance_v1(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.restaurant_resolve_public_menu_v1(text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.restaurant_resolve_qr_v1(text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.restaurant_bind_split_to_table_v1(uuid,uuid,uuid,uuid,bigint) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.restaurant_create_preorder_v1(uuid,uuid,uuid,uuid,timestamptz,integer) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.restaurant_assign_preorder_table_v1(uuid,uuid,uuid,bigint,uuid,bigint) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.restaurant_submit_menu_item_v1(uuid,uuid,uuid,uuid,bigint,uuid,integer,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.restaurant_assert_owner_v1(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.restaurant_enable_capability_v1(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.restaurant_set_staff_v1(uuid,uuid,uuid,uuid,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.restaurant_upsert_venue_v1(uuid,uuid,uuid,uuid,bigint,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.restaurant_upsert_table_v1(uuid,uuid,uuid,uuid,uuid,bigint,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.restaurant_publish_menu_v1(uuid,uuid,uuid,uuid,uuid,bigint,text,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.restaurant_open_table_v1(uuid,uuid,uuid,uuid,uuid,uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.restaurant_assert_staff_v1(uuid,uuid,text[]) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.restaurant_operational_view_v1(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.restaurant_set_order_status_v1(uuid,uuid,uuid,bigint,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.restaurant_forecast_v1(uuid,uuid,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.receipt_split_participant_add_item_v1(uuid,uuid,uuid,bigint,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.receipt_split_participant_edit_item_v1(uuid,uuid,uuid,bigint,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.receipt_split_participant_cancel_item_v1(uuid,uuid,uuid,uuid,bigint,bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.receipt_split_item_provenance_v1(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.restaurant_resolve_public_menu_v1(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.restaurant_resolve_qr_v1(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.restaurant_bind_split_to_table_v1(uuid,uuid,uuid,uuid,bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.restaurant_create_preorder_v1(uuid,uuid,uuid,uuid,timestamptz,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.restaurant_assign_preorder_table_v1(uuid,uuid,uuid,bigint,uuid,bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.restaurant_submit_menu_item_v1(uuid,uuid,uuid,uuid,bigint,uuid,integer,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.restaurant_enable_capability_v1(uuid,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.restaurant_set_staff_v1(uuid,uuid,uuid,uuid,text,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.restaurant_upsert_venue_v1(uuid,uuid,uuid,uuid,bigint,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.restaurant_upsert_table_v1(uuid,uuid,uuid,uuid,uuid,bigint,text,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.restaurant_publish_menu_v1(uuid,uuid,uuid,uuid,uuid,bigint,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.restaurant_open_table_v1(uuid,uuid,uuid,uuid,uuid,uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.restaurant_operational_view_v1(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.restaurant_set_order_status_v1(uuid,uuid,uuid,bigint,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.restaurant_forecast_v1(uuid,uuid,timestamptz,timestamptz) TO service_role;

COMMIT;
