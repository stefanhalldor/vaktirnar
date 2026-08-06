import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  join(process.cwd(), 'sql/111_expense_incomplete_draft_directory.sql'),
  'utf8',
)
const postflight = readFileSync(
  join(process.cwd(), 'sql/validation/111-expense-incomplete-drafts/postflight.sql'),
  'utf8',
)

describe('SQL111 private incomplete draft directory', () => {
  it('is actor-exact, bounded and service-role only', () => {
    expect(migration).toContain('draft.actor_user_id = p_actor_id')
    expect(migration).toContain('PERFORM public.expense_assert_beta_actor(p_actor_id)')
    expect(migration).toContain('LIMIT 100')
    expect(migration).toContain('FROM PUBLIC, anon, authenticated')
    expect(migration).toContain('TO service_role')
  })

  it('does not mutate the ledger or grant direct draft-table access', () => {
    expect(migration).not.toMatch(/INSERT INTO public\.(expenses|expense_shares|expense_payments|expense_obligations)/)
    expect(migration).not.toMatch(/UPDATE public\.(expenses|expense_shares|expense_payments|expense_obligations)/)
    expect(migration).not.toContain('GRANT SELECT ON TABLE public.expense_private_drafts')
  })

  it('filters stale edit drafts after settlement activity begins', () => {
    expect(migration).toContain("repayment.status IN ('reported', 'confirmed')")
    expect(migration).toContain("draft.context_type = 'edit'")
  })

  it('checks the PUBLIC pseudo-role without treating it as a database role', () => {
    expect(postflight).toContain("grantee = 'PUBLIC'")
    expect(postflight).not.toContain("has_function_privilege('PUBLIC'")
  })
})
