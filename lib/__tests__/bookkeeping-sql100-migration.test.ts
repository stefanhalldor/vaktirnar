import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(join(process.cwd(), 'sql/100_bookkeeping_entry_settlement.sql'), 'utf8')
const preflight = readFileSync(join(process.cwd(), 'sql/validation/100-bookkeeping-entry-settlement/preflight.sql'), 'utf8')
const postflight = readFileSync(join(process.cwd(), 'sql/validation/100-bookkeeping-entry-settlement/postflight.sql'), 'utf8')

function executableSql(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*--.*$/gm, '')
    .replace(/'(?:''|[^'])*'/g, "''")
    .trim()
}

describe('SQL100 bookkeeping entry settlement', () => {
  it('is atomic, additive and explicitly user-run only', () => {
    expect(migration.match(/^BEGIN;$/gm)).toHaveLength(1)
    expect(migration.match(/^COMMIT;$/gm)).toHaveLength(1)
    expect(migration).toContain('Stebbi alone runs this migration')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.bookkeeping_entry_settlements')
    expect(migration).not.toMatch(/\b(?:DROP TABLE|TRUNCATE)\b/i)
  })

  it('keeps the settlement table default-deny and auth links nullable', () => {
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY')
    expect(migration).toContain('FORCE ROW LEVEL SECURITY')
    expect(migration).toContain('REVOKE ALL ON TABLE public.bookkeeping_entry_settlements')
    expect(migration).not.toMatch(/CREATE POLICY[\s\S]*bookkeeping_entry_settlements/i)
    expect(migration).toContain('settled_by     uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL')
    expect(migration).toContain('updated_by     uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL')
  })

  it('uses independent idempotency/CAS and never mutates VAT lifecycle state', () => {
    expect(migration).toContain('bookkeeping_begin_request')
    expect(migration).toContain('p_expected_settlement_version')
    expect(migration).toContain('pg_advisory_xact_lock')
    expect(migration).toContain("RAISE EXCEPTION 'bookkeeping_version_conflict'")
    expect(migration).toContain("'entry_settlement_changed'")
    expect(migration).toContain("jsonb_build_object('from_state', v_current_state, 'to_state', p_settlement_state)")

    const rpcStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.bookkeeping_set_entry_settlement_state')
    const rpcEnd = migration.indexOf('\n$$;', rpcStart)
    const rpc = migration.slice(rpcStart, rpcEnd)
    expect(rpc).not.toContain('bookkeeping_assert_period_mutable')
    expect(rpc).not.toContain('UPDATE public.bookkeeping_periods')
    expect(rpc).not.toContain('bookkeeping_capture_entry_revision')
    expect(rpc).not.toContain('bookkeeping_assert_period_summary_safe')
  })

  it('publishes only bounded settlement fields and service-role mutation access', () => {
    expect(migration).toContain("'settlementState', coalesce(settlement.state, 'open')")
    expect(migration).toContain("'settlementVersion', coalesce(settlement.version, 0)")
    expect(migration).toContain('LEFT JOIN public.bookkeeping_entry_settlements')
    expect(migration).toContain('UPDATE public.bookkeeping_entry_settlements')
    expect(migration).toContain('TO service_role;')
    expect(migration).not.toMatch(/GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|ALL)\s+ON TABLE/i)
  })

  it.each([['preflight', preflight], ['postflight', postflight]])(
    '%s is one read-only catalog query',
    (_name, source) => {
      const executable = executableSql(source)
      expect(source.trimEnd().endsWith(';')).toBe(true)
      expect((executable.match(/;/g) ?? [])).toHaveLength(1)
      expect(executable).not.toMatch(
        /\b(?:BEGIN|COMMIT|INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|CALL|DO)\b/i,
      )
    },
  )

  it('preflight gates prerequisites and postflight proves isolation and grants', () => {
    for (const key of ['prerequisites_ok', 'sql99_fix_ok', 'activity_constraint_compatible', 'transactions_older_than_five_minutes']) {
      expect(preflight).toContain(key)
    }
    for (const key of ['settlement_rls_ok', 'settlement_rpc_ok', 'idempotency_cas_and_lock_independence_ok', 'bounded_audit_ok', 'read_model_ok', 'account_deletion_ok', 'settlement_lifecycle_violations']) {
      expect(postflight).toContain(key)
    }
  })
})
