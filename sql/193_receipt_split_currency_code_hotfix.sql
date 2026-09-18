-- SQL193 MIGRATION: accept any uppercase three-letter currency code in receipt split v2.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE receipt_split.splits IN ACCESS EXCLUSIVE MODE;

DO $preflight$
DECLARE definition text; body_hash text; schema_comment text; constraint_ok boolean;
BEGIN
  SELECT pg_get_functiondef(p.oid), md5(replace(p.prosrc,E'\r\n',E'\n'))
    INTO definition, body_hash
  FROM pg_proc p WHERE p.oid='receipt_split.validate_v2(jsonb)'::regprocedure;
  SELECT obj_description(to_regnamespace('receipt_split'),'pg_namespace') INTO schema_comment;
  SELECT count(*) = 1 AND bool_and(c.convalidated AND c.contype = 'c'
    AND regexp_replace(pg_get_expr(c.conbin,c.conrelid), '[[:space:]()]', '', 'g') =
      $expected$currency=ANYARRAY['ISK'::text,'EUR'::text,'USD'::text,'GBP'::text,'DKK'::text,'NOK'::text,'SEK'::text]$expected$)
    INTO constraint_ok
  FROM pg_constraint c WHERE c.conrelid = 'receipt_split.splits'::regclass
    AND c.conname = 'splits_currency_check';
  IF definition IS NULL
    OR body_hash <> '3de8d61d7b8d873e5916bed3e0d68f20'
    OR coalesce(schema_comment,'') NOT LIKE 'SQL184:v2:%'
    OR constraint_ok IS DISTINCT FROM true
    OR NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid='receipt_split.validate_v2(jsonb)'::regprocedure
      AND NOT p.prosecdef AND p.provolatile='v' AND p.proowner='postgres'::regrole
      AND p.proconfig=ARRAY['search_path=""']::text[]
      AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
      AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
      AND NOT has_function_privilege('service_role',p.oid,'EXECUTE'))
    OR definition NOT LIKE '%currency%NOT IN (%ISK%EUR%USD%GBP%DKK%NOK%SEK%'
    OR definition LIKE '%currency% !~ ''^[A-Z]{3}$''%' THEN
    RAISE EXCEPTION 'SQL193_BASELINE_DRIFT';
  END IF;
END;
$preflight$;

-- Legacy v1 keeps its original currency contract; only v2 gains new codes.
ALTER TABLE receipt_split.splits DROP CONSTRAINT splits_currency_check;
ALTER TABLE receipt_split.splits ADD CONSTRAINT splits_currency_check CHECK (
  (contract_version = 1 AND currency IN ('ISK','EUR','USD','GBP','DKK','NOK','SEK'))
  OR (contract_version = 2 AND currency ~ '^[A-Z]{3}$')
);

CREATE OR REPLACE FUNCTION receipt_split.validate_v2(p jsonb) RETURNS void
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
    OR jsonb_typeof(p->'currency') <> 'string'
    OR p->>'currency' !~ '^[A-Z]{3}$'
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

ALTER FUNCTION receipt_split.validate_v2(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION receipt_split.validate_v2(jsonb) FROM PUBLIC,anon,authenticated,service_role;

DO $seal$
DECLARE body_hash text; constraint_hash text;
BEGIN
  SELECT md5(replace(p.prosrc,E'\r\n',E'\n')) INTO body_hash
  FROM pg_proc p WHERE p.oid='receipt_split.validate_v2(jsonb)'::regprocedure;
  IF body_hash IS DISTINCT FROM '185c251e2c2f56f9f0e32b9afccc2d11' THEN
    RAISE EXCEPTION 'SQL193_CANDIDATE_DRIFT';
  END IF;
  SELECT md5(pg_get_constraintdef(c.oid)) INTO constraint_hash FROM pg_constraint c
    WHERE c.conrelid='receipt_split.splits'::regclass AND c.conname='splits_currency_check';
  EXECUTE format('COMMENT ON CONSTRAINT splits_currency_check ON receipt_split.splits IS %L',
    'SQL193:currency-code:' || constraint_hash);
  COMMENT ON FUNCTION receipt_split.validate_v2(jsonb) IS 'SQL193:currency-code:185c251e2c2f56f9f0e32b9afccc2d11';
END;
$seal$;

COMMIT;
