import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql170DiagnosticPath =
  'sql/validation/170-expense-dashboard-presentations/diagnose-runtime-unavailable-branch.sql'
const immutableSql170DiagnosticPath =
  'sql/validation/170-expense-dashboard-presentations/diagnose-runtime-unavailable-branch-v236-d915b7c8-operator-copy.sql'
const sql171DiagnosticPath =
  'sql/validation/171-expense-dashboard-json-extract-precedence-hotfix/diagnose-runtime-unavailable-branch-v239-aad418ee.sql'
const migrationPath = 'sql/170_expense_dashboard_presentations.sql'
const hotfixPath = 'sql/171_expense_dashboard_json_extract_precedence_hotfix.sql'

const sql170DiagnosticRaw = readFileSync(sql170DiagnosticPath, 'utf8')
const immutableSql170DiagnosticRaw = readFileSync(immutableSql170DiagnosticPath, 'utf8')
const sql171DiagnosticRaw = readFileSync(sql171DiagnosticPath, 'utf8')
const sql170Diagnostic = sql170DiagnosticRaw.replace(/\r\n/g, '\n')
const sql171Diagnostic = sql171DiagnosticRaw.replace(/\r\n/g, '\n')
const migration = readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n')
const hotfix = readFileSync(hotfixPath, 'utf8').replace(/\r\n/g, '\n')
const placeholder = '__STEBBI_PRIVATE_ACTOR_UUID__'
const predecessorToken = "|| '|' || party.value->>'party_key_hash')"
const targetToken = "|| '|' || (party.value->>'party_key_hash'))"
const predecessorHotfixToken = predecessorToken.slice(0, -1)
const targetHotfixToken = targetToken.slice(0, -1)

function sha256(source: string): string {
  return createHash('sha256').update(source).digest('hex')
}

function occurrences(source: string, needle: string): number {
  return source.split(needle).length - 1
}

function between(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex + start.length)
  expect(startIndex, start).toBeGreaterThan(-1)
  expect(endIndex, end).toBeGreaterThan(startIndex)
  return source.slice(startIndex + start.length, endIndex)
}

function deriveSql171Diagnostic(source: string): string {
  expect(occurrences(source, predecessorToken)).toBe(1)
  return source
    .replace(predecessorToken, targetToken)
    .replace('-- SQL170 RUNTIME DIAGNOSTIC TEMPLATE:', '-- SQL171 RUNTIME DIAGNOSTIC TEMPLATE:')
    .replaceAll('$sql170_runtime_diagnostic$', '$sql171_runtime_diagnostic$')
    .replace('same two admission helpers used by SQL170', 'same two admission helpers used by SQL171')
    .replaceAll('EXACT SQL170 IDENTITY-CONFLICT PREDICATE', 'EXACT SQL171 IDENTITY-CONFLICT PREDICATE')
    .replaceAll('EXACT SQL170 PROJECTION CTES', 'EXACT SQL171 PROJECTION CTES')
}

describe('SQL171 runtime unavailable branch diagnostic', () => {
  it('is only the allowlisted SQL171 derivation of the reviewed SQL170 diagnostic', () => {
    expect(sha256(sql170DiagnosticRaw)).toBe(
      'd915b7c8858237831b37ea1c24acb12e2dce84945933eb0650e113aa29307735',
    )
    expect(sha256(immutableSql170DiagnosticRaw)).toBe(
      'd915b7c8858237831b37ea1c24acb12e2dce84945933eb0650e113aa29307735',
    )
    expect(immutableSql170DiagnosticRaw).toBe(sql170DiagnosticRaw)
    expect(sha256(sql171DiagnosticRaw)).toBe(
      '76c68fe3af51d7dcc8746d35793ed1416e53abfc2a2e83925b22577c461f0de0',
    )
    expect(sql171DiagnosticRaw).toBe(deriveSql171Diagnostic(sql170DiagnosticRaw))
    expect(occurrences(sql171Diagnostic, predecessorToken)).toBe(0)
    expect(occurrences(sql171Diagnostic, targetToken)).toBe(1)
    expect(sql171Diagnostic).toContain("'expense-sql170-presentation-v1|'")
    expect(sql171Diagnostic).not.toContain("'expense-sql171-presentation-v1|'")
  })

  it('matches the SQL171-derived target projection byte-for-byte', () => {
    const sql170Function = migration.slice(
      migration.indexOf('CREATE OR REPLACE FUNCTION public.expense_list_dashboard_presentations_v1('),
    )
    expect(occurrences(sql170Function, predecessorToken)).toBe(1)
    const sql171Function = sql170Function.replace(predecessorToken, targetToken)
    const diagnosticCtes = between(
      sql171Diagnostic,
      '    -- BEGIN EXACT SQL171 PROJECTION CTES\n',
      '\n    -- END EXACT SQL171 PROJECTION CTES',
    )
    const targetCtes = between(
      sql171Function,
      '  WITH actor_groups AS (',
      '\n  SELECT pg_catalog.count(*)::integer,',
    )
    expect(diagnosticCtes).toBe(`WITH actor_groups AS (${targetCtes}`)
    expect(hotfix).toContain(`v_invalid_token constant text := '${predecessorHotfixToken.replaceAll("'", "''")}';`)
    expect(hotfix).toContain(`v_corrected_token constant text := '${targetHotfixToken.replaceAll("'", "''")}';`)
    expect(hotfix).toContain("v_target_hash constant text := 'aad418eeda9d6b1dfe073c4109723d88';")
  })

  it('preserves the reviewed one-input, bounded controlled-result contract', () => {
    expect(sql171Diagnostic).toMatch(/^-- SQL171 RUNTIME DIAGNOSTIC TEMPLATE:/)
    expect(occurrences(sql171Diagnostic, placeholder)).toBe(1)
    expect(sql171Diagnostic).toContain(`p_actor_id := '${placeholder}'::uuid;`)
    expect(occurrences(sql171Diagnostic, 'EXCEPTION WHEN OTHERS')).toBe(4)
    expect(occurrences(sql171Diagnostic, 'v_sqlstate := SQLSTATE;')).toBe(4)
    expect(occurrences(sql171Diagnostic, 'RAISE EXCEPTION USING')).toBe(1)
    expect(occurrences(sql171Diagnostic, "ERRCODE = 'P1701'")).toBe(1)
    expect(occurrences(sql171Diagnostic, 'RAISE NOTICE')).toBe(0)
    expect(sql171Diagnostic.trimEnd().endsWith('$sql171_runtime_diagnostic$;')).toBe(true)
    for (const count of [
      'v_invalid_visible_bindings_count',
      'v_invalid_visible_publications_count',
      'v_invalid_visible_private_edits_count',
      'v_candidate_count',
      'v_distinct_candidate_count',
    ]) expect(sql171Diagnostic).toContain(`LEAST(${count}, 101)`)
  })

  it('keeps the exact safe 13-field publisher outside all classification work', () => {
    const publisher = between(
      sql171Diagnostic,
      '  -- BEGIN SAFE CONTROLLED EXCEPTION PUBLISHER\n',
      '\n  -- END SAFE CONTROLLED EXCEPTION PUBLISHER',
    )
    const messageObject = between(
      publisher,
      'MESSAGE = pg_catalog.jsonb_build_object(\n',
      '\n  )::text;',
    )
    expect([...messageObject.matchAll(/'([^']+)'\s*,/g)].map((match) => match[1])).toEqual([
      'diagnostic_contract_version',
      'classification',
      'stage',
      'actor_account_exists',
      'actor_beta_access',
      'identity_binding_conflict',
      'invalid_visible_bindings_count',
      'invalid_visible_publications_count',
      'invalid_visible_private_edits_count',
      'candidate_count',
      'distinct_presentation_key_count',
      'sqlstate',
      'error_category',
    ])
    expect(publisher).not.toMatch(/p_actor_id|v_discarded_rows|::uuid|SQLERRM|DETAIL\s*=|HINT\s*=|CONTEXT\s*=/i)
    const finalClassification = "  IF v_classification = 'diagnostic_ready' THEN\n    v_stage := 'complete';\n  END IF;"
    expect(sql171Diagnostic.indexOf(finalClassification)).toBeGreaterThan(
      sql171Diagnostic.lastIndexOf('EXCEPTION WHEN OTHERS THEN'),
    )
    expect(sql171Diagnostic.indexOf('  -- BEGIN SAFE CONTROLLED EXCEPTION PUBLISHER')).toBeGreaterThan(
      sql171Diagnostic.indexOf(finalClassification),
    )
    expect(sql171Diagnostic.slice(
      sql171Diagnostic.indexOf('  -- END SAFE CONTROLLED EXCEPTION PUBLISHER')
        + '  -- END SAFE CONTROLLED EXCEPTION PUBLISHER'.length,
    )).toMatch(/^\nEND;\n\$sql171_runtime_diagnostic\$;\n?$/)
  })

  it('remains read-only and excludes private/error values from its publisher', () => {
    expect(sql171Diagnostic).not.toMatch(/^\s*(INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|COMMIT|BEGIN TRANSACTION|START TRANSACTION)\b/im)
    expect(sql171Diagnostic).not.toMatch(/set_config|current_setting|request\.jwt|SET\s+(LOCAL\s+)?(?:ROLE|SESSION|TRANSACTION|statement_timeout)|CREATE\s+(?:TEMP|TEMPORARY)/i)
    expect(sql171Diagnostic).not.toContain('public.expense_list_dashboard_presentations_v1(')
    expect(sql171Diagnostic).not.toMatch(/SQLERRM|MESSAGE_TEXT|PG_EXCEPTION_(DETAIL|HINT|CONTEXT)|GET STACKED DIAGNOSTICS/i)
    expect(sql171Diagnostic).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i)
  })
})
