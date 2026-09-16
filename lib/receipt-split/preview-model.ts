/** In-memory synthetic UI model. No actions, Supabase, storage, or network. */
import { allocateReceiptClaims } from '@/lib/expenses/receipt-split'
import { MAX_SPLIT_QUANTITY_UNITS } from './quantity-v2'

export type PreviewMember = { id: string; name: string }
export type PreviewItem = {
  id: string; originalName: string; name: string; explanation: string
  needsReview: boolean; units: number; amount: number; revision: number
  claims: Record<string, number>
}
export type PreviewState = {
  phase: 'review' | 'sharing'; receiptTotal: number; revision: number
  owner: string; members: PreviewMember[]; items: PreviewItem[]
}
export type PreviewError = 'forbidden' | 'stale' | 'unavailable' | 'belowClaimed' | 'zeroClaimed' | 'invalid'
export type PreviewResult = { ok: true; state: PreviewState } | { ok: false; error: PreviewError }
export type PreviewCommand =
  | { type: 'claim'; itemId: string; revision: number; units: number }
  | { type: 'edit'; itemId: string; revision: number; name: string; explanation: string; units: number; amount: number }
  | { type: 'add'; itemId: string; name: string; explanation: string; units: number; amount: number }
  | { type: 'receipt'; revision: number; amount: number }
  | { type: 'start' }

export const PREVIEW_UNCLAIMED = '__unclaimed'
export function claimedUnits(item: PreviewItem) { return Object.values(item.claims).reduce((sum, n) => sum + n, 0) }
export function previewGroup(item: PreviewItem): 'remaining' | 'done' | 'info' {
  return item.amount === 0 ? 'info' : claimedUnits(item) === item.units ? 'done' : 'remaining'
}
export function previewLineShares(item: PreviewItem): Map<string, number> {
  if (!item.amount) return new Map()
  const entries = Object.entries(item.claims).filter(([, units]) => units > 0)
  const remaining = item.units - claimedUnits(item)
  if (remaining > 0) entries.push([PREVIEW_UNCLAIMED, remaining])
  // This pure allocator uses relative integer weights; no Expense wire data changes.
  return allocateReceiptClaims(item.amount,
    [{ id: item.id, kind: 'item', quantityMilli: item.units, totalMinor: item.amount }],
    entries.map(([id, units]) => ({ id: item.id + ':' + id, itemId: item.id, beneficiaryToken: id, quantityMilli: units })))
}
export function previewTotals(state: PreviewState) {
  const lines = state.items.reduce((sum, i) => sum + BigInt(i.amount), BigInt(0))
  const people = new Map(state.members.map(m => [m.id, BigInt(0)]))
  let unclaimed = BigInt(0)
  for (const item of state.items) for (const [id, amount] of previewLineShares(item)) {
    if (id === PREVIEW_UNCLAIMED) unclaimed += BigInt(amount)
    else people.set(id, (people.get(id) ?? BigInt(0)) + BigInt(amount))
  }
  return { lines, people, unclaimed, claimed: lines - unclaimed, difference: BigInt(state.receiptTotal) - lines }
}
function validItem(item: { name: string; explanation: string; units: number; amount: number }) {
  return item.name.trim().length > 0 && item.name.trim().length <= 200 && item.explanation.length <= 240
    && Number.isSafeInteger(item.units) && item.units > 0 && item.units <= MAX_SPLIT_QUANTITY_UNITS
    && Number.isSafeInteger(item.amount) && item.amount >= 0
}
export function previewApply(state: PreviewState, actor: string, command: PreviewCommand): PreviewResult {
  if (!state.members.some(m => m.id === actor) || (command.type !== 'claim' && actor !== state.owner))
    return { ok: false, error: 'forbidden' }
  const next = { ...state, revision: state.revision + 1, items: [...state.items] }
  if (command.type === 'start') {
    if (!state.items.some(i => i.amount > 0)) return { ok: false, error: 'invalid' }
    next.phase = 'sharing'
  } else if (command.type === 'receipt') {
    if (command.revision !== state.revision) return { ok: false, error: 'stale' }
    if (!Number.isSafeInteger(command.amount) || command.amount <= 0) return { ok: false, error: 'invalid' }
    next.receiptTotal = command.amount
  } else if (command.type === 'add') {
    if (!validItem(command) || state.items.length >= 100 || state.items.some(i => i.id === command.itemId))
      return { ok: false, error: 'invalid' }
    next.items.push({ id: command.itemId, originalName: command.name.trim(), name: command.name.trim(),
      explanation: command.explanation.trim(), needsReview: false, units: command.units,
      amount: command.amount, revision: 1, claims: {} })
  } else {
    const index = state.items.findIndex(i => i.id === command.itemId)
    const item = state.items[index]
    if (!item) return { ok: false, error: 'invalid' }
    if (item.revision !== command.revision) return { ok: false, error: 'stale' }
    if (command.type === 'claim') {
      if (state.phase !== 'sharing' || !item.amount || !Number.isSafeInteger(command.units) || command.units < 0)
        return { ok: false, error: 'invalid' }
      if (claimedUnits(item) - (item.claims[actor] ?? 0) + command.units > item.units)
        return { ok: false, error: 'unavailable' }
      next.items[index] = { ...item, revision: item.revision + 1, claims: { ...item.claims, [actor]: command.units } }
    } else {
      if (!validItem(command)) return { ok: false, error: 'invalid' }
      if (command.units < claimedUnits(item)) return { ok: false, error: 'belowClaimed' }
      if (!command.amount && claimedUnits(item)) return { ok: false, error: 'zeroClaimed' }
      next.items[index] = { ...item, name: command.name.trim(), explanation: command.explanation.trim(), needsReview: false,
        units: command.units, amount: command.amount, revision: item.revision + 1 }
    }
  }
  if (next.items.reduce((sum, i) => sum + BigInt(i.amount), BigInt(0)) > BigInt(Number.MAX_SAFE_INTEGER))
    return { ok: false, error: 'invalid' }
  return { ok: true, state: next }
}
