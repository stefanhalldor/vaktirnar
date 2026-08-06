import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const sql97 = readFileSync(
  join(process.cwd(), 'sql/97_expense_edit_and_member_linking.sql'),
  'utf8',
)
const sql103 = readFileSync(
  join(process.cwd(), 'sql/103_expense_revisions_and_recalculation.sql'),
  'utf8',
)
const sql104 = readFileSync(
  join(process.cwd(), 'sql/104_expense_revision_snapshot_json_fix.sql'),
  'utf8',
)
const preflight = readFileSync(
  join(
    process.cwd(),
    'sql/validation/104-expense-revision-snapshot-json-fix/preflight.sql',
  ),
  'utf8',
)
const postflight = readFileSync(
  join(
    process.cwd(),
    'sql/validation/104-expense-revision-snapshot-json-fix/postflight.sql',
  ),
  'utf8',
)

function functionDefinition(source: string): string {
  const marker = 'CREATE OR REPLACE FUNCTION public.expense_valid_revision_snapshot'
  const start = source.indexOf(marker)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = source.indexOf('\n$$;', start)
  expect(end).toBeGreaterThan(start)
  return source.slice(start, end + '\n$$;'.length)
    .replace(/\r\n/g, '\n')
    .trim()
}

function normalizedDefinition(source: string): string {
  return functionDefinition(source).replace(/\s+/g, ' ')
}

function executableSql(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*--.*$/gm, '')
    .replace(/'(?:''|[^'])*'/g, "''")
    .trim()
}

describe('SQL104 expense revision snapshot JSON repair', () => {
  it('keeps SQL97, SQL103, and SQL104 validator definitions semantically identical', () => {
    const sql104Validator = normalizedDefinition(sql104)

    expect(normalizedDefinition(sql97)).toBe(sql104Validator)
    expect(normalizedDefinition(sql103)).toBe(sql104Validator)
  })

  it('parenthesizes both nullable JSONB comparisons', () => {
    for (const source of [sql97, sql103, sql104]) {
      const validator = functionDefinition(source)
      expect(validator).toContain("(v_expense->'note') <> 'null'::jsonb")
      expect(validator).toContain("(v_expense->'category') <> 'null'::jsonb")
      expect(validator).not.toContain("v_expense->'note' <> 'null'::jsonb")
      expect(validator).not.toContain("v_expense->'category' <> 'null'::jsonb")
    }
  })

  it('is atomic, idempotent, private, and has no table or data writes', () => {
    const executable = executableSql(sql104)

    expect(sql104.match(/^BEGIN;$/gm)).toHaveLength(1)
    expect(sql104.match(/^COMMIT;$/gm)).toHaveLength(1)
    expect(executable.match(/CREATE OR REPLACE FUNCTION/gi)).toHaveLength(1)
    expect(executable).not.toMatch(
      /\b(?:INSERT\s+INTO|UPDATE\s+public\.|DELETE\s+FROM|TRUNCATE|CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+)\b/i,
    )
    expect(sql104).toContain('Stebbi alone runs this migration')
    expect(sql104).toContain(
      'REVOKE ALL ON FUNCTION public.expense_valid_revision_snapshot(jsonb)',
    )
    expect(sql104).toContain('FROM PUBLIC, anon, authenticated, service_role;')
    expect(executable).not.toMatch(/\bGRANT\b/i)
  })

  it.each([
    ['preflight', preflight],
    ['postflight', postflight],
  ])('%s is a single read-only query', (_name, source) => {
    const executable = executableSql(source)

    expect(source.trimEnd().endsWith(';')).toBe(true)
    expect((executable.match(/;/g) ?? [])).toHaveLength(1)
    expect(executable).not.toMatch(
      /\b(?:BEGIN|COMMIT|INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|CALL|DO)\b/i,
    )
  })

  it('gates reruns and verifies behavior, constraints, and grants', () => {
    for (const label of [
      'prerequisites_ok',
      'target_signature_ok',
      'target_configuration_ok',
      'repair_needed',
      'already_repaired',
      'unexpected_operator_form',
      'transactions_older_than_five_minutes',
    ]) {
      expect(preflight).toContain(label)
    }
    for (const label of [
      'operator_precedence_fix_ok',
      'valid_snapshot_probe_ok',
      'invalid_snapshot_probe_ok',
      'revision_constraints_ok',
    ]) {
      expect(postflight).toContain(label)
    }
    for (const source of [preflight, postflight]) {
      expect(source).toContain('browser_execute_grants')
      expect(source).toContain('service_role_execute_grants')
      expect(source).toContain('unexpected_target_overloads')
    }
  })
})
