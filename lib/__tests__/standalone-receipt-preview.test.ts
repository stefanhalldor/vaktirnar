import { describe, expect, it } from 'vitest'
import { formatQuantity, legacyMilliToUnits, parseQuantityUnits, quantityInput, stepQuantity } from '@/lib/receipt-split/quantity-v2'
import { previewApply, previewGroup, previewTotals, type PreviewState } from '@/lib/receipt-split/preview-model'
const initial: PreviewState = {
  phase: 'sharing', receiptTotal: 1200, revision: 1, owner: 'a',
  members: ['a', 'b', 'c'].map(id => ({ id, name: id })),
  items: [{ id: 'wine', originalName: 'Wine', name: 'Wine', explanation: '', needsReview: false, units: 3000, amount: 1000, revision: 1, claims: {} }],
}
function success(result: ReturnType<typeof previewApply>): PreviewState {
  if (!result.ok) throw new Error(result.error)
  return result.state
}
describe('standalone preview exact quantities', () => {
  it.each([['1/4', 750], ['1/3', 1000], ['1/2', 1500], ['2/3', 2000], ['1,5', 4500], ['0.001', 3], ['0.333', 999], ['0', 0], ['1000', 3000000]])(
    'parses %s exactly', (raw, units) => {
      expect(parseQuantityUnits(raw)).toBe(units)
      expect(parseQuantityUnits(quantityInput(units))).toBe(units)
    })
  it.each(['1/7', '1/0', '0.0001', '-1', 'Infinity', '1e3', '1001', '<img>', '1/2/3', ''])('rejects unsupported input %s', value => {
    expect(parseQuantityUnits(value)).toBeNull()
  })
  it('preserves legacy values without silently relabeling 0.333 as a third', () => {
    expect(legacyMilliToUnits(333)).toBe(999)
    expect(formatQuantity(999)).toBe('0.333')
    expect(formatQuantity(1000)).toBe('⅓')
    expect(formatQuantity(4500)).toBe('1½')
    expect(() => legacyMilliToUnits(1.5)).toThrow()
  })
  it('steps down through exact fractions and respects available nonpreset quantities', () => {
    expect([3000, 1500, 1000, 750].map(n => stepQuantity(n, -1, 6000))).toEqual([1500, 1000, 750, 0])
    expect(stepQuantity(1500, 1, 2000)).toBe(2000)
    expect(stepQuantity(0, 1, 3)).toBe(3)
  })
})
describe('synthetic preview editing and totals; no database', () => {
  it('allocates three thirds exactly, rounds cents deterministically and leaves receipt mismatch separate', () => {
    let state = initial
    for (const actor of ['a', 'b', 'c']) {
      state = success(previewApply(state, actor, { type: 'claim', itemId: 'wine', revision: state.items[0].revision, units: 1000 }))
    }
    const totals = previewTotals(state)
    expect(previewGroup(state.items[0])).toBe('done')
    expect([...totals.people.values()].sort()).toEqual([BigInt(333), BigInt(333), BigInt(334)])
    expect(totals.unclaimed).toBe(BigInt(0))
    expect(totals.difference).toBe(BigInt(200))
    expect(totals.claimed + totals.unclaimed).toBe(totals.lines)
  })
  it('starts sharing with mismatch and appends without altering the receipt reference', () => {
    const sharing = success(previewApply({ ...initial, phase: 'review' }, 'a', { type: 'start' }))
    const state = success(previewApply(sharing, 'a', { type: 'add', itemId: 'cake', name: 'Cake', explanation: '', units: 3000, amount: 300 }))
    expect(state.receiptTotal).toBe(1200)
    expect(previewTotals(state).difference).toBe(BigInt(-100))
    expect(state.items[1].claims).toEqual({})
  })
  it('preserves original identity and unit claims when price, name, explanation or quantity change', () => {
    const claimed = success(previewApply(initial, 'b', { type: 'claim', itemId: 'wine', revision: 1, units: 1500 }))
    const state = success(previewApply(claimed, 'a', { type: 'edit', itemId: 'wine', revision: 2,
      name: 'Red wine', explanation: 'Bottle', units: 6000, amount: 2000 }))
    expect(state.items[0]).toMatchObject({ id: 'wine', originalName: 'Wine', claims: { b: 1500 } })
    expect(previewTotals(state).people.get('b')).toBe(BigInt(500))
    expect(state.receiptTotal).toBe(1200)
  })
  it('rejects stale edits/claims, nonowner edits, quantity below claims and price zero with claims', () => {
    const claimed = success(previewApply(initial, 'b', { type: 'claim', itemId: 'wine', revision: 1, units: 1500 }))
    const edit = { type: 'edit' as const, itemId: 'wine', revision: 2, name: 'Wine', explanation: '', units: 3000, amount: 1000 }
    expect(previewApply(claimed, 'b', edit)).toEqual({ ok: false, error: 'forbidden' })
    expect(previewApply(claimed, 'a', { ...edit, revision: 1 })).toEqual({ ok: false, error: 'stale' })
    expect(previewApply(claimed, 'a', { ...edit, units: 1000 })).toEqual({ ok: false, error: 'belowClaimed' })
    expect(previewApply(claimed, 'a', { ...edit, amount: 0 })).toEqual({ ok: false, error: 'zeroClaimed' })
    expect(previewApply(claimed, 'c', { type: 'claim', itemId: 'wine', revision: 1, units: 1000 })).toEqual({ ok: false, error: 'stale' })
  })
  it('reopens a fully claimed item when quantities are returned or the line quantity increases', () => {
    const full = success(previewApply(initial, 'b', { type: 'claim', itemId: 'wine', revision: 1, units: 3000 }))
    expect(previewGroup(full.items[0])).toBe('done')
    const returned = success(previewApply(full, 'b', { type: 'claim', itemId: 'wine', revision: 2, units: 1500 }))
    expect(previewGroup(returned.items[0])).toBe('remaining')
    const increased = success(previewApply(full, 'a', { type: 'edit', itemId: 'wine', revision: 2, name: 'Wine', explanation: '', units: 6000, amount: 1000 }))
    expect(previewGroup(increased.items[0])).toBe('remaining')
  })
  it('allows zero amount only after returning claims and keeps zero items out of completed drawer', () => {
    const zero = success(previewApply(initial, 'a', { type: 'edit', itemId: 'wine', revision: 1, name: 'Wine', explanation: '', units: 3000, amount: 0 }))
    expect(previewGroup(zero.items[0])).toBe('info')
    expect(previewApply({ ...zero, phase: 'review' }, 'a', { type: 'start' })).toEqual({ ok: false, error: 'invalid' })
  })
})
