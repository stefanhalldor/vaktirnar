-- SQL190 PREFLIGHT: verify exact predecessor and absent input-mode target.
SET LOCAL search_path='';
WITH defs AS (SELECT
  pg_get_functiondef('public.receipt_split_read_v2(uuid,uuid)'::regprocedure) read_definition,
  pg_get_functiondef('public.receipt_split_command_v2(uuid,text,uuid,uuid,jsonb)'::regprocedure) command_definition)
SELECT CASE WHEN current_user='postgres'
    AND to_regclass('receipt_split.claims') IS NOT NULL
    AND to_regprocedure('receipt_split.validate_command_v2(text,jsonb)') IS NOT NULL
    AND read_definition LIKE '%''exchangeCurrency'',s.exchange_currency,''exchangeRate'',s.exchange_rate::text%'
    AND read_definition LIKE '%''quantityUnits'',coalesce(c.quantity_units,c.quantity_milli*3)%'
    AND command_definition LIKE '%INSERT INTO receipt_split.claims(split_id,item_id,member_token,quantity_units)%'
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='receipt_split.claims'::regclass
      AND attname='input_mode' AND NOT attisdropped)
  THEN 'READY' ELSE 'STOP' END operator_state,
  current_user='postgres' operator_ok,
  read_definition LIKE '%''exchangeCurrency'',s.exchange_currency,''exchangeRate'',s.exchange_rate::text%' predecessor_ok,
  command_definition LIKE '%INSERT INTO receipt_split.claims(split_id,item_id,member_token,quantity_units)%' command_ok,
  NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='receipt_split.claims'::regclass
    AND attname='input_mode' AND NOT attisdropped) target_absent
FROM defs;
