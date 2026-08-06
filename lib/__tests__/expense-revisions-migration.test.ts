import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(process.cwd(), 'sql/97_expense_edit_and_member_linking.sql'), 'utf8')
const migration = readFileSync(join(process.cwd(), 'sql/103_expense_revisions_and_recalculation.sql'), 'utf8')
const preflight = readFileSync(join(process.cwd(), 'sql/validation/103_expense_revisions_and_recalculation_preflight.sql'), 'utf8')
const postflight = readFileSync(join(process.cwd(), 'sql/validation/103_expense_revisions_and_recalculation_postflight.sql'), 'utf8')

function functionBody(sql: string, name: string): string {
  const marker = `CREATE OR REPLACE FUNCTION public.${name}`
  const start = sql.indexOf(marker)
  expect(start).toBeGreaterThanOrEqual(0)
  const next = sql.indexOf('CREATE OR REPLACE FUNCTION public.', start + marker.length)
  const commit = sql.indexOf('\nCOMMIT;', start + marker.length)
  const candidates = [next, commit].filter((value) => value >= 0)
  return sql.slice(start, candidates.length > 0 ? Math.min(...candidates) : sql.length)
}

function withoutComments(value: string): string {
  return value.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
}

describe('SQL103 expense revisions and recalculation', () => {
  it('is transactional, ordered after SQL102 and ships read-only validation', () => {
    expect(migration.match(/^BEGIN;$/gm)).toHaveLength(1)
    expect(migration.match(/^COMMIT;$/gm)).toHaveLength(1)
    expect(migration).toContain('expense_private_drafts(SQL102)')
    expect(migration).toContain('sql103_missing_prerequisites')
    for (const check of [preflight, postflight]) {
      expect(withoutComments(check)).not.toMatch(
        /^\s*(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE)\b/im,
      )
    }
    expect(preflight).toContain('transactions_older_than_five_minutes')
    expect(postflight).toContain('audited_edit_rpc_ok')
    expect(postflight).toContain('service_role_direct_writes_ok')
  })

  it.each([source, migration])('defines the same bounded private audit contract', (sql) => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.expense_revisions')
    expect(sql).toContain('ALTER TABLE public.expense_revisions ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('ALTER TABLE public.expense_revisions FORCE ROW LEVEL SECURITY')
    expect(sql).toContain('expense_revisions_changed_fields_check')
    expect(sql).toContain('expense_revisions_before_snapshot_check')
    expect(sql).toContain('expense_revisions_after_snapshot_check')
    expect(sql).toContain('expense_revisions_immutable_guard')
    expect(functionBody(sql, 'expense_revisions_immutable')).toContain("to_jsonb(NEW) - 'actor_user_id'")
    expect(sql).toContain('REVOKE ALL ON TABLE public.expense_revisions FROM PUBLIC, anon, authenticated, service_role')
    expect(sql).toContain('GRANT SELECT ON TABLE public.expense_revisions TO service_role')
    expect(sql).not.toMatch(/GRANT\s+(?:INSERT|UPDATE|DELETE|ALL)[\s\S]{0,100}expense_revisions/i)

    const snapshot = functionBody(sql, 'expense_build_revision_snapshot')
    expect(snapshot).toContain("'repaymentSummary'")
    expect(snapshot).toContain('public.expense_group_balances(p_group_id, false)')
    expect(snapshot).not.toMatch(/recipient_email|payment_preference_snapshot|accountNumber|nationalId/i)
  })

  it.each([source, migration])('allows audited edits while preserving repayment facts', (sql) => {
    const body = functionBody(sql, 'expense_update_expense')
    expect(body).toContain("v_group.status NOT IN ('active', 'settling', 'settled')")
    expect(body).not.toContain("repayment.status IN ('reported', 'confirmed')")
    expect(body).toContain('v_group.financial_version <> p_expected_financial_version')
    expect(body).toContain('v_before_snapshot := public.expense_build_revision_snapshot')
    expect(body).toContain('v_after_snapshot := public.expense_build_revision_snapshot')
    expect(body).toContain('INSERT INTO public.expense_revisions')
    expect(body).toContain('financial_version = group_row.financial_version + 1')
    expect(body.match(/financial_version = group_row\.financial_version \+ 1/g)).toHaveLength(1)
    expect(body).toContain('expense_group_reopened_after_expense_edit')
    expect(body).toContain("'revision_id', v_revision_id")
    expect(body).not.toMatch(/(?:UPDATE|DELETE FROM) public\.expense_(?:repayments|repayment_allocations|obligations)/i)
  })

  it.each([source, migration])('blocks new reports only when existing reports need review', (sql) => {
    const reconcile = functionBody(sql, 'expense_reported_repayments_need_review')
    expect(reconcile).toContain('public.expense_simplified_settlement')
    expect(reconcile).toContain('false')
    expect(reconcile).toContain('reported.amount_minor > current_settlement.amount_minor')
    const guard = functionBody(sql, 'expense_guard_new_reported_repayment')
    expect(guard).toContain("NEW.status = 'reported'")
    expect(guard).toContain('expense_repayment_review_required')
    expect(sql).toContain('BEFORE INSERT ON public.expense_repayments')
  })
})
