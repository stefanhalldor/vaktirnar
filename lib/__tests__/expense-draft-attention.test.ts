import { describe, expect, it } from 'vitest'
import { getExpenseDraftAttention, type ExpenseDraftPayload } from '@/lib/expenses/drafts'

function payload(overrides: Partial<ExpenseDraftPayload> = {}): ExpenseDraftPayload {
  return {
    circleId: null,
    members: [
      { key: 'self', label: 'Ég', isSelf: true },
      { key: 'anna', label: 'Anna', isSelf: false },
    ],
    removedMemberIds: [],
    included: { self: true, anna: true },
    title: 'Prófun',
    total: '100000',
    currency: 'ISK',
    incurredOn: '2026-08-06',
    category: '',
    note: '',
    splitMethod: 'fixed',
    payments: { self: '100000', anna: '' },
    payerKeys: ['self'],
    amounts: { self: '10000', anna: '10000' },
    percentages: { self: '50', anna: '50' },
    weights: { self: '1', anna: '1' },
    preserveShares: false,
    ...overrides,
  }
}

describe('incomplete expense draft attention', () => {
  it('reports an 80,000 ISK unallocated remainder without creating a ledger result', () => {
    expect(getExpenseDraftAttention(payload())).toEqual({
      totalMinor: 100_000,
      differenceMinor: 80_000,
    })
  })

  it('stops flagging the draft once the fixed allocation balances exactly', () => {
    expect(getExpenseDraftAttention(payload({
      amounts: { self: '50000', anna: '50000' },
    }))).toBeNull()
  })

  it('uses the same one-share default as the form for older weighted drafts', () => {
    expect(getExpenseDraftAttention(payload({
      splitMethod: 'weighted',
      weights: {},
    }))).toBeNull()
  })
})
