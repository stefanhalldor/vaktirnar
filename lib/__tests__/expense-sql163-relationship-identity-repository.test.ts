import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), admin: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ getAdmin: mocks.admin }))
vi.mock('@/lib/loans/guard', () => ({ checkFeatureAccess: vi.fn() }))
vi.mock('@/lib/events/repository.server', () => ({ getExpensePayAllEventLabels: vi.fn() }))
import { getExpenseRelationshipIdentityManagement } from '@/lib/expenses/repository.server'
const actor = '10000000-0000-4000-8000-000000000001'
const expense = '40000000-0000-4000-8000-000000000001'
const member = '20000000-0000-4000-8000-000000000002'
const relationship = '71000000-0000-4000-8000-000000000001'
describe('SQL163 Relationship identity repository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.admin.mockReturnValue({ rpc: mocks.rpc })
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })
  it('calls the exact discovery RPC and parses the bounded contract', async () => {
    mocks.rpc.mockResolvedValue({ data: { expense_id: expense, financial_version: 7, members: [{ member_id: member,
      candidates: [{ relationship_id: relationship, display_name: 'Mamma' }] }] }, error: null })
    await expect(getExpenseRelationshipIdentityManagement(actor, expense)).resolves.toEqual({ status: 'available',
      management: { expenseId: expense, financialVersion: 7,
        members: [{ memberId: member, candidates: [{ relationshipId: relationship, displayName: 'Mamma' }] }] } })
    expect(mocks.rpc).toHaveBeenCalledWith('expense_get_relationship_identity_management_v1', { p_actor_id: actor, p_expense_id: expense })
  })
  it.each([
    { expense_id: expense, financial_version: 7, members: [], extra: true },
    { expense_id: expense, financial_version: 7, members: [{ member_id: 'bad', candidates: [] }] },
    { expense_id: expense, financial_version: 7, members: [{ member_id: member, candidates: [{ relationship_id: relationship, display_name: 'private@example.is' }] }] },
  ])('makes malformed success payload unavailable without leaking it %#', async (data) => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.rpc.mockResolvedValue({ data, error: null })
    await expect(getExpenseRelationshipIdentityManagement(actor, expense)).resolves.toEqual({ status: 'unavailable' })
    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(consoleError).toHaveBeenCalledWith(
      '[expenses] relationship identity management query unavailable',
      { sqlState: 'unknown', reason: 'invalid_payload' },
    )
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain('private@example.is')
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(relationship)
  })
  it.each([
    {
      code: 'PGRST202',
      message: 'Could not find the function public.expense_get_relationship_identity_management_v1 in the schema cache',
    },
    {
      code: '42883',
      message: 'function public.expense_get_relationship_identity_management_v1(uuid, uuid) does not exist',
    },
  ])('returns safe absence for exact missing optional SQL163 state ($code) without logging an error', async (error) => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.rpc.mockResolvedValue({ data: null, error })

    await expect(getExpenseRelationshipIdentityManagement(actor, expense)).resolves.toEqual({ status: 'absent' })
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('keeps authoritative empty data distinct from unavailable', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null })
    await expect(getExpenseRelationshipIdentityManagement(actor, expense)).resolves.toEqual({ status: 'absent' })
    mocks.rpc.mockResolvedValueOnce({
      data: { expense_id: expense, financial_version: 7, members: [] },
      error: null,
    })
    await expect(getExpenseRelationshipIdentityManagement(actor, expense)).resolves.toEqual({ status: 'absent' })
  })

  it('maps privilege failure to one bounded unavailable diagnostic', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: `permission denied for ${expense}` },
    })
    await expect(getExpenseRelationshipIdentityManagement(actor, expense)).resolves.toEqual({ status: 'unavailable' })
    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(consoleError).toHaveBeenCalledWith(
      '[expenses] relationship identity management query unavailable',
      { sqlState: '42501', reason: 'privilege' },
    )
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(expense)
  })

  it('maps dependency failure to one bounded unavailable diagnostic', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: '42P01', message: 'relation private_payload does not exist' },
    })
    await expect(getExpenseRelationshipIdentityManagement(actor, expense)).resolves.toEqual({ status: 'unavailable' })
    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(consoleError).toHaveBeenCalledWith(
      '[expenses] relationship identity management query unavailable',
      { sqlState: '42P01', reason: 'undefined_dependency' },
    )
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain('private_payload')
  })

  it('does not misclassify another missing function as optional SQL163 absence', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find public.some_other_function in the schema cache' },
    })

    await expect(getExpenseRelationshipIdentityManagement(actor, expense)).resolves.toEqual({ status: 'unavailable' })
    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(consoleError).toHaveBeenCalledWith(
      '[expenses] relationship identity management query unavailable',
      { sqlState: 'unknown', reason: 'function_resolution' },
    )
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain('some_other_function')
  })

  it('contains thrown client failures at the same safe logging boundary', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.rpc.mockRejectedValue(new Error(`network failure for ${actor}`))

    await expect(getExpenseRelationshipIdentityManagement(actor, expense)).resolves.toEqual({ status: 'unavailable' })
    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(consoleError).toHaveBeenCalledWith(
      '[expenses] relationship identity management query unavailable',
      { sqlState: 'unknown', reason: 'unknown' },
    )
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(actor)
  })
})
