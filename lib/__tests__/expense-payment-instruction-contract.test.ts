import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const repository = readFileSync(
  join(process.cwd(), 'lib/expenses/repository.server.ts'),
  'utf8',
)

describe('pre-payment instruction repository boundary', () => {
  it('uses the service-role resolver with the exact actor and settlement parties', () => {
    const resolverStart = repository.indexOf('async function resolveCurrentPaymentDetails')
    const attachStart = repository.indexOf('async function attachCurrentPaymentInstructions')
    const end = repository.indexOf('export async function getExpenseGroupView', attachStart)
    const resolverBody = repository.slice(resolverStart, attachStart)
    const attachBody = repository.slice(attachStart, end)

    expect(resolverStart).toBeGreaterThanOrEqual(0)
    expect(attachStart).toBeGreaterThan(resolverStart)
    expect(end).toBeGreaterThan(attachStart)
    expect(resolverBody).toContain("'expense_resolve_payment_profile_v2'")
    expect(resolverBody.indexOf("'expense_resolve_payment_profile_v2'")).toBeLessThan(
      resolverBody.indexOf("'expense_resolve_payment_instruction'"),
    )
    expect(resolverBody).toMatch(/admin\.rpc\(\s*'expense_resolve_payment_instruction'/)
    expect(resolverBody).toContain('p_actor_id: input.actorUserId')
    expect(resolverBody).toContain('p_group_id: input.groupId')
    expect(resolverBody).toContain('p_from_member_id: input.transfer.fromMemberId')
    expect(resolverBody).toContain('p_to_member_id: input.transfer.toMemberId')
    expect(resolverBody).toContain('p_currency: input.transfer.currency')
    expect(attachBody).toContain('const selfMemberIds = expensePayAllSelfMemberIds(group)')
    expect(attachBody).toContain('!selfMemberIds.has(transfer.fromMemberId)')
    expect(attachBody).toContain('resolveCurrentPaymentDetails({')
    expect(attachBody).not.toContain('debtor?.user_id !== actorUserId')
    expect(resolverBody).toContain('paymentSnapshotForViewer')
    expect(resolverBody).not.toContain(".from('expense_payment_preferences')")
    expect(resolverBody).not.toContain(".from('expense_payment_preference_assignments')")
  })

  it('keeps legacy scoped details in the one-way flow but never treats them as pair-profile state', () => {
    const start = repository.indexOf('export async function getExpensePayAllView')
    const end = repository.indexOf('export async function getExpenseDashboard', start)
    const body = repository.slice(start, end)

    expect(start).toBeGreaterThanOrEqual(0)
    expect(end).toBeGreaterThan(start)
    expect(body).toContain("resolvedPaymentDetails.paymentDetailsState === 'available'")
    expect(body).toContain('resolvedPaymentDetails.expectedPaymentProfile === null')
    expect(body).toContain("paymentDetailsState: 'not_configured' as const")
    expect(body).toContain('paymentDetails: pairPaymentDetails')
    expect(body).toContain('(transfer.currentPaymentDetails ?? unavailablePaymentDetails())')
  })
})
