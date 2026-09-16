-- SQL189: participant-managed saved display currency and exchange rate.
-- Stebbi runs only after the matching preflight returns READY.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = '';

DO $guard$
DECLARE definition text;
BEGIN
  IF current_user <> 'postgres'
    OR to_regclass('receipt_split.splits') IS NULL
    OR to_regclass('receipt_split.members') IS NULL
    OR to_regclass('receipt_split.requests') IS NULL
    OR to_regprocedure('public.receipt_split_read_v2(uuid,uuid)') IS NULL
    OR to_regprocedure('public.receipt_split_set_exchange_v1(uuid,uuid,uuid,bigint,text,text)') IS NOT NULL
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='receipt_split.splits'::regclass
      AND attname IN ('exchange_currency','exchange_rate') AND NOT attisdropped)
  THEN RAISE EXCEPTION 'SQL189 prerequisite mismatch; stop'; END IF;
  definition:=pg_get_functiondef('public.receipt_split_read_v2(uuid,uuid)'::regprocedure);
  IF definition NOT LIKE '%''version'',split_row.version,''isOwner'',split_row.owner_id=p_actor_id%'
    OR definition NOT LIKE '%''incurredOn'',s.incurred_on,''receiptTotalMinor'',s.total_minor,''isOwner''%'
    OR definition NOT LIKE '%''dismissedItemIds''%'
  THEN RAISE EXCEPTION 'SQL189 predecessor mismatch; stop'; END IF;
END;
$guard$;

ALTER TABLE receipt_split.splits
  ADD COLUMN exchange_currency text,
  ADD COLUMN exchange_rate numeric;
ALTER TABLE receipt_split.splits
  ADD CONSTRAINT splits_exchange_pair_chk CHECK (
    (exchange_currency IS NULL AND exchange_rate IS NULL)
    OR (exchange_currency ~ '^[A-Z]{3}$' AND exchange_currency<>currency
      AND exchange_rate>0 AND exchange_rate<=1000000000000
      AND scale(exchange_rate)<=8)
  );

DO $patch_read$
DECLARE definition text; replacement text;
BEGIN
  definition:=pg_get_functiondef('public.receipt_split_read_v2(uuid,uuid)'::regprocedure);
  replacement:=replace(definition,
    '''incurredOn'',s.incurred_on,''receiptTotalMinor'',s.total_minor,''isOwner''',
    '''incurredOn'',s.incurred_on,''receiptTotalMinor'',s.total_minor,''exchangeCurrency'',s.exchange_currency,''exchangeRate'',s.exchange_rate::text,''isOwner''');
  IF replacement=definition THEN RAISE EXCEPTION 'SQL189 read projection replacement failed; stop'; END IF;
  EXECUTE replacement;
END;
$patch_read$;

CREATE FUNCTION public.receipt_split_set_exchange_v1(
  p_actor_id uuid,p_request_id uuid,p_split_id uuid,p_version bigint,p_currency text,p_rate text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE s receipt_split.splits%ROWTYPE; r receipt_split.requests%ROWTYPE; payload jsonb; payload_hash bytea; result jsonb;
BEGIN
  PERFORM receipt_split.assert_actor(p_actor_id);
  IF p_request_id IS NULL OR p_split_id IS NULL OR p_version IS NULL OR p_version<1
    OR coalesce(p_currency,'') !~ '^[A-Z]{3}$'
    OR coalesce(p_rate,'') !~ '^[0-9]+(\.[0-9]{1,8})?$' OR length(p_rate)>30
    OR p_rate::numeric<=0 OR p_rate::numeric>1000000000000
  THEN RAISE EXCEPTION 'split_invalid'; END IF;
  payload:=jsonb_build_object('version',p_version,'currency',p_currency,'rate',p_rate);
  payload_hash:=sha256(convert_to(payload::text,'UTF8'));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor_id::text || p_request_id::text,0));
  SELECT * INTO r FROM receipt_split.requests WHERE actor_id=p_actor_id AND request_id=p_request_id;
  IF FOUND THEN
    IF r.command<>'exchange:v1' OR r.split_id IS DISTINCT FROM p_split_id OR r.payload_hash<>payload_hash
      THEN RAISE EXCEPTION 'split_conflict'; END IF;
    IF NOT EXISTS (SELECT 1 FROM receipt_split.members m JOIN receipt_split.splits split_row ON split_row.id=m.split_id
      WHERE m.split_id=p_split_id AND m.user_id=p_actor_id AND split_row.state='sharing')
      THEN RAISE EXCEPTION 'split_conflict'; END IF;
    RETURN r.result;
  END IF;
  SELECT * INTO s FROM receipt_split.splits WHERE id=p_split_id FOR UPDATE;
  IF NOT FOUND OR s.state<>'sharing' OR s.version<>p_version
    OR p_currency=s.currency
    OR NOT EXISTS (SELECT 1 FROM receipt_split.members WHERE split_id=s.id AND user_id=p_actor_id)
  THEN RAISE EXCEPTION 'split_conflict'; END IF;
  UPDATE receipt_split.splits SET exchange_currency=p_currency,exchange_rate=p_rate::numeric,version=version+1 WHERE id=s.id;
  result:=jsonb_build_object('id',s.id);
  INSERT INTO receipt_split.requests(actor_id,request_id,command,split_id,payload_hash,result)
    VALUES(p_actor_id,p_request_id,'exchange:v1',s.id,payload_hash,result);
  RETURN result;
END;
$fn$;

ALTER FUNCTION public.receipt_split_read_v2(uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.receipt_split_read_v2(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.receipt_split_read_v2(uuid,uuid) TO service_role;
ALTER FUNCTION public.receipt_split_set_exchange_v1(uuid,uuid,uuid,bigint,text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.receipt_split_set_exchange_v1(uuid,uuid,uuid,bigint,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.receipt_split_set_exchange_v1(uuid,uuid,uuid,bigint,text,text) TO service_role;
COMMIT;
