import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(join(process.cwd(), 'sql/185_receipt_split_ai_quota.sql'), 'utf8')
const preflight = readFileSync(join(process.cwd(), 'sql/validation/185-receipt-split-ai-quota/preflight.sql'), 'utf8')
const postflight = readFileSync(join(process.cwd(), 'sql/validation/185-receipt-split-ai-quota/postflight.sql'), 'utf8')

describe('SQL185 receipt AI quota contract', () => {
  it('keeps quota and exemption tables private behind forced RLS', () => {
    for (const table of ['ai_usage', 'ai_quota_exemptions']) {
      expect(migration).toContain(`ALTER TABLE receipt_split.${table} ENABLE ROW LEVEL SECURITY`)
      expect(migration).toContain(`ALTER TABLE receipt_split.${table} FORCE ROW LEVEL SECURITY`)
      expect(migration).toContain(`REVOKE ALL ON receipt_split.${table} FROM PUBLIC, anon, authenticated`)
    }
    expect(migration).not.toMatch(/CREATE POLICY/i)
  })

  it('serializes the daily ceiling and checks it before insertion', () => {
    const lock = migration.indexOf("pg_advisory_xact_lock(hashtextextended('receipt-ai:'")
    const globalCheck = migration.indexOf("count(*) FROM receipt_split.ai_usage WHERE usage_date")
    const insert = migration.indexOf('INSERT INTO receipt_split.ai_usage')
    expect(lock).toBeGreaterThan(0)
    expect(globalCheck).toBeGreaterThan(lock)
    expect(insert).toBeGreaterThan(globalCheck)
    expect(migration).toContain("AT TIME ZONE 'Atlantic/Reykjavik'")
  })

  it('applies daily quota to ordinary users and bounded controls to exemptions', () => {
    expect(migration).toContain('NOT v_exempt')
    expect(migration).toContain("interval '1 minute'")
    expect(migration).toContain("interval '2 minutes'")
    expect(migration).toContain("'reason', 'daily'")
    expect(migration).toContain("'reason', 'capacity'")
    expect(migration).toContain("'reason', 'burst'")
  })

  it('binds admin exemptions to verified auth users and service role only', () => {
    expect(migration).toContain('email_confirmed_at IS NOT NULL')
    expect(migration).toContain('REFERENCES auth.users(id)')
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.receipt_split_admin_set_ai_exemption_v1[\s\S]*TO service_role/)
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.receipt_split_admin_set_ai_exemption_v1[\s\S]*FROM PUBLIC, anon, authenticated/)
  })

  it('ships explicit before/after operator gates', () => {
    expect(preflight).toContain("'READY'")
    expect(preflight).toContain('targets_absent')
    expect(postflight).toContain("'EXACT_INSTALLED'")
    expect(postflight).toContain('no_client_policies')
  })
})
