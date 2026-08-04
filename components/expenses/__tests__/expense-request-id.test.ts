import { describe, expect, it, vi } from 'vitest'
import { createExpenseMutationRequestIds } from '@/components/expenses/request-id'

describe('expense mutation request ids', () => {
  it('reuses one request id for an exact semantic payload retry', () => {
    const idFactory = vi.fn()
      .mockReturnValueOnce('request-1')
      .mockReturnValueOnce('request-2')
    const requestIds = createExpenseMutationRequestIds(idFactory)

    const first = requestIds.forPayload({
      action: 'confirm',
      repayment_id: 'repayment-1',
      nested: { amount: '1000', currency: 'ISK' },
    })
    const retry = requestIds.forPayload({
      nested: { currency: 'ISK', amount: '1000' },
      repayment_id: 'repayment-1',
      action: 'confirm',
    })

    expect(retry).toBe(first)
    expect(idFactory).toHaveBeenCalledTimes(1)
  })

  it('rotates the request id when the submitted semantic payload changes', () => {
    const idFactory = vi.fn()
      .mockReturnValueOnce('request-1')
      .mockReturnValueOnce('request-2')
    const requestIds = createExpenseMutationRequestIds(idFactory)

    const first = requestIds.forPayload({ action: 'confirm', repayment_id: 'repayment-1' })
    const changed = requestIds.forPayload({ action: 'reject', repayment_id: 'repayment-1' })

    expect(changed).not.toBe(first)
    expect(idFactory).toHaveBeenCalledTimes(2)
  })

  it('rotates after a successful request even when the next payload is identical', () => {
    const idFactory = vi.fn()
      .mockReturnValueOnce('request-1')
      .mockReturnValueOnce('request-2')
    const requestIds = createExpenseMutationRequestIds(idFactory)
    const payload = { expense_id: 'expense-1' }

    const first = requestIds.forPayload(payload)
    requestIds.succeeded(payload)
    const next = requestIds.forPayload(payload)

    expect(next).not.toBe(first)
    expect(idFactory).toHaveBeenCalledTimes(2)
  })
})
