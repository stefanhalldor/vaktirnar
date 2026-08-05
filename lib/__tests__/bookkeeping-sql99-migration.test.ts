import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const sql98 = readFileSync(
  join(process.cwd(), 'sql/98_bookkeeping_vat_workbook.sql'),
  'utf8',
)
const sql99 = readFileSync(
  join(process.cwd(), 'sql/99_bookkeeping_entry_json_fix.sql'),
  'utf8',
)
const preflight = readFileSync(
  join(
    process.cwd(),
    'sql/validation/99-bookkeeping-entry-json-fix/preflight.sql',
  ),
  'utf8',
)
const postflight = readFileSync(
  join(
    process.cwd(),
    'sql/validation/99-bookkeeping-entry-json-fix/postflight.sql',
  ),
  'utf8',
)

function functionDefinition(source: string): string {
  const marker = 'CREATE OR REPLACE FUNCTION public.bookkeeping_assert_entry_payload'
  const start = source.indexOf(marker)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = source.indexOf('\n$$;', start)
  expect(end).toBeGreaterThan(start)
  return source.slice(start, end + '\n$$;'.length)
    .replace(/\r\n/g, '\n')
    .trim()
}

function executableSql(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*--.*$/gm, '')
    .replace(/'(?:''|[^'])*'/g, "''")
    .trim()
}

describe('SQL99 bookkeeping entry JSON repair', () => {
  it('is one atomic, idempotent helper replacement with no data writes', () => {
    const executable = executableSql(sql99)

    expect(sql99).toMatch(/^BEGIN;/m)
    expect(sql99).toMatch(/^COMMIT;/m)
    expect(sql99.match(/^BEGIN;$/gm)).toHaveLength(1)
    expect(sql99.match(/^COMMIT;$/gm)).toHaveLength(1)
    expect(executable.match(/CREATE OR REPLACE FUNCTION/gi)).toHaveLength(1)
    expect(executable).not.toMatch(
      /\b(?:INSERT\s+INTO|UPDATE\s+public\.|DELETE\s+FROM|TRUNCATE|CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+)\b/i,
    )
    expect(sql99).toContain('Stebbi alone runs this migration')
  })

  it('keeps SQL98 and SQL99 validator definitions identical and parenthesized', () => {
    const sql98Validator = functionDefinition(sql98)
    const sql99Validator = functionDefinition(sql99)

    expect(sql99Validator).toBe(sql98Validator)
    expect(sql99Validator).toContain("OR ((p_entry->'special_cases') - ARRAY[")
    expect(sql99Validator).not.toContain("OR (p_entry->'special_cases' - ARRAY[")
  })

  it('preserves the private helper contract and reasserts default-deny grants', () => {
    const validator = functionDefinition(sql99)
    const executable = executableSql(sql99)

    expect(validator).toContain('RETURNS void')
    expect(validator).toContain('LANGUAGE plpgsql')
    expect(validator).toContain('IMMUTABLE')
    expect(validator).toContain("SET search_path = ''")
    expect(validator).not.toContain('SECURITY DEFINER')
    expect(sql99).toContain(
      'REVOKE ALL ON FUNCTION public.bookkeeping_assert_entry_payload(jsonb)',
    )
    expect(sql99).toContain('FROM PUBLIC, anon, authenticated, service_role;')
    expect(executable).not.toMatch(/\bGRANT\b/i)
  })

  it.each([
    ['preflight', preflight],
    ['postflight', postflight],
  ])('%s is a single read-only catalog query', (_name, source) => {
    const executable = executableSql(source)

    expect(source.trimEnd().endsWith(';')).toBe(true)
    expect((executable.match(/;/g) ?? [])).toHaveLength(1)
    expect(executable).not.toMatch(
      /\b(?:BEGIN|COMMIT|INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|CALL|DO)\b/i,
    )
  })

  it('gates the repair and proves the fixed body, callers, and grants', () => {
    expect(preflight).toContain('prerequisites_ok')
    expect(preflight).toContain('repair_needed')
    expect(preflight).toContain('already_repaired')
    expect(preflight).toContain('unexpected_operator_form')
    expect(preflight).toContain('transactions_older_than_five_minutes')
    expect(postflight).toContain('operator_precedence_fix_ok')
    expect(postflight).toContain('entry_callers_ok')
    expect(postflight).toContain('bookkeeping_table_count')
    expect(postflight).toContain('bookkeeping_function_count')
    for (const source of [preflight, postflight]) {
      expect(source).toContain('browser_execute_grants')
      expect(source).toContain('service_role_execute_grants')
      expect(source).toContain('unexpected_target_overloads')
    }
  })
})
