-- SQL104 repairs JSONB operator precedence in the expense revision snapshot
-- validator already installed by SQL97 or SQL103.
-- Stebbi alone runs this migration after the matching read-only preflight.
-- It replaces one private helper function, changes no tables or rows, and is
-- safe to rerun because CREATE OR REPLACE preserves the function identity.

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.expense_valid_revision_snapshot(jsonb)') IS NULL
     OR to_regclass('public.expense_revisions') IS NULL THEN
    RAISE EXCEPTION 'expense_revision_snapshot_prerequisites_missing';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.expense_valid_revision_snapshot(p_snapshot jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_expense jsonb;
  v_summary jsonb;
BEGIN
  IF p_snapshot IS NULL OR jsonb_typeof(p_snapshot) <> 'object'
     OR octet_length(p_snapshot::text) > 65536
     OR NOT (p_snapshot ?& ARRAY['version','groupStatus','expense','payments','shares','balances','repaymentSummary'])
     OR (p_snapshot - ARRAY['version','groupStatus','expense','payments','shares','balances','repaymentSummary']::text[]) <> '{}'::jsonb
     OR p_snapshot->>'version' <> '1'
     OR p_snapshot->>'groupStatus' NOT IN ('active','settling','settled','closed')
     OR jsonb_typeof(p_snapshot->'payments') <> 'array'
     OR jsonb_typeof(p_snapshot->'shares') <> 'array'
     OR jsonb_typeof(p_snapshot->'balances') <> 'array'
     OR jsonb_array_length(p_snapshot->'payments') NOT BETWEEN 1 AND 50
     OR jsonb_array_length(p_snapshot->'shares') NOT BETWEEN 1 AND 50
     OR jsonb_array_length(p_snapshot->'balances') > 50 THEN RETURN false; END IF;
  v_expense := p_snapshot->'expense';
  v_summary := p_snapshot->'repaymentSummary';
  IF jsonb_typeof(v_expense) <> 'object'
     OR NOT (v_expense ?& ARRAY['title','note','totalMinor','currency','incurredOn','category','splitMethod'])
     OR (v_expense - ARRAY['title','note','totalMinor','currency','incurredOn','category','splitMethod']::text[]) <> '{}'::jsonb
     OR char_length(btrim(v_expense->>'title')) NOT BETWEEN 1 AND 200
     OR (v_expense->>'totalMinor') !~ '^[0-9]+$'
     OR (v_expense->>'totalMinor')::numeric NOT BETWEEN 1 AND 9007199254740991
     OR (v_expense->>'currency') !~ '^[A-Z]{3}$'
     OR (v_expense->>'incurredOn') !~ '^\d{4}-\d{2}-\d{2}$'
     OR ((v_expense->'note') <> 'null'::jsonb AND char_length(v_expense->>'note') > 1000)
     OR ((v_expense->'category') <> 'null'::jsonb AND v_expense->>'category' NOT IN (
       'food','accommodation','transport','travel','home','entertainment','gifts','shopping','other'
     ))
     OR v_expense->>'splitMethod' NOT IN (
       'equal','percentage','fixed','mixed_equal_remainder','mixed_percentage_remainder','weighted'
     ) THEN RETURN false; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements((p_snapshot->'payments') || (p_snapshot->'shares')) AS item
    WHERE jsonb_typeof(item) <> 'object'
       OR NOT (item ?& ARRAY['memberId','displayName','amountMinor'])
       OR (item - ARRAY['memberId','displayName','amountMinor']::text[]) <> '{}'::jsonb
       OR (item->>'memberId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       OR char_length(btrim(item->>'displayName')) NOT BETWEEN 1 AND 120
       OR (item->>'amountMinor') !~ '^[0-9]+$'
       OR (item->>'amountMinor')::numeric NOT BETWEEN 0 AND 9007199254740991
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_snapshot->'balances') AS item
    WHERE jsonb_typeof(item) <> 'object'
       OR NOT (item ?& ARRAY['memberId','displayName','currency','amountMinor'])
       OR (item - ARRAY['memberId','displayName','currency','amountMinor']::text[]) <> '{}'::jsonb
       OR (item->>'memberId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       OR char_length(btrim(item->>'displayName')) NOT BETWEEN 1 AND 120
       OR (item->>'currency') !~ '^[A-Z]{3}$'
       OR (item->>'amountMinor') !~ '^-?[0-9]+$'
       OR abs((item->>'amountMinor')::numeric) > 9007199254740991
  ) THEN RETURN false; END IF;
  IF jsonb_typeof(v_summary) <> 'object'
     OR NOT (v_summary ?& ARRAY['reported','confirmed','rejected','cancelled'])
     OR (v_summary - ARRAY['reported','confirmed','rejected','cancelled']::text[]) <> '{}'::jsonb
     OR EXISTS (
       SELECT 1 FROM jsonb_each(v_summary) AS entry
       WHERE jsonb_typeof(entry.value) <> 'number'
          OR entry.value::text !~ '^[0-9]+$'
          OR (entry.value::text)::numeric > 1000000
     ) THEN RETURN false; END IF;
  RETURN true;
EXCEPTION WHEN others THEN
  RETURN false;
END;
$$;

-- The validator is a private helper. Reassert default-deny in case a target
-- environment accumulated a grant outside the canonical SQL97/103 rollout.
REVOKE ALL ON FUNCTION public.expense_valid_revision_snapshot(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
