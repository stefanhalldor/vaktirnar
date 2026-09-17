import { describe, expect, it } from 'vitest'
import { splitSummaryV2, UNSPLIT_V2 } from '@/lib/receipt-split/summary-v2'
import type { SplitViewV2 } from '@/lib/receipt-split/view-v2'
const wine: SplitViewV2['items'][number] = { id: 'wine', kind: 'item', description: 'Wine', originalDescription: 'Wine',
  explanation: '', explanationNeedsReview: false, quantityUnits: 3000, itemRevision: 1, totalMinor: 1000 }
const claim = (memberToken: string, quantityUnits: number) => ({ itemId: 'wine', memberToken, quantityUnits, inputMode: 'quantity' as const, fractionNumerator: null, fractionDenominator: null })
describe('standalone v2 exact allocation', () => {
  it('allocates three exact thirds deterministically with no unclaimed residue', () => {
    const input = { receiptTotalMinor: 1200, items: [wine], claims: [claim('c', 1000), claim('b', 1000), claim('a', 1000)] }
    const result = splitSummaryV2(input)
    expect([...result.totals].sort()).toEqual([['a', BigInt(334)], ['b', BigInt(333)], ['c', BigInt(333)]])
    expect(result.remaining.get('wine')).toBe(0)
    expect(result.receiptDifferenceMinor).toBe(BigInt(200))
    expect(splitSummaryV2({ ...input, claims: [...input.claims].reverse() }).totals).toEqual(result.totals)
  })
  it('includes the unclaimed share in tax/tip/discount and ignores reference for allocation', () => {
    const items = [wine, { ...wine, id: 'tax', kind: 'tax' as const, totalMinor: 200 },
      { ...wine, id: 'tip', kind: 'tip' as const, totalMinor: 100 },
      { ...wine, id: 'discount', kind: 'discount' as const, totalMinor: -300 }]
    const result = splitSummaryV2({ receiptTotalMinor: 2000, items, claims: [claim('a', 1500)] })
    expect(result.totals.get('a')).toBe(BigInt(500))
    expect(result.totals.get(UNSPLIT_V2)).toBe(BigInt(500))
    expect(result.receiptDifferenceMinor).toBe(BigInt(1000))
  })
  it('handles a complete discount as zero allocation without requiring receipt equality', () => {
    const result = splitSummaryV2({ receiptTotalMinor: 1000, items: [wine,
      { ...wine, id: 'discount', kind: 'discount', totalMinor: -1000 }], claims: [claim('a', 1000), claim('b', 2000)] })
    expect(result.linesTotalMinor).toBe(BigInt(0))
    expect([...result.totals.values()]).toEqual([BigInt(0), BigInt(0)])
    expect(result.allocationReady).toBe(true)
  })
  it('marks impossible negative review data without assigning negative participant debts', () => {
    const result = splitSummaryV2({ receiptTotalMinor: 1000, items: [wine,
      { ...wine, id: 'discount', kind: 'discount', totalMinor: -1001 }], claims: [claim('a', 1000)] })
    expect(result.allocationReady).toBe(false)
    expect([...result.totals]).toEqual([[UNSPLIT_V2, BigInt(-1)]])
  })
  it('preserves exact arithmetic at safe-integer limits including a larger reference difference', () => {
    const result = splitSummaryV2({ receiptTotalMinor: Number.MAX_SAFE_INTEGER,
      items: [{ ...wine, totalMinor: Number.MAX_SAFE_INTEGER }], claims: [claim('a', 1000)] })
    expect([...result.totals.values()].reduce((a, b) => a + b, BigInt(0))).toBe(BigInt(Number.MAX_SAFE_INTEGER))
    expect(result.receiptDifferenceMinor).toBe(BigInt(0))
  })
  it('rejects overclaims and zero-price claims', () => {
    expect(() => splitSummaryV2({ receiptTotalMinor: 1, items: [wine], claims: [claim('a', 3001)] })).toThrow()
    expect(() => splitSummaryV2({ receiptTotalMinor: 1, items: [{ ...wine, totalMinor: 0 }], claims: [claim('a', 1)] })).toThrow()
  })
})
