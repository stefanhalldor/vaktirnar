import { describe, expect, it } from 'vitest'
import { adaptLegacySplitSession } from '@/lib/receipt-split/session-v2'

const id = '00000000-0000-4000-8000-000000000001'
const view = {
  id, state: 'sharing', deleteScope: null, reviewSaved: true, version: 5,
  title: 'Receipt', currency: 'EUR', incurredOn: '2026-09-15', totalMinor: 1600,
  isOwner: true, imageAvailable: false, inviteToken: null,
  members: [{ token: id, name: 'Person', isSelf: true }],
  items: [{ id, kind: 'item', description: 'Coffee', quantityMilli: 4000, totalMinor: 1600 }],
  claims: [{ itemId: id, memberToken: id, quantityMilli: 333 }],
}
describe('legacy standalone session adapter', () => {
  it('preserves IDs, auth-derived view and exact quantities without mutating source', () => {
    const before = structuredClone(view)
    const next = adaptLegacySplitSession(view)
    expect(next.items[0]).toMatchObject({ id, quantityUnits: 12000, originalDescription: 'Coffee' })
    expect(next.claims[0]).toEqual({ itemId: id, memberToken: id, quantityUnits: 999, inputMode: 'quantity', fractionNumerator: null, fractionDenominator: null })
    expect(next.members).toEqual(view.members)
    expect(view).toEqual(before)
  })
  it('does not invent revisions or a historical original receipt total', () => {
    const next = adaptLegacySplitSession(view)
    expect(next).toMatchObject({ canWriteV2: false, sourceContractVersion: 1,
      contractVersion: 2, quantityScale: 3000, receiptTotalMinor: 1600,
      receiptTotalProvenance: 'legacy_stored_total' })
    expect(next.items[0].itemRevision).toBeNull()
  })
  it('rejects mixed/versioned data instead of silently converting twice', () => {
    const next = adaptLegacySplitSession(view)
    expect(() => adaptLegacySplitSession(next)).toThrow()
    expect(() => adaptLegacySplitSession({ ...view, quantityScale: 3000 })).toThrow()
  })
})
