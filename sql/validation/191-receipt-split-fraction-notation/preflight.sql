-- SQL191 PREFLIGHT: verify SQL190 and absent exact-fraction notation targets.
SET LOCAL search_path='';
WITH defs AS (SELECT pg_get_functiondef('public.receipt_split_read_v2(uuid,uuid)'::regprocedure) rd,
  pg_get_functiondef('public.receipt_split_command_v2(uuid,text,uuid,uuid,jsonb)'::regprocedure) cd)
SELECT CASE WHEN current_user='postgres'
    AND EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='receipt_split.claims'::regclass AND attname='input_mode' AND NOT attisdropped)
    AND rd LIKE '%''inputMode'',c.input_mode)%' AND cd LIKE '%input_mode=EXCLUDED.input_mode%'
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='receipt_split.claims'::regclass AND attname IN ('fraction_numerator','fraction_denominator') AND NOT attisdropped)
  THEN 'READY' ELSE 'STOP' END operator_state,
  current_user='postgres' operator_ok,
  rd LIKE '%''inputMode'',c.input_mode)%' AND cd LIKE '%input_mode=EXCLUDED.input_mode%' predecessor_ok,
  NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='receipt_split.claims'::regclass AND attname IN ('fraction_numerator','fraction_denominator') AND NOT attisdropped) targets_absent
FROM defs;
