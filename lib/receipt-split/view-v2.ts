import { z } from 'zod'
import { splitViewSchema } from './contracts'
import { MAX_SPLIT_QUANTITY_UNITS } from './quantity-v2'

const integer = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
const uuid = z.string().uuid()
export const splitViewV2Schema = splitViewSchema.omit({ totalMinor: true, items: true, claims: true }).extend({
  contractVersion: z.literal(2), quantityScale: z.literal(3000), sourceContractVersion: z.union([z.literal(1), z.literal(2)]),
  receiptTotalMinor: integer,
  exchangeCurrency: z.string().regex(/^[A-Z]{3}$/).nullable().optional(),
  exchangeRate: z.string().regex(/^\d+(?:\.\d{1,8})?$/).nullable().optional(),
  items: z.array(z.object({ id: uuid, kind: z.enum(['item', 'discount', 'tax', 'tip']),
    description: z.string().min(1).max(200), originalDescription: z.string().min(1).max(200),
    explanation: z.string().max(240), explanationNeedsReview: z.boolean(),
    quantityUnits: integer.positive().max(MAX_SPLIT_QUANTITY_UNITS), itemRevision: integer.positive(),
    totalMinor: z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
  }).strict()).max(100),
  claims: z.array(z.object({ itemId: uuid, memberToken: uuid, quantityUnits: integer.positive().max(MAX_SPLIT_QUANTITY_UNITS) }).strict()).max(5000),
  dismissedItemIds: z.array(uuid).max(100),
}).strict().superRefine((view, ctx) => {
  const ids = new Set(view.items.map(i => i.id))
  const members = new Set(view.members.map(m => m.token))
  const keys = new Set<string>()
  let valid = ids.size === view.items.length && members.size === view.members.length
    && new Set(view.dismissedItemIds).size === view.dismissedItemIds.length
    && view.dismissedItemIds.every(itemId => ids.has(itemId))
  for (const claim of view.claims) {
    const key = claim.itemId + ':' + claim.memberToken
    if (!ids.has(claim.itemId) || !members.has(claim.memberToken) || keys.has(key)) valid = false
    keys.add(key)
  }
  for (const item of view.items) {
    const used = view.claims.filter(c => c.itemId === item.id).reduce((n, c) => n + c.quantityUnits, 0)
    if (used > item.quantityUnits || (item.kind === 'item' && item.totalMinor < 0)
      || (item.kind !== 'item' && item.quantityUnits !== 3000)
      || ((item.kind !== 'item' || item.totalMinor === 0) && used !== 0)) valid = false
  }
  if (!valid) ctx.addIssue({ code: 'custom', message: 'invalid_split_v2' })
})
export type SplitViewV2 = z.infer<typeof splitViewV2Schema>
