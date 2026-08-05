-- SQL99 repairs bookkeeping entry JSON validation already installed by SQL98.
-- Stebbi alone runs this migration after the matching read-only preflight.
-- It replaces one private helper function, changes no tables or rows, and is
-- safe to rerun because CREATE OR REPLACE preserves the function identity.

BEGIN;

CREATE OR REPLACE FUNCTION public.bookkeeping_assert_entry_payload(p_entry jsonb)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_entry_type text;
BEGIN
  IF p_entry IS NULL OR jsonb_typeof(p_entry) <> 'object'
     OR (p_entry - ARRAY[
       'request_id', 'entity_id', 'vat_registration_id', 'period_id',
       'entry_id', 'expected_version', 'type', 'document_date',
       'reporting_date', 'counterparty', 'description', 'document_type',
       'document_reference', 'duplicate_reference_confirmed', 'currency',
       'source_type', 'source_id', 'source_reference', 'review_state',
       'original_document_preserved', 'business_purpose_confirmed',
       'seller_vat_registration_confirmed', 'special_cases',
       'special_case_resolution_note', 'note', 'lines'
     ]::text[]) <> '{}'::jsonb
     OR NOT (p_entry ?& ARRAY[
       'type', 'document_date', 'reporting_date', 'description',
       'duplicate_reference_confirmed', 'currency', 'source_type',
       'review_state', 'original_document_preserved',
       'business_purpose_confirmed', 'seller_vat_registration_confirmed',
       'special_cases', 'lines'
     ]::text[]) THEN
    RAISE EXCEPTION 'bookkeeping_invalid_entry';
  END IF;

  v_entry_type := p_entry->>'type';
  IF jsonb_typeof(p_entry->'type') <> 'string'
     OR jsonb_typeof(p_entry->'document_date') <> 'string'
     OR jsonb_typeof(p_entry->'reporting_date') <> 'string'
     OR jsonb_typeof(p_entry->'description') <> 'string'
     OR jsonb_typeof(p_entry->'currency') <> 'string'
     OR jsonb_typeof(p_entry->'source_type') <> 'string'
     OR jsonb_typeof(p_entry->'review_state') <> 'string'
     OR v_entry_type NOT IN ('sale', 'purchase', 'sales_credit', 'purchase_credit')
     OR (p_entry->>'document_date') !~ '^\d{4}-\d{2}-\d{2}$'
     OR (p_entry->>'reporting_date') !~ '^\d{4}-\d{2}-\d{2}$'
     OR char_length(btrim(p_entry->>'description')) NOT BETWEEN 1 AND 500
     OR (p_entry->>'currency') <> 'ISK'
     OR (p_entry->>'source_type') <> 'manual'
     OR coalesce(jsonb_typeof(p_entry->'source_id'), 'null') <> 'null'
     OR coalesce(jsonb_typeof(p_entry->'source_reference'), 'null') <> 'null'
     OR (p_entry->>'review_state') NOT IN ('unreviewed', 'reviewed', 'needs_review')
     OR jsonb_typeof(p_entry->'duplicate_reference_confirmed') <> 'boolean'
     OR jsonb_typeof(p_entry->'original_document_preserved') <> 'boolean'
     OR jsonb_typeof(p_entry->'business_purpose_confirmed') <> 'boolean'
     OR jsonb_typeof(p_entry->'seller_vat_registration_confirmed')
          NOT IN ('boolean', 'null')
     OR (p_entry ? 'counterparty' AND jsonb_typeof(p_entry->'counterparty') NOT IN ('string', 'null'))
     OR (p_entry ? 'counterparty' AND jsonb_typeof(p_entry->'counterparty') = 'string'
       AND char_length(btrim(p_entry->>'counterparty')) NOT BETWEEN 1 AND 200)
     OR (p_entry ? 'document_type' AND jsonb_typeof(p_entry->'document_type') NOT IN ('string', 'null'))
     OR (p_entry ? 'document_type' AND jsonb_typeof(p_entry->'document_type') = 'string'
       AND char_length(btrim(p_entry->>'document_type')) NOT BETWEEN 1 AND 80)
     OR (p_entry ? 'document_reference' AND jsonb_typeof(p_entry->'document_reference') NOT IN ('string', 'null'))
     OR (p_entry ? 'document_reference' AND jsonb_typeof(p_entry->'document_reference') = 'string'
       AND char_length(btrim(p_entry->>'document_reference')) NOT BETWEEN 1 AND 160)
     OR (p_entry ? 'special_case_resolution_note'
       AND jsonb_typeof(p_entry->'special_case_resolution_note') NOT IN ('string', 'null'))
     OR (jsonb_typeof(p_entry->'special_case_resolution_note') = 'string'
       AND char_length(btrim(p_entry->>'special_case_resolution_note')) NOT BETWEEN 1 AND 1000)
     OR (p_entry ? 'note' AND jsonb_typeof(p_entry->'note') NOT IN ('string', 'null'))
     OR (jsonb_typeof(p_entry->'note') = 'string' AND char_length(p_entry->>'note') > 2000)
     OR jsonb_typeof(p_entry->'special_cases') <> 'object'
     OR ((p_entry->'special_cases') - ARRAY[
       'foreign_service', 'import', 'mixed_use', 'uncertain_deductibility'
     ]::text[]) <> '{}'::jsonb
     OR NOT (p_entry->'special_cases' ?& ARRAY[
       'foreign_service', 'import', 'mixed_use', 'uncertain_deductibility'
     ]::text[])
     OR EXISTS (
       SELECT 1 FROM jsonb_each(p_entry->'special_cases') AS special(key, value)
       WHERE jsonb_typeof(special.value) <> 'string'
          OR (special.value #>> '{}') NOT IN ('not_applicable', 'unresolved', 'resolved')
     )
     OR jsonb_typeof(p_entry->'lines') <> 'array'
     OR jsonb_array_length(p_entry->'lines') NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'bookkeeping_invalid_entry';
  END IF;

  IF EXISTS (
       SELECT 1
       FROM jsonb_array_elements(p_entry->'lines') AS line
       WHERE jsonb_typeof(line) <> 'object'
          OR (line - ARRAY[
            'client_key', 'line_id', 'category_code', 'description',
            'vat_treatment', 'currency', 'amount_includes_vat',
            'gross_minor', 'net_minor', 'vat_minor',
            'input_vat_deductibility', 'deductible_vat_minor',
            'manual_vat_override', 'manual_vat_override_reason',
            'exempt_turnover_confirmed'
          ]::text[]) <> '{}'::jsonb
          OR NOT (line ?& ARRAY[
            'client_key', 'vat_treatment', 'currency', 'amount_includes_vat',
            'gross_minor', 'net_minor', 'vat_minor',
            'input_vat_deductibility', 'deductible_vat_minor',
            'manual_vat_override', 'exempt_turnover_confirmed'
          ]::text[])
          OR jsonb_typeof(line->'client_key') <> 'string'
          OR jsonb_typeof(line->'vat_treatment') <> 'string'
          OR jsonb_typeof(line->'currency') <> 'string'
          OR jsonb_typeof(line->'input_vat_deductibility') <> 'string'
          OR char_length(btrim(line->>'client_key')) NOT BETWEEN 1 AND 80
          OR (line ? 'line_id' AND jsonb_typeof(line->'line_id') NOT IN ('string', 'null'))
          OR (jsonb_typeof(line->'line_id') = 'string'
            AND (line->>'line_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
          OR (line ? 'category_code' AND jsonb_typeof(line->'category_code') NOT IN ('string', 'null'))
          OR (jsonb_typeof(line->'category_code') = 'string'
            AND char_length(btrim(line->>'category_code')) NOT BETWEEN 1 AND 80)
          OR (line ? 'description' AND jsonb_typeof(line->'description') NOT IN ('string', 'null'))
          OR (jsonb_typeof(line->'description') = 'string'
            AND char_length(btrim(line->>'description')) NOT BETWEEN 1 AND 500)
          OR (line->>'vat_treatment') NOT IN (
            'taxable_24', 'taxable_11', 'exempt_turnover',
            'outside_scope', 'no_vat', 'needs_review'
          )
          OR (line->>'currency') <> 'ISK'
          OR jsonb_typeof(line->'amount_includes_vat') <> 'boolean'
          OR jsonb_typeof(line->'gross_minor') <> 'number'
          OR (line->>'gross_minor') !~ '^[0-9]+$'
          OR (line->>'gross_minor')::numeric NOT BETWEEN 1 AND 9007199254740991
          OR jsonb_typeof(line->'net_minor') <> 'number'
          OR (line->>'net_minor') !~ '^[0-9]+$'
          OR (line->>'net_minor')::numeric NOT BETWEEN 0 AND 9007199254740991
          OR jsonb_typeof(line->'vat_minor') <> 'number'
          OR (line->>'vat_minor') !~ '^[0-9]+$'
          OR (line->>'vat_minor')::numeric NOT BETWEEN 0 AND 9007199254740991
          OR jsonb_typeof(line->'deductible_vat_minor') <> 'number'
          OR (line->>'deductible_vat_minor') !~ '^[0-9]+$'
          OR (line->>'deductible_vat_minor')::numeric NOT BETWEEN 0 AND 9007199254740991
          OR (line->>'gross_minor')::numeric
             <> (line->>'net_minor')::numeric + (line->>'vat_minor')::numeric
          OR (line->>'deductible_vat_minor')::numeric > (line->>'vat_minor')::numeric
          OR (line->>'input_vat_deductibility') NOT IN (
            'not_applicable', 'fully_deductible', 'partially_deductible',
            'not_deductible', 'needs_review'
          )
          OR jsonb_typeof(line->'manual_vat_override') <> 'boolean'
          OR (line ? 'manual_vat_override_reason'
            AND jsonb_typeof(line->'manual_vat_override_reason') NOT IN ('string', 'null'))
          OR jsonb_typeof(line->'exempt_turnover_confirmed') <> 'boolean'
     )
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_entry->'lines') AS line
       GROUP BY line->>'client_key' HAVING count(*) > 1
     )
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_entry->'lines') AS line
       WHERE jsonb_typeof(line->'line_id') = 'string'
       GROUP BY line->>'line_id' HAVING count(*) > 1
     ) THEN
    RAISE EXCEPTION 'bookkeeping_invalid_entry_lines';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_entry->'lines') AS line
    CROSS JOIN LATERAL (
      SELECT CASE line->>'vat_treatment'
        WHEN 'taxable_24' THEN 24
        WHEN 'taxable_11' THEN 11
        ELSE 0
      END::numeric AS rate
    ) AS tax
    WHERE
      (v_entry_type IN ('sale', 'sales_credit') AND line->>'vat_treatment' = 'no_vat')
      OR (v_entry_type IN ('purchase', 'purchase_credit') AND line->>'vat_treatment' = 'exempt_turnover')
      OR (tax.rate = 0 AND line->>'vat_treatment' <> 'needs_review'
        AND (line->>'vat_minor')::numeric <> 0)
      OR (
        tax.rate > 0
        AND NOT (line->>'manual_vat_override')::boolean
        AND (
          CASE WHEN (line->>'amount_includes_vat')::boolean THEN
            round((line->>'gross_minor')::numeric * tax.rate / (100 + tax.rate))
              <> (line->>'vat_minor')::numeric
            OR (line->>'gross_minor')::numeric
              - round((line->>'gross_minor')::numeric * tax.rate / (100 + tax.rate))
              <> (line->>'net_minor')::numeric
          ELSE
            round((line->>'net_minor')::numeric * tax.rate / 100)
              <> (line->>'vat_minor')::numeric
            OR (line->>'net_minor')::numeric
              + round((line->>'net_minor')::numeric * tax.rate / 100)
              <> (line->>'gross_minor')::numeric
          END
        )
      )
      OR ((line->>'manual_vat_override')::boolean AND (
        jsonb_typeof(line->'manual_vat_override_reason') <> 'string'
        OR char_length(btrim(line->>'manual_vat_override_reason')) NOT BETWEEN 1 AND 500
      ))
      OR (NOT (line->>'manual_vat_override')::boolean
        AND jsonb_typeof(line->'manual_vat_override_reason') = 'string')
      OR (v_entry_type IN ('sale', 'sales_credit') AND (
        line->>'input_vat_deductibility' <> 'not_applicable'
        OR (line->>'deductible_vat_minor')::numeric <> 0
      ))
      OR (v_entry_type IN ('purchase', 'purchase_credit') AND tax.rate > 0 AND (
        (line->>'input_vat_deductibility' = 'fully_deductible'
          AND (line->>'deductible_vat_minor')::numeric <> (line->>'vat_minor')::numeric)
        OR (line->>'input_vat_deductibility' = 'partially_deductible' AND (
          (line->>'deductible_vat_minor')::numeric <= 0
          OR (line->>'deductible_vat_minor')::numeric >= (line->>'vat_minor')::numeric
        ))
        OR (line->>'input_vat_deductibility' = 'not_deductible'
          AND (line->>'deductible_vat_minor')::numeric <> 0)
      ))
      OR (v_entry_type IN ('purchase', 'purchase_credit') AND tax.rate = 0 AND (
        line->>'input_vat_deductibility' <> 'not_applicable'
        OR (line->>'deductible_vat_minor')::numeric <> 0
      ))
  ) THEN
    RAISE EXCEPTION 'bookkeeping_invalid_vat_line';
  END IF;
END;
$$;

-- The validator is a private helper. Reassert default-deny in case a target
-- environment accumulated a grant outside the canonical SQL98 rollout.
REVOKE ALL ON FUNCTION public.bookkeeping_assert_entry_payload(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
