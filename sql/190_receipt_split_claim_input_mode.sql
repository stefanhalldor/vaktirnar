-- SQL190 MIGRATION: persist each receipt-split claim input mode.
-- Stebbi runs only after the matching preflight returns READY.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL search_path='';

DO $guard$
DECLARE read_definition text; command_definition text;
BEGIN
  IF current_user<>'postgres'
    OR to_regclass('receipt_split.claims') IS NULL
    OR to_regprocedure('receipt_split.validate_command_v2(text,jsonb)') IS NULL
    OR to_regprocedure('public.receipt_split_read_v2(uuid,uuid)') IS NULL
    OR to_regprocedure('public.receipt_split_command_v2(uuid,text,uuid,uuid,jsonb)') IS NULL
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='receipt_split.claims'::regclass
      AND attname='input_mode' AND NOT attisdropped)
  THEN RAISE EXCEPTION 'SQL190 prerequisite mismatch; stop'; END IF;
  read_definition:=pg_get_functiondef('public.receipt_split_read_v2(uuid,uuid)'::regprocedure);
  command_definition:=pg_get_functiondef('public.receipt_split_command_v2(uuid,text,uuid,uuid,jsonb)'::regprocedure);
  IF read_definition NOT LIKE '%''exchangeCurrency'',s.exchange_currency,''exchangeRate'',s.exchange_rate::text%'
    OR read_definition NOT LIKE '%''quantityUnits'',coalesce(c.quantity_units,c.quantity_milli*3)%'
    OR command_definition NOT LIKE '%INSERT INTO receipt_split.claims(split_id,item_id,member_token,quantity_units)%'
  THEN RAISE EXCEPTION 'SQL190 predecessor mismatch; stop'; END IF;
END;
$guard$;

ALTER TABLE receipt_split.claims ADD COLUMN input_mode text NOT NULL DEFAULT 'quantity';
ALTER TABLE receipt_split.claims ADD CONSTRAINT claims_input_mode_chk
  CHECK(input_mode IN ('quantity','percent','fraction'));

CREATE OR REPLACE FUNCTION receipt_split.validate_command_v2(p_command text,p jsonb)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $fn$
DECLARE fields text[]; key text;
BEGIN
  fields := CASE p_command
    WHEN 'create' THEN ARRAY['extraction'] WHEN 'apply_extraction' THEN ARRAY['extraction']
    WHEN 'prepare_image' THEN ARRAY['mime','size']
    WHEN 'begin_extraction' THEN ARRAY[]::text[] WHEN 'image_target' THEN ARRAY[]::text[]
    WHEN 'rotate_invite' THEN ARRAY[]::text[] WHEN 'join' THEN ARRAY['token']
    WHEN 'claim' THEN ARRAY['itemId','itemRevision','previousUnits','quantityUnits','inputMode']
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

DO $patch_read$
DECLARE definition text; replacement text;
BEGIN
  definition:=pg_get_functiondef('public.receipt_split_read_v2(uuid,uuid)'::regprocedure);
  replacement:=replace(definition,
    '''quantityUnits'',coalesce(c.quantity_units,c.quantity_milli*3))',
    '''quantityUnits'',coalesce(c.quantity_units,c.quantity_milli*3),''inputMode'',c.input_mode)');
  IF replacement=definition THEN RAISE EXCEPTION 'SQL190 read projection replacement failed; stop'; END IF;
  EXECUTE replacement;
END;
$patch_read$;

DO $patch_command$
DECLARE definition text; replacement text;
BEGIN
  definition:=pg_get_functiondef('public.receipt_split_command_v2(uuid,text,uuid,uuid,jsonb)'::regprocedure);
  replacement:=replace(definition,
    'result jsonb; qty bigint; used bigint; mine bigint; n integer; item jsonb;',
    'result jsonb; qty bigint; used bigint; mine bigint; n integer; item jsonb; input_mode text;');
  replacement:=replace(replacement,
    'IF s.state <> ''sharing'' OR coalesce(p_payload->>''quantityUnits'','''') !~ ''^[0-9]+$''',
    'IF s.state <> ''sharing'' OR coalesce(p_payload->>''inputMode'','''') NOT IN (''quantity'',''percent'',''fraction'') OR coalesce(p_payload->>''quantityUnits'','''') !~ ''^[0-9]+$''');
  replacement:=replace(replacement,
    'qty := (p_payload->>''quantityUnits'')::bigint;',
    'qty := (p_payload->>''quantityUnits'')::bigint; input_mode := p_payload->>''inputMode'';');
  replacement:=replace(replacement,
    'INSERT INTO receipt_split.claims(split_id,item_id,member_token,quantity_units) VALUES(s.id,i.id,member,qty)
          ON CONFLICT(split_id,item_id,member_token) DO UPDATE SET quantity_units=EXCLUDED.quantity_units;',
    'INSERT INTO receipt_split.claims(split_id,item_id,member_token,quantity_units,input_mode) VALUES(s.id,i.id,member,qty,input_mode)
          ON CONFLICT(split_id,item_id,member_token) DO UPDATE SET quantity_units=EXCLUDED.quantity_units,input_mode=EXCLUDED.input_mode;');
  IF replacement=definition OR replacement NOT LIKE '%input_mode=EXCLUDED.input_mode%'
    OR replacement NOT LIKE '%input_mode := p_payload->>''inputMode''%'
  THEN RAISE EXCEPTION 'SQL190 command replacement failed; stop'; END IF;
  EXECUTE replacement;
END;
$patch_command$;

ALTER FUNCTION receipt_split.validate_command_v2(text,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION receipt_split.validate_command_v2(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION public.receipt_split_read_v2(uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.receipt_split_read_v2(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.receipt_split_read_v2(uuid,uuid) TO service_role;
ALTER FUNCTION public.receipt_split_command_v2(uuid,text,uuid,uuid,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.receipt_split_command_v2(uuid,text,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.receipt_split_command_v2(uuid,text,uuid,uuid,jsonb) TO service_role;
COMMIT;
