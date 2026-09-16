-- SQL189 read-only preflight. Continue only on READY with every boolean true.
SET LOCAL search_path='';
WITH body AS (SELECT pg_get_functiondef('public.receipt_split_read_v2(uuid,uuid)'::regprocedure) definition)
SELECT CASE WHEN current_user='postgres'
    AND to_regclass('receipt_split.splits') IS NOT NULL
    AND to_regclass('receipt_split.members') IS NOT NULL
    AND to_regclass('receipt_split.requests') IS NOT NULL
    AND to_regprocedure('public.receipt_split_set_exchange_v1(uuid,uuid,uuid,bigint,text,text)') IS NULL
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='receipt_split.splits'::regclass
      AND attname IN ('exchange_currency','exchange_rate') AND NOT attisdropped)
    AND definition LIKE '%''version'',split_row.version,''isOwner'',split_row.owner_id=p_actor_id%'
    AND definition LIKE '%''incurredOn'',s.incurred_on,''receiptTotalMinor'',s.total_minor,''isOwner''%'
    AND definition LIKE '%''dismissedItemIds''%'
  THEN 'READY' ELSE 'STOP' END operator_state,
  current_user='postgres' operator_ok,
  definition LIKE '%''version'',split_row.version,''isOwner'',split_row.owner_id=p_actor_id%' predecessor_ok,
  NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='receipt_split.splits'::regclass
    AND attname IN ('exchange_currency','exchange_rate') AND NOT attisdropped) columns_absent,
  to_regprocedure('public.receipt_split_set_exchange_v1(uuid,uuid,uuid,bigint,text,text)') IS NULL function_absent
FROM body;
