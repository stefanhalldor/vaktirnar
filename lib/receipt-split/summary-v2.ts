import type { SplitViewV2 } from './view-v2'
export const UNSPLIT_V2 = 'unclaimed'
type Weighted = { key: string; weight: bigint }
function distribute(total: bigint, weights: Weighted[]) {
  const divisor = weights.reduce((sum, w) => sum + w.weight, BigInt(0))
  if (total < BigInt(0) || divisor <= BigInt(0)) throw new Error('split_allocation_invalid')
  const rows = weights.map(w => ({ ...w, base: total * w.weight / divisor, rest: total * w.weight % divisor }))
  let remaining = total - rows.reduce((sum, w) => sum + w.base, BigInt(0))
  rows.sort((a, b) => a.rest === b.rest ? (a.key < b.key ? -1 : a.key > b.key ? 1 : 0) : a.rest > b.rest ? -1 : 1)
  return new Map(rows.map(w => {
    const amount = w.base + (remaining > BigInt(0) ? BigInt(1) : BigInt(0))
    if (remaining > BigInt(0)) remaining--
    return [w.key, amount]
  }))
}
/** Separate receipt reference from actual line allocation. No Expense scale changes. */
export function splitSummaryV2(view: Pick<SplitViewV2, 'items' | 'claims' | 'receiptTotalMinor'>) {
  const totals = new Map<string, bigint>()
  const remaining = new Map<string, number>()
  const lineTotals = new Map<string, Map<string, bigint>>()
  let adjustments = BigInt(0)
  let lines = BigInt(0)
  for (const item of view.items) {
    const amount = BigInt(item.totalMinor)
    lines += amount
    if (item.kind !== 'item') { adjustments += amount; continue }
    if (amount < BigInt(0)) throw new Error('split_invalid')
    const claims = view.claims.filter(c => c.itemId === item.id)
    const left = item.quantityUnits - claims.reduce((n, c) => n + c.quantityUnits, 0)
    if (left < 0 || (amount === BigInt(0) && claims.length)) throw new Error('split_invalid')
    remaining.set(item.id, left)
    if (amount === BigInt(0)) continue
    const weights = claims.map(c => ({ key: c.memberToken, weight: BigInt(c.quantityUnits) }))
    if (left) weights.push({ key: UNSPLIT_V2, weight: BigInt(left) })
    const shares = distribute(amount, weights)
    lineTotals.set(item.id, shares)
    for (const [key, value] of shares) totals.set(key, (totals.get(key) ?? BigInt(0)) + value)
  }
  const subtotal = [...totals.values()].reduce((sum, value) => sum + value, BigInt(0))
  if (lines < BigInt(0)) {
    // Invalid review adjustments are shown as a review problem, not negative
    // participant debts. SQL refuses opening/updating sharing to a negative net.
    return { linesTotalMinor: lines, receiptDifferenceMinor: BigInt(view.receiptTotalMinor) - lines,
      totals: new Map([[UNSPLIT_V2, lines]]), remaining, lineTotals, allocationReady: false }
  }
  // Unallocatable review data stay visibly unclaimed; never invent a recipient.
  if (subtotal === BigInt(0)) totals.set(UNSPLIT_V2, adjustments)
  else if (adjustments !== BigInt(0)) {
    const shares = distribute(adjustments < BigInt(0) ? -adjustments : adjustments,
      [...totals].filter(([, value]) => value > BigInt(0)).map(([key, weight]) => ({ key, weight })))
    for (const [key, value] of shares) totals.set(key, totals.get(key)! + (adjustments < BigInt(0) ? -value : value))
  }
  if ([...totals.values()].reduce((sum, value) => sum + value, BigInt(0)) !== lines) throw new Error('split_allocation_invalid')
  return { linesTotalMinor: lines, receiptDifferenceMinor: BigInt(view.receiptTotalMinor) - lines,
    totals, remaining, lineTotals, allocationReady: true }
}
