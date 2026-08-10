import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const repository = readFileSync(
  join(process.cwd(), 'lib/expenses/repository.server.ts'),
  'utf8',
)

describe('pre-payment instruction repository boundary', () => {
  it('uses the service-role resolver with the exact actor and settlement parties', () => {
    const start = repository.indexOf('async function attachCurrentPaymentInstructions')
    const end = repository.indexOf('export async function getExpenseGroupView', start)
    const body = repository.slice(start, end)

    expect(start).toBeGreaterThanOrEqual(0)
    expect(end).toBeGreaterThan(start)
    expect(body).toContain("'expense_resolve_payment_profile_v2'")
    expect(body.indexOf("'expense_resolve_payment_profile_v2'")).toBeLessThan(
      body.indexOf("'expense_resolve_payment_instruction'"),
    )
    expect(body).toContain("admin.rpc('expense_resolve_payment_instruction'")
    expect(body).toContain('p_actor_id: actorUserId')
    expect(body).toContain('p_group_id: group.id')
    expect(body).toContain('p_from_member_id: transfer.fromMemberId')
    expect(body).toContain('p_to_member_id: transfer.toMemberId')
    expect(body).toContain('p_currency: transfer.currency')
    expect(body).toContain('const selfMemberIds = expensePayAllSelfMemberIds(group)')
    expect(body).toContain('!selfMemberIds.has(transfer.fromMemberId)')
    expect(body).not.toContain('debtor?.user_id !== actorUserId')
    expect(body).toContain('paymentSnapshotForViewer')
    expect(body).not.toContain(".from('expense_payment_preferences')")
    expect(body).not.toContain(".from('expense_payment_preference_assignments')")
  })
})
