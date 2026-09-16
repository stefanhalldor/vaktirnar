import { z } from 'zod'
import { allocateReceiptClaims } from '@/lib/expenses/receipt-split'

const uuid = z.string().uuid()
const integer = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
export const splitViewSchema = z.object({
  id: uuid, state: z.enum(['uploading', 'extracting', 'review', 'sharing', 'deleting']),
  deleteScope: z.enum(['image','split']).nullable(),
  reviewSaved: z.boolean(),
  version: integer.positive(), title: z.string().max(200),
  currency: z.enum(['ISK', 'EUR', 'USD', 'GBP', 'DKK', 'NOK', 'SEK']),
  incurredOn: z.string(), totalMinor: integer, isOwner: z.boolean(),
  imageAvailable: z.boolean(), inviteToken: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  members: z.array(z.object({ token: uuid, name: z.string().max(120).nullable(), isSelf: z.boolean() }).strict()).max(50),
  items: z.array(z.object({
    id: uuid, kind: z.enum(['item', 'discount', 'tax', 'tip']),
    description: z.string().max(200), quantityMilli: integer.positive().max(1_000_000),
    totalMinor: z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
  }).strict()).max(100),
  claims: z.array(z.object({
    itemId: uuid, memberToken: uuid, quantityMilli: integer.positive().max(1_000_000),
  }).strict()).max(5000),
}).strict()
export type SplitView = z.infer<typeof splitViewSchema>
export const splitListSchema = z.array(splitViewSchema.pick({ id: true, title: true, state: true }))
export const mutationSchema = z.discriminatedUnion('command', [
  z.object({ command: z.literal('add_item'), requestId: uuid, id: uuid,
    description: z.string().trim().min(1).max(200), quantity: integer.positive().max(1_000_000),
    amount: integer.positive() }).strict(),
  z.object({ command: z.literal('create'), requestId: uuid, id: uuid, text: z.string().min(2).max(100_000) }).strict(),
  z.object({ command: z.literal('apply_extraction'), requestId: uuid, id: uuid, text: z.string().min(2).max(100_000) }).strict(),
  z.object({ command: z.literal('review'), requestId: uuid, id: uuid, version: integer.positive(), text: z.string().min(2).max(100_000) }).strict(),
  z.object({ command: z.literal('confirm'), requestId: uuid, id: uuid, version: integer.positive() }).strict(),
  z.object({ command: z.literal('rotate_invite'), requestId: uuid, id: uuid }).strict(),
  z.object({ command: z.literal('claim'), requestId: uuid, id: uuid, itemId: uuid,
    previous: integer.max(1_000_000), quantity: integer.max(1_000_000) }).strict(),
  z.object({ command: z.literal('delete'), requestId: uuid, id: uuid, version: integer.positive() }).strict(),
  z.object({ command: z.literal('delete_image'), requestId: uuid, id: uuid, version: integer.positive() }).strict(),
])
export type SplitMutation = z.infer<typeof mutationSchema>
export type SplitCommand = SplitMutation extends infer T ? T extends SplitMutation ? Omit<T, 'requestId'> : never : never
export type SplitResult<T> = { ok: true; data: T } | { ok: false; error: 'invalid' | 'conflict' | 'failed' | 'login' | 'quota' | 'capacity' }

export const UNCLAIMED = 'unclaimed'
/** Include the unclaimed remainder in rounding and adjustments, never charge
 * the first participant the full receipt while other people are still joining. */
export function splitSummary(view: Pick<SplitView, 'items' | 'claims' | 'totalMinor'>) {
  const claims = view.claims.map(c => ({
    id: c.itemId + ':' + c.memberToken, itemId: c.itemId,
    beneficiaryToken: c.memberToken, quantityMilli: c.quantityMilli,
  }))
  const remaining = new Map<string, number>()
  for (const item of view.items) {
    if (item.kind !== 'item' || item.totalMinor === 0) continue
    const used = claims.filter(c => c.itemId === item.id).reduce((a, c) => a + c.quantityMilli, 0)
    const left = item.quantityMilli - used
    if (left < 0) throw new Error('split_overclaimed')
    remaining.set(item.id, left)
    if (left) claims.push({ id: item.id + ':' + UNCLAIMED, itemId: item.id,
      beneficiaryToken: UNCLAIMED, quantityMilli: left })
  }
  const totals = allocateReceiptClaims(view.totalMinor, view.items, claims)
  const lineTotals = new Map(view.items.filter(i => i.kind === 'item' && i.totalMinor > 0)
    .map(i => [i.id, allocateReceiptClaims(i.totalMinor, [i], claims.filter(c => c.itemId === i.id))]))
  return { totals, remaining, lineTotals }
}

export function parseSplitDecimal(value: string, digits: number): number | null {
  const normalized = value.trim().replace(',', '.')
  if (!new RegExp('^-?\\d+(?:\\.\\d{1,' + Math.max(1, digits) + '})?$').test(normalized)) return null
  if (digits === 0 && normalized.includes('.')) return null
  const negative = normalized.startsWith('-')
  const [whole, fraction = ''] = normalized.replace(/^-/, '').split('.')
  const result = (Number(whole) * 10 ** digits + Number(fraction.padEnd(digits, '0'))) * (negative ? -1 : 1)
  return Number.isSafeInteger(result) ? result : null
}
export function splitDecimal(value: number, digits: number) {
  const absolute = Math.abs(value)
  const fraction = digits ? String(absolute % 10 ** digits).padStart(digits, '0').replace(/0+$/, '') : ''
  return (value < 0 ? '-' : '') + Math.floor(absolute / 10 ** digits)
    + (fraction ? '.' + fraction : '')
}
