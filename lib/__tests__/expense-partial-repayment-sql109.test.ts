import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  join(process.cwd(), 'sql/109_expense_recipient_recorded_partial_repayments.sql'),
  'utf8',
)
const preflight = readFileSync(
  join(process.cwd(), 'sql/validation/109-expense-recipient-recorded-partial-repayments/preflight.sql'),
  'utf8',
)
const postflight = readFileSync(
  join(process.cwd(), 'sql/validation/109-expense-recipient-recorded-partial-repayments/postflight.sql'),
  'utf8',
)

describe('SQL109 recipient-recorded partial repayments', () => {
  it('is transaction wrapped, idempotent and default deny', () => {
    expect(migration.match(/^BEGIN;$/gm)).toHaveLength(1)
    expect(migration.match(/^COMMIT;$/gm)).toHaveLength(1)
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.expense_record_received_repayment')
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.expense_record_received_repayment[\s\S]*FROM PUBLIC, anon, authenticated/)
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.expense_record_received_repayment[\s\S]*TO service_role/)
  })

  it('locks and CAS-checks before recipient-authorized bounded confirmation', () => {
    expect(migration).toContain('FOR UPDATE')
    expect(migration).toContain('v_group.financial_version <> p_expected_financial_version')
    expect(migration).toContain("v_to.status = 'active' AND v_to.user_id = p_actor_id")
    expect(migration).toContain('expense_simplified_settlement(p_group_id, p_currency, true)')
    expect(migration).toContain("'confirmed', p_actor_id, NULL, NULL")
    expect(migration).toContain("'expense_repayment_confirmed'")
  })

  it('does not snapshot recipient payment instructions onto an already confirmed payment', () => {
    expect(migration).toContain("IF NEW.status <> 'reported' THEN")
    expect(migration).toContain('NEW.payment_profile_encrypted_snapshot := NULL')
  })

  it('ships read-only metadata validation queries', () => {
    for (const sql of [preflight, postflight]) {
      expect(sql).not.toMatch(/^\s*(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE|TRUNCATE)\b/im)
    }
  })
})
