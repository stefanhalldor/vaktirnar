import { describe, expect, it } from 'vitest'
import { paymentSnapshotForViewer } from '@/lib/expenses/payment-snapshot-visibility'

const base = {
  owner_user_id: 'owner-user',
  title: 'Bankareikningur',
  kind: 'bank_account',
  currency: 'ISK',
  visibility: 'debt_context',
  captured_at: '2026-08-04T00:00:00.000Z',
  details: {
    accountNumber: '0000-00-000000',
    nationalId: '000000-0000',
    phoneNumber: '555-0000',
    secretExtraField: 'must-not-leak',
  },
}

function context(overrides: Partial<Parameters<typeof paymentSnapshotForViewer>[1]> = {}) {
  return {
    viewerUserId: 'debtor-user',
    ownerUserId: 'owner-user',
    viewerOwesOwner: true,
    sharesSettlementWithOwner: false,
    explicitlySharedWithViewer: false,
    ...overrides,
  }
}

describe('payment snapshot visibility', () => {
  it('allows debt-context details only to the owner or current debtor', () => {
    expect(paymentSnapshotForViewer(base, context())?.details.accountNumber).toBe('0000-00-000000')
    expect(paymentSnapshotForViewer(base, context({ viewerUserId: 'outsider', viewerOwesOwner: false }))).toBeNull()
  })

  it('keeps private details owner-only', () => {
    const privateSnapshot = { ...base, visibility: 'private' }
    expect(paymentSnapshotForViewer(privateSnapshot, context())).toBeNull()
    expect(paymentSnapshotForViewer(privateSnapshot, context({ viewerUserId: 'owner-user' }))).not.toBeNull()
  })

  it('fails closed for explicit-share without an explicit grant', () => {
    expect(paymentSnapshotForViewer(
      { ...base, visibility: 'explicit_share' },
      context({ explicitlySharedWithViewer: false }),
    )).toBeNull()
  })

  it('returns only allowlisted detail fields', () => {
    const snapshot = paymentSnapshotForViewer(base, context())
    expect(snapshot?.details).toEqual({
      accountNumber: '0000-00-000000',
      nationalId: '000000-0000',
    })
  })

  it('rejects a forged snapshot owner', () => {
    expect(paymentSnapshotForViewer(
      { ...base, owner_user_id: 'someone-else' },
      context(),
    )).toBeNull()
  })
})
