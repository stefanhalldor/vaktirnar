/** Prepared standalone v2 boundary. Not connected to live actions in the UI preview phase. */
import { z } from 'zod'
import { EXPENSE_CURRENCIES } from '@/lib/expenses/input-money'
import { legacyMilliToUnits, MAX_SPLIT_QUANTITY_UNITS } from './quantity-v2'
const id = z.string().uuid()
const unsigned = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
const signed = z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER)
const explanation = z.string().trim().max(240).optional()
const commonLine = {
  kind: z.enum(['item', 'discount', 'tax', 'tip']),
  description: z.string().trim().min(1).max(200),
  total_minor: signed,
  confidence_basis_points: z.number().int().min(0).max(10000),
  needs_review: z.boolean(),
  explanation,
  explanation_needs_review: z.boolean().optional(),
}
const rootFields = {
  title: z.string().trim().min(1).max(200), currency: z.enum(EXPENSE_CURRENCIES),
  incurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), receipt_total_minor: unsigned.positive(),
}
const legacyExtraction = z.object({
  ...rootFields, items: z.array(z.object({ ...commonLine, quantity_milli: unsigned.positive().max(1_000_000) }).strict()).min(1).max(100),
}).strict()
export const splitExtractionV2Schema = z.object({
  contract_version: z.literal(2), quantity_scale: z.literal(3000), ...rootFields,
  items: z.array(z.object({ ...commonLine, quantity_units: unsigned.positive().max(MAX_SPLIT_QUANTITY_UNITS) }).strict()).min(1).max(100),
}).strict().superRefine((receipt, ctx) => {
  const date = new Date(receipt.incurred_on + 'T00:00:00Z')
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== receipt.incurred_on)
    ctx.addIssue({ code: 'custom', path: ['incurred_on'], message: 'invalid_date' })
  for (const [index, item] of receipt.items.entries()) {
    if ((item.kind === 'item' && item.total_minor < 0) || (item.kind !== 'item' && item.quantity_units !== 3000))
      ctx.addIssue({ code: 'custom', path: ['items', index], message: 'invalid_item' })
  }
})
export type SplitExtractionV2 = z.infer<typeof splitExtractionV2Schema>
export function parseSplitExtractionV2(value: unknown): SplitExtractionV2 {
  if (value !== null && typeof value === 'object' && ('contract_version' in value || 'quantity_scale' in value))
    return splitExtractionV2Schema.parse(value)
  const old = legacyExtraction.parse(value)
  return splitExtractionV2Schema.parse({ ...old, contract_version: 2, quantity_scale: 3000,
    items: old.items.map(({ quantity_milli, ...item }) => ({ ...item, quantity_units: legacyMilliToUnits(quantity_milli) })) })
}
export function parseSplitExtractionV2Text(text: string) {
  const trimmed = text.trim()
  if (trimmed.length < 2 || trimmed.length > 100000) throw new Error('invalid_extraction')
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return parseSplitExtractionV2(JSON.parse(fenced?.[1] ?? trimmed))
}
const envelope = { contractVersion: z.literal(2), quantityScale: z.literal(3000), id, requestId: id }
export const splitEditV2Schema = z.discriminatedUnion('command', [
  z.object({ ...envelope, command: z.literal('claim'), itemId: id, itemRevision: unsigned.positive(),
    previousUnits: unsigned.max(MAX_SPLIT_QUANTITY_UNITS), quantityUnits: unsigned.max(MAX_SPLIT_QUANTITY_UNITS),
    inputMode: z.enum(['quantity', 'percent', 'fraction']), fractionNumerator: unsigned.positive().max(1_000_000).nullable(),
    fractionDenominator: unsigned.positive().max(1_000_000).nullable() }).strict(),
  z.object({ ...envelope, command: z.literal('edit_item'), version: unsigned.positive(), itemId: id, itemRevision: unsigned.positive(),
    description: z.string().trim().min(1).max(200), explanation: z.string().trim().max(240),
    quantityUnits: unsigned.positive().max(MAX_SPLIT_QUANTITY_UNITS), totalMinor: signed }).strict(),
  z.object({ ...envelope, command: z.literal('receipt_total'), version: unsigned.positive(), receiptTotalMinor: unsigned.positive() }).strict(),
  z.object({ ...envelope, command: z.literal('add_item'), version: unsigned.positive(), description: z.string().trim().min(1).max(200),
    explanation: z.string().trim().max(240), quantityUnits: unsigned.positive().max(MAX_SPLIT_QUANTITY_UNITS), totalMinor: unsigned }).strict(),
  z.object({ ...envelope, command: z.literal('cancel_item'), version: unsigned.positive(), itemId: id,
    itemRevision: unsigned.positive() }).strict(),
  z.object({ ...envelope, command: z.literal('save_review'), version: unsigned.positive() }).strict(),
  z.object({ ...envelope, command: z.literal('confirm'), version: unsigned.positive() }).strict(),
])
