-- SQL191 MIGRATION: preserve the participant's exact receipt-split fraction notation.
-- Stebbi runs only after the matching preflight returns READY.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL search_path='';

DO $guard$
DECLARE rd text; cd text;
BEGIN
  IF current_user<>'postgres'
    OR to_regclass('receipt_split.claims') IS NULL
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='receipt_split.claims'::regclass AND attname='input_mode' AND NOT attisdropped)
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='receipt_split.claims'::regclass AND attname IN ('fraction_numerator','fraction_denominator') AND NOT attisdropped)
  THEN RAISE EXCEPTION 'SQL191 prerequisite mismatch; stop'; END IF;
  rd:=pg_get_functiondef('public.receipt_split_read_v2(uuid,uuid)'::regprocedure);
  cd:=pg_get_functiondef('public.receipt_split_command_v2(uuid,text,uuid,uuid,jsonb)'::regprocedure);
  IF rd NOT LIKE '%''inputMode'',c.input_mode)%' OR cd NOT LIKE '%input_mode=EXCLUDED.input_mode%'
    OR cd NOT LIKE '%input_mode := p_payload->>''inputMode''%'
  THEN RAISE EXCEPTION 'SQL191 predecessor mismatch; stop'; END IF;
END;
$guard$;

ALTER TABLE receipt_split.claims
  ADD COLUMN fraction_numerator bigint,
  ADD COLUMN fraction_denominator bigint;
ALTER TABLE receipt_split.claims ADD CONSTRAINT claims_fraction_notation_chk CHECK(
  (fraction_numerator IS NULL AND fraction_denominator IS NULL)
  OR (input_mode='fraction' AND fraction_numerator BETWEEN 1 AND 1000000 AND fraction_denominator BETWEEN 1 AND 1000000)
);

CREATE OR REPLACE FUNCTION receipt_split.validate_command_v2(p_command text,p jsonb)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $fn$
DECLARE fields text[]; key text;
BEGIN
  fields := CASE p_command
    WHEN 'create' THEN ARRAY['extraction'] WHEN 'apply_extraction' THEN ARRAY['extraction']
    WHEN 'prepare_image' THEN ARRAY['mime','size']
    WHEN 'begin_extraction' THEN ARRAY[]::text[] WHEN 'image_target' THEN ARRAY[]::text[]
    WHEN 'rotate_invite' THEN ARRAY[]::text[] WHEN 'join' THEN ARRAY['token']
    WHEN 'claim' THEN ARRAY['itemId','itemRevision','previousUnits','quantityUnits','inputMode','fractionNumerator','fractionDenominator']
    WHEN 'edit_item' THEN ARRAY['itemId','itemRevision','description','explanation','quantityUnits','totalMinor']
    WHEN 'add_item' THEN ARRAY['description','explanation','quantityUnits','totalMinor']
    WHEN 'receipt_total' THEN ARRAY['receiptTotalMinor','version']
    WHEN 'save_review' THEN ARRAY['version'] WHEN 'confirm' THEN ARRAY['version']
    WHEN 'delete' THEN ARRAY['version'] WHEN 'delete_image' THEN ARRAY['version']
    WHEN 'complete_delete' THEN ARRAY['scope'] ELSE NULL END;
  IF fields IS NULL OR NOT(p ?& fields) OR p-(fields || ARRAY['contractVersion','quantityScale'])<>'{}'::jsonb
    OR EXISTS(SELECT 1 FROM jsonb_each(p) e WHERE e.value='null'::jsonb AND e.key NOT IN ('fractionNumerator','fractionDenominator'))
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
    '''inputMode'',c.input_mode)',
    '''inputMode'',c.input_mode,''fractionNumerator'',c.fraction_numerator,''fractionDenominator'',c.fraction_denominator)');
  IF replacement=definition THEN RAISE EXCEPTION 'SQL191 read replacement failed; stop'; END IF;
  EXECUTE replacement;
END;
$patch_read$;

DO $patch_command$
DECLARE definition text; replacement text;
BEGIN
  definition:=pg_get_functiondef('public.receipt_split_command_v2(uuid,text,uuid,uuid,jsonb)'::regprocedure);
  replacement:=replace(definition,
    'item jsonb; input_mode text;',
    'item jsonb; input_mode text; fraction_numerator bigint; fraction_denominator bigint;');
  replacement:=replace(replacement,
    'IF NOT FOUND OR i.kind <> ''item'' OR i.total_minor <= 0 THEN RAISE EXCEPTION ''split_invalid''; END IF;',
    'IF NOT FOUND OR i.kind <> ''item'' OR i.total_minor <= 0 THEN RAISE EXCEPTION ''split_invalid''; END IF;
      IF input_mode=''fraction'' THEN
        IF jsonb_typeof(p_payload->''fractionNumerator'') IS DISTINCT FROM ''number'' OR jsonb_typeof(p_payload->''fractionDenominator'') IS DISTINCT FROM ''number''
          OR coalesce(p_payload->>''fractionNumerator'','''') !~ ''^[0-9]+$'' OR coalesce(p_payload->>''fractionDenominator'','''') !~ ''^[0-9]+$''
          OR (p_payload->>''fractionNumerator'')::numeric NOT BETWEEN 1 AND 1000000 OR (p_payload->>''fractionDenominator'')::numeric NOT BETWEEN 1 AND 1000000
        THEN RAISE EXCEPTION ''split_invalid''; END IF;
        fraction_numerator:=(p_payload->>''fractionNumerator'')::bigint; fraction_denominator:=(p_payload->>''fractionDenominator'')::bigint;
        IF (i.quantity_units*fraction_numerator + fraction_denominator/2)/fraction_denominator <> qty THEN RAISE EXCEPTION ''split_invalid''; END IF;
      ELSIF p_payload->''fractionNumerator''<>''null''::jsonb OR p_payload->''fractionDenominator''<>''null''::jsonb THEN RAISE EXCEPTION ''split_invalid'';
      END IF;');
  replacement:=replace(replacement,
    'INSERT INTO receipt_split.claims(split_id,item_id,member_token,quantity_units,input_mode) VALUES(s.id,i.id,member,qty,input_mode)
          ON CONFLICT(split_id,item_id,member_token) DO UPDATE SET quantity_units=EXCLUDED.quantity_units,input_mode=EXCLUDED.input_mode;',
    'INSERT INTO receipt_split.claims(split_id,item_id,member_token,quantity_units,input_mode,fraction_numerator,fraction_denominator) VALUES(s.id,i.id,member,qty,input_mode,fraction_numerator,fraction_denominator)
          ON CONFLICT(split_id,item_id,member_token) DO UPDATE SET quantity_units=EXCLUDED.quantity_units,input_mode=EXCLUDED.input_mode,fraction_numerator=EXCLUDED.fraction_numerator,fraction_denominator=EXCLUDED.fraction_denominator;');
  IF replacement=definition OR replacement NOT LIKE '%fraction_numerator=EXCLUDED.fraction_numerator%'
    OR replacement NOT LIKE '%i.quantity_units*fraction_numerator + fraction_denominator/2%'
  THEN RAISE EXCEPTION 'SQL191 command replacement failed; stop'; END IF;
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
