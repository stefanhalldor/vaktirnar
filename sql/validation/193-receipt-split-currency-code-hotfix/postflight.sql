-- SQL193 POSTFLIGHT: read-only exact function, constraint seal and PLN validation.
BEGIN TRANSACTION READ ONLY;
DO $probe$
DECLARE payload jsonb; bad_code text; checks_result record;
BEGIN
WITH target AS (
  SELECT p.* FROM pg_proc p
  WHERE p.oid = to_regprocedure('receipt_split.validate_v2(jsonb)')
), checks AS (
  SELECT
    (SELECT count(*) = 1 AND bool_and(md5(replace(prosrc,E'\r\n',E'\n')) =
      '185c251e2c2f56f9f0e32b9afccc2d11') FROM target) AS body_ok,
    (SELECT count(*) = 1 AND bool_and(NOT prosecdef AND provolatile='v'
      AND proowner='postgres'::regrole AND proconfig=ARRAY['search_path=""']::text[]
      AND NOT has_function_privilege('anon',oid,'EXECUTE')
      AND NOT has_function_privilege('authenticated',oid,'EXECUTE')
      AND NOT has_function_privilege('service_role',oid,'EXECUTE')) FROM target) AS function_security_ok,
    (SELECT count(*) = 1 AND bool_and(c.convalidated AND c.contype='c'
      AND obj_description(c.oid,'pg_constraint') = 'SQL193:currency-code:' || md5(pg_get_constraintdef(c.oid))
      AND regexp_replace(pg_get_expr(c.conbin,c.conrelid),'[[:space:]()]','','g') =
        $expected$contract_version=1ANDcurrency=ANYARRAY['ISK'::text,'EUR'::text,'USD'::text,'GBP'::text,'DKK'::text,'NOK'::text,'SEK'::text]ORcontract_version=2ANDcurrency~'^[A-Z]{3}$'::text$expected$)
      FROM pg_constraint c WHERE c.conrelid=to_regclass('receipt_split.splits')
        AND c.conname='splits_currency_check') AS constraint_ok
)
SELECT * INTO checks_result FROM checks;
  IF NOT coalesce(checks_result.body_ok AND checks_result.function_security_ok
      AND checks_result.constraint_ok, false) THEN
    RAISE EXCEPTION 'SQL193_POSTFLIGHT_DRIFT';
  END IF;
  payload := jsonb_build_object('contract_version',2,'quantity_scale',3000,
    'title','PLN verification','currency','PLN','incurred_on','2026-09-18',
    'receipt_total_minor',2100,'items',(
      SELECT jsonb_agg(jsonb_build_object('kind','item','description','Line ' || n,
        'quantity_units',3000,'total_minor',100,'confidence_basis_points',10000,'needs_review',false))
      FROM generate_series(1,21) n));
  PERFORM receipt_split.validate_v2(payload);
  FOREACH bad_code IN ARRAY ARRAY['PL','pln','PLNN','P1N',''] LOOP
    BEGIN
      PERFORM receipt_split.validate_v2(jsonb_set(payload,'{currency}',to_jsonb(bad_code)));
      RAISE EXCEPTION 'SQL193_INVALID_CURRENCY_ACCEPTED';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM <> 'split_invalid' THEN RAISE; END IF;
    END;
  END LOOP;
END;
$probe$;
SELECT 'PASS' AS gate, true AS body_ok, true AS function_security_ok,
  true AS constraint_ok, true AS pln_contract_ok, true AS invalid_codes_rejected;
COMMIT;
