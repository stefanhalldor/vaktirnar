import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), admin: vi.fn() }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ getAdmin: mocks.admin }))
vi.mock('@/lib/loans/guard', () => ({ checkFeatureAccess: vi.fn() }))
vi.mock('@/lib/events/repository.server', () => ({ getExpensePayAllEventLabels: vi.fn() }))

import { getExpenseDeleteCapability } from '@/lib/expenses/repository.server'

const actor = '10000000-0000-4000-8000-000000000001'
const expense = '40000000-0000-4000-8000-000000000001'

describe('SQL173 delete-capability repository boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.admin.mockReturnValue({ rpc: mocks.rpc })
  })

  it('parses the exact creator capability and sealed financial version', async () => {
    mocks.rpc.mockResolvedValue({
      data: { visible: true, allowed: true, reason: null, expected_financial_version: 7 },
      error: null,
    })
    await expect(getExpenseDeleteCapability(actor, expense)).resolves.toEqual({
      status: 'available',
      expectedFinancialVersion: 7,
    })
    expect(mocks.rpc).toHaveBeenCalledWith('expense_get_own_delete_capability', {
      p_actor_id: actor,
      p_expense_id: expense,
    })
  })

  it('admits MAX_SAFE_INTEGER minus one as the final safe expected version', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        visible: true,
        allowed: true,
        reason: null,
        expected_financial_version: Number.MAX_SAFE_INTEGER - 1,
      },
      error: null,
    })
    await expect(getExpenseDeleteCapability(actor, expense)).resolves.toEqual({
      status: 'available',
      expectedFinancialVersion: Number.MAX_SAFE_INTEGER - 1,
    })
  })

  it.each(['not_active', 'open_revision', 'settlement_history', 'unsafe_context'] as const)(
    'preserves the bounded %s denial without client-side authority inference',
    async (reason) => {
      mocks.rpc.mockResolvedValue({
        data: { visible: true, allowed: false, reason, expected_financial_version: 7 },
        error: null,
      })
      await expect(getExpenseDeleteCapability(actor, expense)).resolves.toEqual({
        status: 'blocked',
        reason,
      })
    },
  )

  it('returns hidden only for the exact minimal hidden response', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { visible: false }, error: null })
    await expect(getExpenseDeleteCapability(actor, expense)).resolves.toEqual({ status: 'hidden' })

    mocks.rpc.mockResolvedValueOnce({
      data: { visible: false, expected_financial_version: 7 },
      error: null,
    })
    await expect(getExpenseDeleteCapability(actor, expense)).resolves.toEqual({ status: 'unavailable' })
  })

  it.each([
    { visible: true, allowed: true, reason: null, expected_financial_version: -1 },
    { visible: true, allowed: true, reason: null, expected_financial_version: null },
    { visible: true, allowed: true, reason: null, expected_financial_version: '7' },
    { visible: true, allowed: true, reason: null, expected_financial_version: true },
    { visible: true, allowed: true, reason: null, expected_financial_version: Number.MAX_SAFE_INTEGER },
    { visible: true, allowed: true, reason: null, expected_financial_version: Number.MAX_SAFE_INTEGER + 1 },
    { visible: true, allowed: true, reason: null, expected_financial_version: 7, extra: true },
    { visible: true, allowed: true, reason: 'open_revision', expected_financial_version: 7 },
    { visible: true, allowed: false, reason: 'unexpected', expected_financial_version: 7 },
    { visible: 'true' },
  ])('fails closed on malformed payload %#', async (data) => {
    mocks.rpc.mockResolvedValue({ data, error: null })
    await expect(getExpenseDeleteCapability(actor, expense)).resolves.toEqual({ status: 'unavailable' })
  })

  it('fails closed on an array-wrapped capability payload', async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ visible: true, allowed: true, reason: null, expected_financial_version: 7 }],
      error: null,
    })
    await expect(getExpenseDeleteCapability(actor, expense)).resolves.toEqual({ status: 'unavailable' })
  })

  it('fails closed on RPC errors and invalid identifiers', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'private detail' } })
    await expect(getExpenseDeleteCapability(actor, expense)).resolves.toEqual({ status: 'unavailable' })
    await expect(getExpenseDeleteCapability('bad', expense)).resolves.toEqual({ status: 'unavailable' })
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })
})
