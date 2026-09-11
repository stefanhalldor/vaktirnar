import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql159Path = 'sql/159_expense_unconfirmed_publication_and_finalization.sql'
const sql173Path = 'sql/173_expense_creator_safe_hard_delete.sql'
const migrationPath = 'sql/176_expense_finalize_receipt_classifier_fix.sql'
const validationRoot =
  'sql/validation/176-expense-finalize-receipt-classifier-fix'
const preflightPath = `${validationRoot}/preflight.sql`
const rehearsalPath = `${validationRoot}/rehearse-migration.sql`
const postflightPath = `${validationRoot}/postflight.sql`
const readmePath = `${validationRoot}/README.md`

const sql159Bytes = readFileSync(sql159Path)
const sql173Bytes = readFileSync(sql173Path)
const sql159 = normalized(sql159Path)
const sql173 = normalized(sql173Path)
const migration = normalized(migrationPath)
const preflight = normalized(preflightPath)
const rehearsal = normalized(rehearsalPath)
const postflight = normalized(postflightPath)
const readme = normalized(readmePath)

const oldTuple =
  "('expense_finalize_private_draft_v1', ARRAY['confirmed','contract_version','draft_id','expense_id','group_id','invitation_ids','state']::text[])"
const newTuple =
  "('expense_finalize_private_draft_v1', ARRAY['contract_version','draft_id','expense_id','group_id','invitation_ids','state']::text[])"
const predecessorHash = 'edb8a21d01ffdbbb8e9aa2b94c7c2594'
const installedHash = '9399515ec95dac55b2388a2a77be08e7'

function normalized(path: string): string {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
}

function occurrences(source: string, needle: string): number {
  return source.split(needle).length - 1
}

function md5(source: string): string {
  return createHash('md5').update(source).digest('hex')
}

// Only newline representation is ignored; every other UTF-8 byte remains protected.
function canonicalPredecessorSha256(source: string | Buffer): string {
  return createHash('sha256').update(source.toString().replace(/\r\n?/g, '\n'), 'utf8').digest('hex')
}

function functionBody(source: string, signature: string): string {
  const start = source.indexOf(signature)
  expect(start).toBeGreaterThan(-1)
  const bodyMarker = 'AS $function$'
  const bodyStart = source.indexOf(bodyMarker, start)
  const bodyEnd = source.indexOf('$function$;', bodyStart + bodyMarker.length)
  expect(bodyStart).toBeGreaterThan(start)
  expect(bodyEnd).toBeGreaterThan(bodyStart)
  return source.slice(bodyStart + bodyMarker.length, bodyEnd)
}

function expectNoApplicationMutation(source: string): void {
  const executable = source.replace(/^\s*--.*$/gm, '')
  expect(executable).not.toMatch(
    /\b(?:INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM|MERGE\s+INTO|TRUNCATE)\b/i,
  )
  expect(executable).not.toMatch(
    /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|TYPE|TRIGGER|POLICY)\b/i,
  )
  expect(executable).not.toMatch(/\b(?:GRANT|REVOKE)\b/i)
}

function lineContaining(source: string, fragment: string): string {
  const line = source.split('\n').find((candidate) => candidate.includes(fragment))
  expect(line, fragment).toBeDefined()
  return line!.trim()
}

describe('SQL176 finalization receipt classifier correction', () => {

  // Canonical LF content is pinned to exact Git base bytes, not checkout formatting.
  it.each([
    [sql159Bytes, '0b96941e54570c74ca035b42067d705c121399263f6676a92f7ee84f812dfa38'],
    [sql173Bytes, '5cc70dcb100b3e4a31cb6744b16319eb96db961fc221c4881edfe3b08143a319'],
  ])('preserves canonical predecessor identity across line endings and rejects edits', (input, expected) => {
    const lf = input.toString().replace(/\r\n?/g, '\n')
    for (const source of [lf, lf.replace(/\n/g, '\r\n'), lf.replace(/\n/g, '\r')]) {
      expect(canonicalPredecessorSha256(source)).toBe(expected)
      expect(canonicalPredecessorSha256('X' + source.slice(1))).not.toBe(expected)
      expect(canonicalPredecessorSha256(source.slice(1))).not.toBe(expected)
      expect(canonicalPredecessorSha256(source + 'X')).not.toBe(expected)
    }
  })
  it('derives exactly the six-key classifier from frozen SQL173', () => {
    expect(canonicalPredecessorSha256(sql173Bytes)).toBe(
      '5cc70dcb100b3e4a31cb6744b16319eb96db961fc221c4881edfe3b08143a319',
    )
    const predecessor = functionBody(
      sql173,
      'CREATE OR REPLACE FUNCTION public.expense_hard_delete_receipt_shape_known(',
    )
    expect(md5(predecessor)).toBe(predecessorHash)
    expect(occurrences(predecessor, oldTuple)).toBe(1)
    expect(occurrences(predecessor, newTuple)).toBe(0)

    const installed = predecessor.replace(oldTuple, newTuple)
    expect(md5(installed)).toBe(installedHash)
    expect(occurrences(installed, oldTuple)).toBe(0)
    expect(occurrences(installed, newTuple)).toBe(1)
    expect(installed.replace(newTuple, oldTuple)).toBe(predecessor)
    expect(Buffer.byteLength(installed) - Buffer.byteLength(predecessor)).toBe(-12)
  })

  it('freezes SQL159 writer and replay as the same six-key contract', () => {
    expect(canonicalPredecessorSha256(sql159Bytes)).toBe(
      '0b96941e54570c74ca035b42067d705c121399263f6676a92f7ee84f812dfa38',
    )
    const finalizer = functionBody(
      sql159,
      'CREATE FUNCTION public.expense_finalize_private_draft(',
    )
    expect(md5(finalizer)).toBe('14ac1abc9046fea4812ac652a9b96088')
    expect(finalizer).toContain("v_replay - ARRAY[")
    expect(finalizer).toContain('v_result := pg_catalog.jsonb_build_object(')
    for (const key of [
      'contract_version', 'state', 'draft_id', 'group_id', 'expense_id',
      'invitation_ids',
    ]) expect(finalizer).toContain(`'${key}'`)
    expect(finalizer).not.toContain("'confirmed', true")
  })

  it('ships one idempotent exact-token function-only migration', () => {
    expect(occurrences(migration, 'DO $sql176_receipt_classifier_fix$')).toBe(1)
    expect(migration.trimEnd().endsWith('$sql176_receipt_classifier_fix$;')).toBe(true)
    expect(migration).toContain(predecessorHash)
    expect(migration).toContain(installedHash)
    expect(migration).toContain('v_old_count = 1 AND v_new_count = 0')
    expect(migration).toContain('v_old_count = 0 AND v_new_count = 1')
    expect(migration).toContain(
      'v_fixed_source := pg_catalog.replace(v_source, v_old_token, v_new_token)',
    )
    expect(migration).toContain(
      'CREATE OR REPLACE FUNCTION public.expense_hard_delete_receipt_shape_known',
    )
    expect(migration).toContain('CALLED ON NULL INPUT')
    expect(migration).toContain('SECURITY DEFINER')
    expect(migration).toContain('PARALLEL UNSAFE')
    expect(migration).toContain('pg_try_advisory_xact_lock(173, 107)')
    expect(migration).toContain('pg_try_advisory_xact_lock(175, 107)')
    for (const fragment of [
      'v_old_token constant text :=',
      'v_new_token constant text :=',
      "'CREATE OR REPLACE FUNCTION public.expense_hard_delete_receipt_shape_known",
    ]) expect(lineContaining(rehearsal, fragment)).toBe(lineContaining(migration, fragment))
    expectNoApplicationMutation(migration)
    expect(migration).not.toMatch(/\b(?:FROM|JOIN)\s+(?:auth|public)\./i)
    expect(migration).not.toMatch(/\b(?:PERFORM|SELECT)\s+public\.expense_delete/i)
  })

  it('rehearses six-key acceptance and rejects seven/missing/unknown shapes', () => {
    const canonical =
      '{"contract_version":1,"draft_id":"00000000-0000-4000-8000-000000000001","expense_id":"00000000-0000-4000-8000-000000000002","group_id":"00000000-0000-4000-8000-000000000003","invitation_ids":[],"state":"confirmed"}'
    const phantomSeven =
      '{"confirmed":true,"contract_version":1,"draft_id":"00000000-0000-4000-8000-000000000001","expense_id":"00000000-0000-4000-8000-000000000002","group_id":"00000000-0000-4000-8000-000000000003","invitation_ids":[],"state":"confirmed"}'
    for (const source of [migration, rehearsal]) {
      expect(source).toContain(canonical)
      expect(source).toContain(phantomSeven)
    }
    expect(rehearsal).toContain("'unknown_operation', '{}'::jsonb")
    expect(rehearsal).toContain("'[]'::jsonb")
    expect(rehearsal).toContain('ROLLBACK;')
    for (const field of [
      'candidate_catalog_verified', 'installation_rolled_back',
      'predecessor_restored', 'rehearsal_pass',
    ]) expect(rehearsal).toContain(field)
    expectNoApplicationMutation(rehearsal)
  })

  it('keeps both SQL173 consumers on one classifier and cleanup before delete', () => {
    const classified = functionBody(
      sql173,
      'CREATE OR REPLACE FUNCTION public.expense_hard_delete_receipts_classified(',
    )
    const capability = functionBody(
      sql173,
      'CREATE OR REPLACE FUNCTION public.expense_get_own_delete_capability(',
    )
    const mutation = functionBody(
      sql173,
      'CREATE OR REPLACE FUNCTION public.expense_delete_own_unsettled_expense(',
    )
    expect(classified).toContain('public.expense_hard_delete_receipt_shape_known(')
    expect(capability).toContain('public.expense_hard_delete_receipts_classified(')
    expect(mutation).toContain('public.expense_hard_delete_receipts_classified(')
    expect(md5(classified)).toBe('9def695d70fc38b63011cb2bd12e2e67')
    expect(md5(capability)).toBe('ffbd530e2f759d85809a34045ac15a1e')
    expect(md5(mutation)).toBe('41bc44fc718a17fc4fc8c0777e0a0a67')
    const receiptCleanup = mutation.indexOf(
      'DELETE FROM public.expense_mutation_requests AS receipt',
    )
    const expenseDelete = mutation.indexOf('DELETE FROM public.expenses AS expense')
    expect(receiptCleanup).toBeGreaterThan(-1)
    expect(expenseDelete).toBeGreaterThan(receiptCleanup)
  })

  it('keeps catalog gates read-only and freezes SQL173/SQL175 lineage', () => {
    for (const gate of [preflight, postflight]) {
      expectNoApplicationMutation(gate)
      expect(gate).not.toMatch(/\b(?:FROM|JOIN)\s+(?:auth|public)\./i)
      for (const hash of [
        '14ac1abc9046fea4812ac652a9b96088',
        '9def695d70fc38b63011cb2bd12e2e67',
        'ffbd530e2f759d85809a34045ac15a1e',
        '41bc44fc718a17fc4fc8c0777e0a0a67',
        '0f6cac7b817e25d7f61ebf8a923e69d2',
        '4ba7b3a6be41204ec3807c63e37bdeb4',
      ]) expect(gate).toContain(hash)
    }
    expect(preflight).toContain("THEN 'PREDECESSOR_READY'")
    expect(preflight).toContain("THEN 'EXACT_INSTALLED'")
    expect(preflight).toContain("ELSE 'DRIFT_STOP'")
    expect(postflight).toContain("THEN 'EXACT_INSTALLED' ELSE 'DRIFT_STOP' END AS installation_state")
    expect(postflight).toContain('AS postconditions_ok')
    expect(readme).toContain('historical migration/validation artifacts')
    expect(readme).toContain('must not be edited')
    const oneNamespaceDependency =
      /SELECT pg_catalog\.count\(\*\) = 1\s+AND pg_catalog\.count\(\*\) FILTER \(\s+WHERE dependency\.refclassid =\s*'pg_catalog\.pg_namespace'::pg_catalog\.regclass\s+AND dependency\.refobjid =\s*pg_catalog\.to_regnamespace\('public'\)\) = 1/g
    for (const [source, expectedCount] of [
      [migration, 1],
      [preflight, 1],
      [rehearsal, 2],
      [postflight, 1],
    ] as const) {
      expect(source.match(oneNamespaceDependency)?.length ?? 0).toBe(expectedCount)
      expect(source).not.toMatch(
        /dependency\.refclassid =\s*'pg_catalog\.pg_language'/,
      )
    }
    expect(readme).toContain('pinned built-in objects')
    expect(readme).toContain('exact one-row namespace shape')
    expect(readme).toContain('## Localhost checks for Stebbi')
  })
})
