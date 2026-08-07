import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  join(process.cwd(), 'sql/114_expense_guest_member_rename.sql'),
  'utf8',
)
const preflight = readFileSync(
  join(process.cwd(), 'sql/validation/114-expense-guest-member-rename/preflight.sql'),
  'utf8',
)
const postflight = readFileSync(
  join(process.cwd(), 'sql/validation/114-expense-guest-member-rename/postflight.sql'),
  'utf8',
)

function functionBody(name: string) {
  const match = migration.match(
    new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`),
  )
  expect(match, `${name} must exist in SQL114`).not.toBeNull()
  return match?.[0] ?? ''
}

describe('SQL114 guest member rename', () => {
  it('is transactional and ships read-only validation probes', () => {
    expect(migration).toMatch(/^--[\s\S]*\nBEGIN;/)
    expect(migration.trimEnd()).toMatch(/COMMIT;$/)
    for (const probe of [preflight, postflight]) {
      expect(probe).not.toMatch(
        /^\s*(?:insert|update|delete|alter|create|drop|grant|revoke|truncate)\b/im,
      )
      expect(probe).toContain('transactions_older_than_five_minutes')
    }
  })

  it('limits rename to a manager and an active unregistered canonical share member', () => {
    const rename = functionBody('expense_rename_guest_member')
    expect(rename).toContain('expense_assert_beta_actor')
    expect(rename).toContain("NOT IN ('owner', 'admin')")
    expect(rename).toContain("v_member.status <> 'active'")
    expect(rename).toContain('v_member.user_id IS NOT NULL')
    expect(rename).toContain('JOIN public.expense_shares')
    expect(rename).toContain("v_group.kind <> 'one_off'")
  })

  it('is idempotent and records bounded before/after audit', () => {
    const rename = functionBody('expense_rename_guest_member')
    expect(rename).toContain('expense_begin_request')
    expect(rename).toContain('expense_finish_request')
    expect(rename).toContain("'expense_group_member_renamed'")
    expect(rename).toContain('INSERT INTO public.expense_member_name_revisions')
    expect(rename).toContain('guest_display_name_snapshot = v_display_name')
    expect(migration).toContain('expense_member_name_revisions_names_check')
    expect(migration).toContain('expense_member_name_revisions_immutable_guard')
  })

  it('never mutates financial rows or the financial version', () => {
    const rename = functionBody('expense_rename_guest_member')
    expect(rename).not.toMatch(
      /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+public\.expense_(?:shares|payments|obligations|repayments)\b/i,
    )
    expect(rename).not.toContain('financial_version')
    expect(postflight).toContain('financial_independence_ok')
    expect(postflight).toContain('expense_share_amount_total')
    expect(postflight).toContain('expense_payment_amount_total')
    expect(postflight).toContain('expense_obligation_amount_total')
    expect(postflight).toContain('expense_repayment_amount_total')
  })

  it('keeps audit default-deny and exposes only the bounded service RPC', () => {
    expect(migration).toContain(
      'ALTER TABLE public.expense_member_name_revisions FORCE ROW LEVEL SECURITY',
    )
    expect(migration).not.toMatch(/CREATE POLICY[\s\S]+expense_member_name_revisions/i)
    expect(migration).toMatch(
      /REVOKE ALL ON TABLE public\.expense_member_name_revisions\s+FROM PUBLIC, anon, authenticated, service_role;/,
    )
    expect(migration).toContain(
      'GRANT SELECT ON TABLE public.expense_member_name_revisions TO service_role',
    )
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.expense_rename_guest_member(uuid, uuid, uuid, text, uuid)',
    )
  })
})
