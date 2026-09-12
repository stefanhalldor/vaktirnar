import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ getAdmin: () => mocks }))
vi.mock('@/lib/loans/guard', () => ({ checkFeatureAccess: vi.fn() }))
vi.mock('@/lib/events/repository.server', () => ({ getExpensePayAllEventLabels: vi.fn() }))
import { getExpenseDashboard, getExpenseGroupView, getExpenseItemLookup } from '@/lib/expenses/repository.server'

const actor = '10000000-0000-4000-8000-000000000001'
const other = '10000000-0000-4000-8000-000000000002'
const groupId = '20000000-0000-4000-8000-000000000001'
const expenseId = '30000000-0000-4000-8000-000000000001'
const cancelledId = '30000000-0000-4000-8000-000000000002'
const selfMember = '40000000-0000-4000-8000-000000000001'
const otherMember = '40000000-0000-4000-8000-000000000002'
const none = { contract_version: 1, status: 'none', can_open: false, open_reason: 'lifecycle' }
const open = { contract_version: 1, status: 'open', mode: 'private', owned_by_actor: false,
  draft_id: null, draft_version: null, publication_version: null }
let states: Record<string, unknown>
let rows: Record<string, Record<string, unknown>[]>
let rpcError: boolean

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  states = { [expenseId]: none, [cancelledId]: none }
  rpcError = false
  rows = {
    expense_groups: [{ id: groupId, kind: 'group', name: 'Test', status: 'active',
      financial_version: 1, default_currency: 'ISK', default_include_creator: true,
      description: null, emoji: null, created_at: '2026-09-01' }],
    expense_group_members: [
      { id: selfMember, group_id: groupId, user_id: actor, role: 'owner', status: 'active', display_name: 'A' },
      { id: otherMember, group_id: groupId, user_id: other, role: 'member', status: 'active', display_name: 'B' },
    ],
    expenses: [
      { id: expenseId, group_id: groupId, created_by: other, title: 'Cost', total_minor: 10000,
        currency: 'ISK', status: 'active', split_method: 'equal', incurred_on: '2026-09-01' },
      { id: cancelledId, group_id: groupId, created_by: actor, title: 'Cancelled', total_minor: 0,
        currency: 'ISK', status: 'cancelled', split_method: 'equal', incurred_on: '2026-09-01' },
    ],
    expense_payments: [{ expense_id: expenseId, member_id: selfMember, amount_minor: 10000 }],
    expense_shares: [selfMember, otherMember].map(member_id => ({ expense_id: expenseId, member_id, amount_minor: 5000 })),
    expense_obligations: [{ id: 'obligation', group_id: groupId, from_member_id: otherMember,
      to_member_id: selfMember, amount_minor: 5000, currency: 'ISK' }],
    expense_repayments: ['confirmed', 'reported'].map((status, i) => ({ id: status, group_id: groupId,
      from_member_id: otherMember, to_member_id: selfMember, amount_minor: i ? 1000 : 2000,
      currency: 'ISK', status, reported_by: other, payment_preference_snapshot: null })),
    expense_repayment_allocations: [{ repayment_id: 'confirmed', obligation_id: 'obligation', amount_minor: 2000 }, { repayment_id: 'reported', obligation_id: 'obligation', amount_minor: 1000 }],
  }
  mocks.from.mockImplementation((table: string) => {
    // Reproduce the actual internal-table privilege boundary, never a permissive empty mock.
    if (table === 'expense_edit_revision_bindings') throw new Error('42501 permission denied')
    let result = [...(rows[table] ?? [])]
    let single = false
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { result = result.filter(row => row[key] === value); return query },
      in: (key: string, values: unknown[]) => { result = result.filter(row => values.includes(row[key])); return query },
      order: () => query, limit: () => query, gt: () => query, or: () => query,
      maybeSingle: () => { single = true; return query },
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve({ data: single ? result[0] ?? null : result, error: null }).then(resolve, reject),
    }
    return query
  })
  mocks.rpc.mockImplementation(async (name: string, input: Record<string, string>) => {
    if (name === 'expense_get_edit_revision_state_v1') {
      return { data: states[input.p_expense_id!], error: rpcError ? { code: '42501' } : null }
    }
    if (name === 'expense_get_eligible_settlement_context_v1') return { data: {
      contract_version: 1, status: 'ready', financial_version: 1, requires_review: false,
      transfers: [{ from_member_id: otherMember, to_member_id: selfMember, amount_minor: 3000, currency: 'ISK' }],
    }, error: null }
    if (name === 'expense_get_claim_context') return { data: null, error: null }
    if (name === 'expense_get_my_member_invitations') return { data: [], error: null }
    return { data: { contract_version: 1, status: 'unavailable' }, error: null }
  })
})
afterEach(() => vi.restoreAllMocks())

describe('permitted edit-state RPC boundary', () => {
  it.each(['group', 'one_off'])('loads dashboard, group and detail without internal table access: %s', async kind => {
    rows.expense_groups![0]!.kind = kind
    const dashboard = await getExpenseDashboard(actor)
    expect([...dashboard.groups, ...dashboard.oneOffs][0]?.expenseCount).toBe(2)
    expect((await getExpenseGroupView(actor, groupId))?.expenses.map(x => x.id)).toEqual([expenseId, cancelledId])
    expect((await getExpenseItemLookup(actor, expenseId)).status).toBe('ok')
    for (const id of [expenseId, cancelledId]) expect(mocks.rpc).toHaveBeenCalledWith(
      'expense_get_edit_revision_state_v1', { p_actor_id: actor, p_expense_id: id },
    )
    expect(mocks.from).not.toHaveBeenCalledWith('expense_edit_revision_bindings')
  })

  it.each(['private', 'shared'])('excludes another owner\'s %s edit and locks payments without leaking its draft', async mode => {
    states[expenseId] = { ...open, mode }
    const group = await getExpenseGroupView(actor, groupId)
    expect(group?.expenses.map(x => x.id)).toEqual([cancelledId])
    expect(group?.editRevisionState).toBe('open')
    expect(group?.settlementRequiresReview).toBe(true)
    expect(group?.settlementTransfers.every(x => !x.canReport && !x.canRecordReceived)).toBe(true)
    expect(group?.repayments.every(x => !x.canConfirm && !x.canReject && !x.canCancel)).toBe(true)
    expect((await getExpenseDashboard(actor)).groups[0]?.expenseCount).toBe(1)
    const detail = await getExpenseItemLookup(actor, expenseId)
    expect(detail.status).toBe('ok')
    if (detail.status === 'ok') {
      expect(detail.expense.id).toBe(expenseId)
      expect(detail.editRevisionState).toMatchObject({ status: 'open', ownedByActor: false, draftId: null })
      expect(detail.group.repayments.map(x => x.amountMinor)).toEqual([2000, 1000])
    }
  })

  it('keeps prior repayment history and recalculates the remaining 3000 after reconfirmation', async () => {
    states[expenseId] = open
    const draft = await getExpenseGroupView(actor, groupId)
    states[expenseId] = none // Model the authoritative RPC after successful reconfirmation.
    const confirmed = await getExpenseGroupView(actor, groupId)
    expect(confirmed?.repayments.map(x => [x.id, x.amountMinor, x.status])).toEqual(
      draft?.repayments.map(x => [x.id, x.amountMinor, x.status]),
    )
    expect(confirmed?.balances.find(x => x.isSelf)?.amountMinor).toBe(3000)
    expect(confirmed?.repayments.find(x => x.id === 'reported')?.canConfirm).toBe(true)
    expect(confirmed?.editRevisionState).toBe('none')
  })

  it.each(['error', 'unavailable', 'malformed'])('fails closed on %s for every request path', async failure => {
    rpcError = failure === 'error'
    states[cancelledId] = failure === 'unavailable' ? { status: 'unavailable' } : { status: 'open' }
    await expect(getExpenseGroupView(actor, groupId)).rejects.toThrow('expense_load_failed')
    await expect(getExpenseDashboard(actor)).rejects.toThrow('expense_load_failed')
    await expect(getExpenseItemLookup(actor, expenseId)).rejects.toThrow('expense_load_failed')
  })

  it('has no direct internal-table dependency in repository source', () => {
    expect(readFileSync('lib/expenses/repository.server.ts', 'utf8')).not.toMatch(
      /\.from\(['"]expense_edit_revision_bindings['"]\)/,
    )
  })
})
