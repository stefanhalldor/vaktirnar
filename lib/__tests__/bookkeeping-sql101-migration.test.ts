import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(join(process.cwd(), 'sql/101_bookkeeping_company_ledger_inbox.sql'), 'utf8')
const preflight = readFileSync(join(process.cwd(), 'sql/validation/101-bookkeeping-company-ledger-inbox/preflight.sql'), 'utf8')
const postflight = readFileSync(join(process.cwd(), 'sql/validation/101-bookkeeping-company-ledger-inbox/postflight.sql'), 'utf8')

function executableSql(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*--.*$/gm, '')
    .replace(/'(?:''|[^'])*'/g, "''").trim()
}

describe('SQL101 company ledger inbox', () => {
  it('is one additive user-run transaction', () => {
    expect(migration.match(/^BEGIN;$/gm)).toHaveLength(1)
    expect(migration.match(/^COMMIT;$/gm)).toHaveLength(1)
    expect(migration).toContain('Stebbi alone runs this migration')
    expect(migration.match(/CREATE TABLE IF NOT EXISTS public\.bookkeeping_/g)).toHaveLength(5)
    expect(migration.match(/CREATE OR REPLACE FUNCTION public\.bookkeeping_/g)).toHaveLength(16)
    expect(migration).not.toMatch(/\b(?:DROP TABLE|TRUNCATE)\b/i)
  })

  it('keeps all five tables default-deny and all source documents private', () => {
    for (const table of [
      'bookkeeping_transactions', 'bookkeeping_transaction_revisions',
      'bookkeeping_attachments', 'bookkeeping_transaction_attachments',
      'bookkeeping_transaction_vat_links',
    ]) {
      expect(migration).toContain(`public.${table}`)
      expect(migration).not.toMatch(new RegExp(`CREATE POLICY[\\s\\S]*${table}`, 'i'))
    }
    expect(migration.match(/FORCE ROW LEVEL SECURITY/g)).toHaveLength(5)
    expect(migration).toContain("'bookkeeping-private', 'bookkeeping-private', false")
    expect(migration).toContain("'image/jpeg', 'image/png', 'image/webp', 'application/pdf'")
    expect(migration).not.toMatch(/GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|ALL)\s+ON TABLE/i)
  })

  it('uses CAS, idempotency, immutable revisions and a formal VAT link', () => {
    expect(migration).toContain('bookkeeping_begin_request')
    expect(migration).toContain('p_expected_transaction_version')
    expect(migration).toContain("RAISE EXCEPTION 'bookkeeping_version_conflict'")
    expect(migration).toContain('bookkeeping_transaction_revisions_immutable')
    expect(migration).toContain('source_transaction_version')
    expect(migration).toContain("'hasDrift', tx.version <> link.source_transaction_version + 1")
    const linkStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.bookkeeping_link_transaction_to_vat_entry')
    const linkEnd = migration.indexOf('\n$$;', linkStart)
    const rpc = migration.slice(linkStart, linkEnd)
    expect(rpc).toContain('FOR UPDATE')
    expect(rpc).toContain('bookkeeping_replace_entry_lines')
    expect(rpc).toContain('bookkeeping_assert_period_summary_safe')
    expect(rpc).toContain('INSERT INTO public.bookkeeping_transaction_vat_links')
  })

  it('rejects invalid binaries without exposing a public object URL', () => {
    expect(migration).toContain('bookkeeping_reject_attachment_upload')
    expect(migration).toContain("rejection_code IN ('size_mismatch', 'mime_mismatch', 'invalid_content')")
    expect(migration).not.toContain('CREATE POLICY')
  })

  it('does not let inbox rows enter current VAT calculations or readiness', () => {
    expect(migration).not.toMatch(/CREATE OR REPLACE FUNCTION public\.bookkeeping_calculate_period_summary/)
    expect(migration).not.toMatch(/CREATE OR REPLACE FUNCTION public\.bookkeeping_period_readiness/)
    expect(migration).not.toMatch(/UPDATE public\.bookkeeping_filing_snapshots/)
  })

  it.each([['preflight', preflight], ['postflight', postflight]])('%s is one read-only query', (_name, source) => {
    const executable = executableSql(source)
    expect(source.trimEnd().endsWith(';')).toBe(true)
    expect((executable.match(/;/g) ?? [])).toHaveLength(1)
    expect(executable).not.toMatch(/\b(?:BEGIN|COMMIT|INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|CALL|DO)\b/i)
  })

  it('gates the exact SQL100 baseline and proves exact SQL101 totals', () => {
    expect(preflight).toContain('relation_count = 11')
    expect(preflight).toContain('function_count = 41')
    expect(preflight).toContain('rpc_count = 18')
    expect(postflight).toContain('table_count = 16')
    expect(postflight).toContain('function_count = 57')
    expect(postflight).toContain('rpc_count = 30')
  })
})
