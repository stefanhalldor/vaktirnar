import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(process.cwd(), 'sql/98_bookkeeping_vat_workbook.sql'),
  'utf8',
)
const preflight = readFileSync(
  join(
    process.cwd(),
    'sql/validation/98-bookkeeping-vat-workbook/preflight.sql',
  ),
  'utf8',
)
const postflight = readFileSync(
  join(
    process.cwd(),
    'sql/validation/98-bookkeeping-vat-workbook/postflight.sql',
  ),
  'utf8',
)
const sql95 = readFileSync(
  join(process.cwd(), 'sql/95_teskeid_agent_collaboration.sql'),
  'utf8',
)
const sql96 = readFileSync(
  join(process.cwd(), 'sql/96_expenses_core.sql'),
  'utf8',
)
const TABLES = [
  'bookkeeping_entities',
  'bookkeeping_entity_members',
  'bookkeeping_vat_registrations',
  'bookkeeping_periods',
  'bookkeeping_entries',
  'bookkeeping_entry_lines',
  'bookkeeping_entry_revisions',
  'bookkeeping_filing_snapshots',
  'bookkeeping_activity',
  'bookkeeping_mutation_requests',
] as const

const SERVICE_RPCS = [
  'bookkeeping_calculate_period_summary',
  'bookkeeping_period_readiness',
  'bookkeeping_create_entity',
  'bookkeeping_add_vat_registration',
  'bookkeeping_create_period',
  'bookkeeping_create_entry',
  'bookkeeping_update_entry',
  'bookkeeping_set_entry_review_status',
  'bookkeeping_void_entry',
  'bookkeeping_set_period_ready',
  'bookkeeping_record_filing',
  'bookkeeping_reopen_period',
  'bookkeeping_record_payment',
  'bookkeeping_get_dashboard',
  'bookkeeping_get_period',
  'bookkeeping_get_entry',
  'bookkeeping_prepare_account_deletion',
] as const

function functionBody(name: string): string {
  const marker = `CREATE OR REPLACE FUNCTION public.${name}`
  const start = sql.indexOf(marker)
  expect(start).toBeGreaterThanOrEqual(0)
  const next = sql.indexOf('CREATE OR REPLACE FUNCTION public.', start + marker.length)
  return sql.slice(start, next < 0 ? sql.length : next)
}

function removeSqlComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*--.*$/gm, '')
    .trim()
}

function removeSqlStringLiterals(source: string): string {
  return source.replace(/'(?:''|[^'])*'/g, "''")
}

describe('SQL98 bookkeeping migration boundary and catalog integration', () => {
  it('is one transaction and explicitly never applies itself', () => {
    expect(sql).toMatch(/^BEGIN;/m)
    expect(sql).toMatch(/^COMMIT;/m)
    expect(sql.indexOf('BEGIN;')).toBeLessThan(sql.indexOf('COMMIT;'))
    expect(sql).toContain('Stebbi alone reviews')
  })

  it('preserves the live feature union and documents cross-migration compatibility', () => {
    expect(sql).toContain('pg_catalog.pg_get_expr(constraint_row.conbin')
    expect(sql).toContain("v_expression NOT LIKE '%bokhaldid%'")
    expect(sql).toContain("OR feature_key = %L")
    expect(sql).toContain("'bokhaldid'")
    expect(sql).toContain('SQL95 remains separately gated and is not a prerequisite')
    expect(sql).not.toMatch(/INSERT INTO public\.feature_access/i)
    expect(preflight).toContain('feature_constraint_contains_agent_key')
    expect(preflight).toContain('feature_key_compatibility_note')
    expect(preflight).toContain('SQL96 as a whole must not be rerun after SQL97')
    expect(preflight).not.toContain('feature_constraint_contains_sql95_key')
    expect(postflight).toContain("('bokhaldid')")
    expect(postflight).toContain('missing_required_feature_keys')
  })

  it.each([
    ['SQL96', sql96, 'utlagt-og-endurgreitt'],
    ['SQL98', sql, 'bokhaldid'],
  ])('%s preserves the existing feature expression and adds only its own key', (_name, source, key) => {
    const featureBlock = source.slice(0, 4_500)

    expect(featureBlock).toContain('pg_catalog.pg_get_expr(constraint_row.conbin')
    expect(featureBlock).toContain(`v_expression NOT LIKE '%${key}%'`)
    expect(featureBlock).toContain('CHECK ((%s) OR feature_key = %L)')
    expect(featureBlock).toContain(`'${key}'`)
  })

  it('documents legacy SQL95 as order-sensitive after the bookkeeping rollout', () => {
    const featureBlock = sql95.slice(0, sql95.indexOf('-- Conversations'))

    expect(featureBlock).toContain("'agent-collaboration-private-beta'")
    expect(featureBlock).toContain("'utlagt-og-endurgreitt'")
    expect(featureBlock).not.toContain("'bokhaldid'")
    expect(preflight).toContain('Stale SQL95/SQL96 copies can remove bokhaldid')
  })

  it('seeds the exact home catalog dependency without overwriting existing admin copy', () => {
    expect(sql).toContain('INSERT INTO public.ideas')
    expect(sql).toContain("'Bókhaldið'")
    expect(sql).toContain("'bokhaldid'")
    expect(sql).toContain("'building'")
    expect(sql).toContain("'Útgjöld'")
    expect(sql).toContain('ON CONFLICT (slug) DO NOTHING')
    expect(postflight).toContain("slug = 'bokhaldid' AND is_public")
  })

  it('creates every dedicated table idempotently', () => {
    for (const table of TABLES) {
      expect(sql).toMatch(new RegExp(
        `CREATE TABLE IF NOT EXISTS public\\.${table}\\b`,
        'i',
      ))
    }
  })
})

describe('SQL98 durable tenant and VAT model', () => {
  it('uses nullable auth snapshots and restricts every financial cascade', () => {
    expect(sql).toMatch(/user_id\s+uuid\s+NULL REFERENCES auth\.users\(id\) ON DELETE SET NULL/i)
    expect(sql).toMatch(/created_by\s+uuid\s+NULL REFERENCES auth\.users\(id\) ON DELETE SET NULL/i)
    expect(sql).toContain('bookkeeping_entity_members_owner_unique')
    expect(sql).toContain('bookkeeping_periods_registration_fk')
    expect(sql).toContain('bookkeeping_entries_period_fk')
    expect(sql).toContain('bookkeeping_entries_registration_fk')
    expect(sql).toContain('bookkeeping_entry_lines_entry_fk')
    expect(sql).not.toMatch(/bookkeeping_[a-z_]+\([^)]*\) ON DELETE CASCADE/i)
    expect(functionBody('bookkeeping_member_unlink_auth_snapshot')).toContain(
      "NEW.status := 'unlinked'",
    )
    const immutable = functionBody('bookkeeping_reject_immutable_change')
    expect(immutable).toContain("TG_TABLE_NAME = 'bookkeeping_filing_snapshots'")
    expect(immutable).toContain("v_old - 'created_by'")
  })

  it('supports every exact domain enum without conflating zero VAT and field C', () => {
    for (const value of [
      'general_bimonthly', 'monthly', 'annual', 'agricultural', 'other',
      'draft', 'review', 'ready', 'submitted', 'paid',
      'sale', 'purchase', 'sales_credit', 'purchase_credit',
      'unreviewed', 'reviewed', 'needs_review',
      'taxable_24', 'taxable_11', 'exempt_turnover', 'outside_scope', 'no_vat',
      'not_applicable', 'fully_deductible', 'partially_deductible', 'not_deductible',
      'unresolved', 'resolved',
    ]) {
      expect(sql).toContain(`'${value}'`)
    }
    expect(sql).toContain('bookkeeping_entry_lines_vat_treatment_check')
    expect(sql).toContain('exempt_turnover_confirmed')
  })

  it('stores stable input mode and exact safe-integer line arithmetic', () => {
    const validator = functionBody('bookkeeping_assert_entry_payload')

    expect(sql).toMatch(/amount_includes_vat\s+boolean\s+NOT NULL DEFAULT true/i)
    expect(sql).toContain('9007199254740991')
    expect(sql).toContain('gross_minor = net_minor + vat_minor')
    expect(sql).toContain('deductible_vat_minor <= vat_minor')
    expect(validator).toContain(
      "round((line->>'gross_minor')::numeric * tax.rate / (100 + tax.rate))",
    )
    expect(validator).toContain(
      "round((line->>'net_minor')::numeric * tax.rate / 100)",
    )
    expect(validator).toContain("OR ((p_entry->'special_cases') - ARRAY[")
    expect(validator).not.toContain("OR (p_entry->'special_cases' - ARRAY[")
  })

  it('retains prior line revisions and rejects hard deletes', () => {
    expect(sql).toContain('entry_version')
    expect(sql).toContain('superseded_at')
    expect(functionBody('bookkeeping_replace_entry_lines')).toContain(
      'SET active = false, superseded_at = now()',
    )
    expect(functionBody('bookkeeping_replace_entry_lines')).not.toContain(
      'DELETE FROM public.bookkeeping_entry_lines',
    )
    for (const table of TABLES.slice(0, 6)) {
      expect(sql).toContain(`BEFORE DELETE ON public.${table}`)
    }
    expect(functionBody('bookkeeping_reject_delete')).toContain(
      "RAISE EXCEPTION 'bookkeeping_hard_delete_forbidden'",
    )
    const lineGuard = functionBody('bookkeeping_guard_line_revision_update')
    expect(lineGuard).toContain('OLD.active AND NOT NEW.active')
    expect(lineGuard).toContain("to_jsonb(OLD) - ARRAY['active', 'superseded_at']")
    expect(lineGuard).toContain('OLD.created_by IS NOT NULL AND NEW.created_by IS NULL')
    expect(lineGuard).toContain("RAISE EXCEPTION 'bookkeeping_immutable_line_revision'")
    expect(sql).toContain('bookkeeping_entry_lines_revision_guard')
  })

  it('captures a private immutable header snapshot for every entry version', () => {
    const capture = functionBody('bookkeeping_capture_entry_revision')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.bookkeeping_entry_revisions')
    expect(sql).toContain('BEFORE UPDATE OR DELETE ON public.bookkeeping_entry_revisions')
    expect(capture).toContain('INSERT INTO public.bookkeeping_entry_revisions')
    for (const key of [
      'documentDate', 'reportingDate', 'counterparty', 'documentReference',
      'reviewState', 'originalDocumentPreserved', 'foreignServiceState',
      'uncertainDeductibilityState', 'status', 'voidedReason',
    ]) {
      expect(capture).toContain(`'${key}'`)
    }
    for (const rpc of [
      'bookkeeping_create_entry', 'bookkeeping_update_entry',
      'bookkeeping_set_entry_review_status', 'bookkeeping_void_entry',
    ]) {
      expect(functionBody(rpc)).toContain('bookkeeping_capture_entry_revision')
    }
    expect(functionBody('bookkeeping_set_entry_review_status')).toContain(
      'bookkeeping_clone_entry_lines',
    )
    expect(functionBody('bookkeeping_void_entry')).toContain(
      'bookkeeping_clone_entry_lines',
    )
  })

  it('keeps filing snapshots immutable and constrains all A-F identities', () => {
    expect(sql).toContain('BEFORE UPDATE OR DELETE ON public.bookkeeping_filing_snapshots')
    expect(sql).toContain('f_minor = d_minor - e_minor')
    expect(sql).toContain('d_minor = output_vat_24_minor + output_vat_11_minor')
    expect(sql).toContain('e_minor = input_vat_24_minor + input_vat_11_minor')
    expect(sql).toContain('bookkeeping_filing_snapshots_mismatch_check')
  })
})

describe('SQL98 default-deny and server authority', () => {
  it('enables RLS and revokes all direct table privileges including service_role', () => {
    for (const table of TABLES) {
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`)
      expect(sql).toContain(
        `REVOKE ALL ON public.${table} FROM PUBLIC, anon, authenticated, service_role;`,
      )
      expect(sql).not.toMatch(new RegExp(
        `GRANT\\s+[^;]*ON\\s+public\\.${table}[^;]*TO\\s+(?:anon|authenticated|service_role)`,
        'i',
      ))
    }
    expect(sql).not.toMatch(/CREATE POLICY/i)
  })

  it('makes every app RPC fixed-search-path, security-definer and service-role-only', () => {
    for (const rpc of SERVICE_RPCS) {
      const body = functionBody(rpc)
      expect(body).toContain('SECURITY DEFINER')
      expect(body).toContain("SET search_path = ''")
      expect(sql).toMatch(new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${rpc}\\([\\s\\S]*?\\)\\s+FROM PUBLIC, anon, authenticated, service_role;`,
      ))
      expect(sql).toMatch(new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${rpc}\\([\\s\\S]*?\\)\\s+TO service_role;`,
      ))
      expect(sql).not.toMatch(new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${rpc}\\([^;]*TO (?:anon|authenticated)`,
        'i',
      ))
    }
  })

  it('rechecks canonical-email entitlement, owner membership and request identity', () => {
    const access = functionBody('bookkeeping_has_beta_access')
    const begin = functionBody('bookkeeping_begin_request')
    expect(access).toContain('public.normalize_email_canonical(access.email)')
    expect(access).toContain("access.feature_key = 'bokhaldid'")
    expect(begin).toContain('pg_catalog.pg_advisory_xact_lock')
    expect(begin).toContain('public.bookkeeping_assert_beta_actor(p_actor_id)')
    expect(begin).toContain('ON CONFLICT (actor_user_id, request_id) DO NOTHING')
    expect(begin).toContain("RAISE EXCEPTION 'bookkeeping_idempotency_conflict'")
    expect(functionBody('bookkeeping_assert_owner')).toContain(
      "IS DISTINCT FROM 'owner'",
    )
    expect(functionBody('bookkeeping_assert_owner')).not.toContain("<> 'owner'")
    for (const readRpc of ['bookkeeping_get_period', 'bookkeeping_get_entry']) {
      expect(functionBody(readRpc)).toContain("IS DISTINCT FROM 'owner'")
      expect(functionBody(readRpc)).not.toContain("<> 'owner'")
    }
    for (const rpc of [
      'bookkeeping_add_vat_registration', 'bookkeeping_create_period',
      'bookkeeping_create_entry', 'bookkeeping_update_entry',
      'bookkeeping_set_period_ready', 'bookkeeping_record_filing',
    ]) {
      expect(functionBody(rpc)).toContain('bookkeeping_assert_owner')
    }
  })

  it('never projects bookkeeping details into shared recent events', () => {
    expect(sql).not.toContain('public.recent_events')
    const audit = functionBody('bookkeeping_record_activity')
    for (const forbidden of [
      'amount', 'email', 'counterparty', 'document_reference',
      'legal_identifier', 'vat_number',
    ]) {
      expect(audit.toLowerCase()).not.toContain(`'${forbidden}'`)
    }
    expect(sql).toContain('Append-only private lifecycle audit')
  })

  it('keeps the legal identifier out of all browser-facing read projections', () => {
    const entityProjection = functionBody('bookkeeping_entity_json')
    expect(entityProjection).not.toContain("'legalIdentifier'")
    expect(entityProjection).not.toContain('entity.legal_identifier')
  })

  it('postflight schema-qualifies trigger functions and verifies the full feature union', () => {
    expect(postflight).toContain('procedure_namespace.nspname AS function_schema')
    expect(postflight).toContain('expected.function_schema = present.function_schema')
    expect(postflight).not.toContain("AND procedure_namespace.nspname = 'public'")
    expect(postflight).toContain('entry_validator_operator_precedence_ok')
    expect(postflight).toContain("'((p_entry->''special_cases'') - ARRAY['")
    expect(postflight).toContain('expected_feature_keys(name) AS')
    for (const key of [
      'umonnun', 'tengsl', 'facebook-oauth', 'vedrid', 'ferdalagid',
      'elta-vedrid', 'weather-provider-vedurstofan', 'weather-pulse',
      'weather-provider-vegagerdin', 'road-intelligence-v1',
      'teskeid-routing-v1', 'agent-collaboration-private-beta',
      'utlagt-og-endurgreitt', 'bokhaldid',
    ]) {
      expect(postflight).toContain(`('${key}')`)
    }
    expect(postflight).toContain('missing_required_feature_keys')
  })
})

describe('SQL98 VAT authority, readiness and lifecycle', () => {
  it('server-derives A-F from reviewed active current lines and actual VAT values', () => {
    const summary = functionBody('bookkeeping_calculate_period_summary')
    expect(summary).toContain("SELECT 'A'::text")
    expect(summary).toContain("SELECT 'B'")
    expect(summary).toContain("SELECT 'C'")
    expect(summary).toContain("SELECT 'D'")
    expect(summary).toContain("SELECT 'E'")
    expect(summary).toContain("'F', totals.d - totals.e")
    expect(summary).toContain("entry.review_state = 'reviewed'")
    expect(summary).toContain("entry.status = 'active'")
    expect(summary).toContain('line.vat_minor')
    expect(summary).toContain('line.deductible_vat_minor')
    expect(summary).toContain('seller_vat_registration_confirmed IS TRUE')
  })

  it('atomically rejects every mutation that could create an unsafe period total', () => {
    const guard = functionBody('bookkeeping_assert_period_summary_safe')
    expect(guard).toContain('greatest(')
    expect(guard).toContain('abs(v_d - v_e)')
    expect(guard).toContain('9007199254740991')
    expect(guard).toContain("RAISE EXCEPTION 'bookkeeping_amount_overflow'")
    for (const rpc of [
      'bookkeeping_create_entry', 'bookkeeping_update_entry',
      'bookkeeping_set_entry_review_status', 'bookkeeping_void_entry',
      'bookkeeping_set_period_ready', 'bookkeeping_record_filing',
    ]) {
      expect(functionBody(rpc)).toContain('bookkeeping_assert_period_summary_safe')
    }
  })

  it('returns trace IDs for every A-F field without source-document content', () => {
    const summary = functionBody('bookkeeping_calculate_period_summary')
    for (const field of ['A', 'B', 'C', 'D', 'E', 'F']) {
      expect(summary).toContain(`'${field}'`)
    }
    expect(summary).toContain("'entryId', entry_id")
    expect(summary).toContain("'lineId', line_id")
    expect(summary).not.toContain('documentReference')
    expect(summary).not.toContain('counterparty')
  })

  it('blocks every required evidence, duplicate and special-case gap', () => {
    const readiness = functionBody('bookkeeping_period_readiness')
    for (const blocker of [
      'entity_details_unconfirmed', 'vat_registration_inactive',
      'vat_registration_details_unconfirmed', 'period_dates_unconfirmed',
      'period_dates_invalid', 'live_form_not_compared', 'entry_outside_period',
      'entry_has_no_lines', 'entry_unreviewed', 'entry_needs_review',
      'vat_treatment_needs_review', 'input_deductibility_needs_review',
      'exempt_turnover_unconfirmed', 'input_document_reference_missing',
      'input_original_document_unconfirmed', 'input_business_purpose_unconfirmed',
      'input_seller_vat_registration_unconfirmed', 'duplicate_document_reference',
      'foreign_service_unresolved', 'import_unresolved', 'mixed_use_unresolved',
      'uncertain_deductibility_unresolved', 'special_case_resolution_note_missing',
    ]) {
      expect(readiness).toContain(`'${blocker}'`)
    }
    expect(readiness).toContain("'isReady'")
    expect(readiness).toContain("'blockerCounts'")
  })

  it('uses CAS and locks submitted periods until a reasoned reopen', () => {
    for (const rpc of [
      'bookkeeping_update_entry', 'bookkeeping_set_entry_review_status',
      'bookkeeping_void_entry', 'bookkeeping_set_period_ready',
      'bookkeeping_record_filing', 'bookkeeping_reopen_period',
      'bookkeeping_record_payment',
    ]) {
      const body = functionBody(rpc)
      expect(body).toContain('FOR UPDATE')
      expect(body).toContain('p_expected_version')
      expect(body).toContain("RAISE EXCEPTION 'bookkeeping_version_conflict'")
    }
    expect(functionBody('bookkeeping_update_entry')).toContain(
      "v_period.state NOT IN ('draft', 'review')",
    )
    expect(functionBody('bookkeeping_reopen_period')).toContain(
      "v_period.state NOT IN ('ready', 'submitted', 'paid')",
    )
    expect(sql).toContain('char_length(btrim(p_reason)) NOT BETWEEN 1 AND 1000')
  })

  it('records only a locked server-derived filing snapshot and validates client A-F', () => {
    const filing = functionBody('bookkeeping_record_filing')
    expect((filing.match(/p_request_id uuid/g) ?? [])).toHaveLength(1)
    expect((filing.match(/v_period\.entity_id, p_period_id, NULL, 'filing_recorded', p_actor_id/g) ?? []))
      .toHaveLength(1)
    expect(filing).toContain('p_fields jsonb')
    expect(filing).toContain('bookkeeping_calculate_period_summary')
    expect(filing).toContain("p_fields <> v_summary->'fields'")
    expect(filing).toContain("RAISE EXCEPTION 'bookkeeping_filing_summary_conflict'")
    expect(filing).toContain('p_result_mismatch_reason')
    expect(filing).toContain('p_payment_status')
    expect(filing).toContain('INSERT INTO public.bookkeeping_filing_snapshots')
    expect(filing.indexOf('FOR UPDATE')).toBeLessThan(
      filing.indexOf('INSERT INTO public.bookkeeping_filing_snapshots'),
    )
  })

  it('preserves financial rows during account unlinking', () => {
    const cleanup = functionBody('bookkeeping_prepare_account_deletion')
    const touch = functionBody('bookkeeping_touch_updated_at')
    expect(cleanup).toContain("access.feature_key = 'bokhaldid'")
    expect(cleanup).toContain("SET user_id = NULL, status = 'unlinked'")
    expect(cleanup).toContain('SET actor_user_id = NULL')
    expect(cleanup).not.toMatch(
      /DELETE FROM public\.bookkeeping_(?:entities|entity_members|vat_registrations|periods|entries|entry_lines|entry_revisions|filing_snapshots|activity)\b/i,
    )
    expect(touch).toContain('NEW.updated_at := OLD.updated_at')
    expect(touch).toContain("v_old->'created_by' <> 'null'::jsonb")
    expect(touch).toContain("v_new->'voided_by'")
  })
})

describe('SQL98 app-facing JSON contracts and validation scripts', () => {
  it('exposes the complete create/edit/submit/read surface', () => {
    const create = functionBody('bookkeeping_create_entity')
    expect(create).toContain("'entity_id'")
    expect(create).toContain("'member_id'")
    expect(create).toContain("'registration_id'")
    expect(functionBody('bookkeeping_add_vat_registration')).toContain(
      "'registration_id'",
    )
    const entryJson = functionBody('bookkeeping_entry_json')
    for (const key of [
      'vatRegistrationId', 'duplicateReferenceConfirmed', 'amountIncludesVat',
      'evidence', 'specialCases', 'uncertainDeductibility', 'note', 'lines',
    ]) {
      expect(entryJson).toContain(`'${key}'`)
    }
    expect(sql).toContain(
      'bookkeeping_entries_note_check CHECK (note IS NULL OR char_length(note) <= 2000)',
    )
    const period = functionBody('bookkeeping_get_period')
    for (const key of ['entity', 'registration', 'period', 'entries', 'summary', 'readiness', 'filing']) {
      expect(period).toContain(`'${key}'`)
    }
  })

  it('keeps both validation scripts strictly read-only single-query checks', () => {
    for (const script of [preflight, postflight]) {
      const executable = removeSqlComments(script)
      expect(executable.toUpperCase().startsWith('WITH ')).toBe(true)
      expect(removeSqlStringLiterals(executable)).not.toMatch(
        /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|CALL|DO)\b/i,
      )
      expect(executable.match(/;/g)).toHaveLength(1)
    }
    expect(preflight).toContain('transactions_older_than_five_minutes')
    expect(preflight).toContain("('public', 'ideas', 'problem_description')")
    expect(preflight).toContain("('public', 'ideas', 'possible_solution')")
    expect(preflight).toContain('idea_slug_conflict_target_ok')
    expect(postflight).toContain('browser_table_grants')
    expect(postflight).toContain('service_role_table_grants')
    expect(postflight).toContain('browser_column_grants')
    expect(postflight).toContain('service_role_column_grants')
    expect(postflight).toContain('browser_function_execute')
    expect(postflight).toContain('unexpected_bookkeeping_function_overloads')
    expect(postflight).toContain('service_role_private_helper_execute')
    expect(postflight).toContain("('bookkeeping_record_filing', 'uuid, uuid, uuid, bigint, date, date, jsonb, bigint, text, text, text, text, date', true)")
    expect(postflight).toContain('triggers_ok')
    expect(postflight).toContain('rpc_security_configuration_ok')
    expect(postflight).toContain('unexpected_bookkeeping_triggers')
    expect(postflight).toContain('expected_entry_versions')
    expect(postflight).toContain('line_lifecycle_violations')
    expect(postflight).toContain('filing_lifecycle_violations')
    expect(postflight).toContain('revision_lifecycle_violations')
    expect(postflight).toContain("'member_unlinked'")
  })
})
