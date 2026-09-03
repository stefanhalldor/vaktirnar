import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n')

describe('TES-24 financial_version eligibility semantic audit', () => {
  it('keeps non-TES-24 consumers as monotonic exact-CAS readers', () => {
    const sources = [
      'sql/139_expense_event_link_independence.sql',
      'sql/141_expense_canonical_identity_and_claim_disputes.sql',
      'sql/157_event_expense_link_visibility.sql',
      'sql/162_event_expense_bidirectional_context_contract.sql',
      'sql/163_expense_existing_member_relationship_identity.sql',
      'sql/167_expense_private_recent_nullif_hotfix.sql',
    ].map(read).join('\n')
    expect(sources).toContain('financial_version <> p_expected_financial_version')
    expect(sources).not.toMatch(/(amount_minor|notification|repayment)[^;:=]*[:=][^;]+financial_version/i)
    expect(sources).not.toMatch(/CASE[^;]+financial_version[^;]+(notification|amount_minor|repayment)/i)
  })

  it('records no synthetic Expense revision or financial movement for eligibility-only bumps', () => {
    const migration = read('sql/168_expense_confirmed_edit_revision_lifecycle.sql')
    expect(migration).toContain('financial_version = group_row.financial_version + 1')
    expect(migration).not.toMatch(/INSERT INTO public\.expense_revisions[\s\S]{0,500}(open_edit|discard_edit|unchanged_reconfirmed)/)
    expect(migration).not.toMatch(/INSERT INTO public\.expense_(payments|shares|repayments)[\s\S]{0,500}(open_edit|discard_edit|unchanged_reconfirmed)/)
  })
})
