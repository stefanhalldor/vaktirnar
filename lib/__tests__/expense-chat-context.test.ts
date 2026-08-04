import { describe, expect, it } from 'vitest'
import { buildExpenseChatContext } from '@/lib/expenses/chat-context'

describe('expense chat context seam', () => {
  it('contains only safe, stable context fields and a deep-link', () => {
    const context = buildExpenseChatContext({
      entityType: 'repayment',
      entityId: 'repayment-id',
      title: 'Endurgreiðsla',
      status: 'reported',
    })
    expect(context).toEqual({
      version: 1,
      entityType: 'repayment',
      entityId: 'repayment-id',
      title: 'Endurgreiðsla',
      status: 'reported',
      href: '/auth-mvp/utlagt-og-endurgreitt/endurgreidslur/repayment-id',
    })
    expect(Object.keys(context)).not.toEqual(expect.arrayContaining([
      'amountMinor',
      'note',
      'email',
      'paymentDetails',
      'members',
    ]))
  })
})
