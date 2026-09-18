import { z } from 'zod'

import { EXPENSE_CURRENCY_CODE_PATTERN } from './input-money'

export const EXPENSE_RECEIPT_MAX_BYTES = 10 * 1024 * 1024
export const EXPENSE_RECEIPT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const
export const EXPENSE_RECEIPT_MAX_ITEMS = 100
export const EXPENSE_RECEIPT_QUANTITY_SCALE = 1_000

const uuid = z.string().uuid()
const safePositive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
const safeNonnegative = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
// Receipt-scoped random handles are the only party identifiers exposed to a
// browser. Canonical identity hashes remain server-only.
const partyToken = uuid

export const PrepareExpenseReceiptUploadSchema = z.object({
  request_id: uuid,
  draft_id: uuid,
  upload_id: uuid,
  filename: z.string().trim().min(1).max(240),
  mime_type: z.enum(EXPENSE_RECEIPT_MIME_TYPES),
  size_bytes: safePositive.max(EXPENSE_RECEIPT_MAX_BYTES),
}).strict()

export const FinalizeExpenseReceiptUploadSchema = z.object({
  request_id: uuid,
  draft_id: uuid,
  upload_id: uuid,
}).strict()

export const ApplyExpenseReceiptManualExtractionSchema = z.object({
  request_id: uuid,
  draft_id: uuid,
  extraction_text: z.string().trim().min(2).max(100_000),
}).strict()

export const CreateExpenseReceiptFromJsonSchema = ApplyExpenseReceiptManualExtractionSchema

export const RetryExpenseReceiptExtractionSchema = z.object({
  request_id: uuid,
  draft_id: uuid,
}).strict()

export const ReviewExpenseReceiptSchema = z.object({
  request_id: uuid,
  draft_id: uuid,
  expected_receipt_version: safePositive,
  title: z.string().trim().min(1).max(200),
  currency: z.string().length(3).regex(EXPENSE_CURRENCY_CODE_PATTERN),
  incurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  receipt_total_minor: safePositive,
  items: z.array(z.object({
    id: uuid,
    kind: z.enum(['item', 'discount', 'tax', 'tip']),
    description: z.string().trim().min(1).max(200),
    quantity_milli: safePositive.max(1_000_000),
    total_minor: z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
  }).strict().superRefine((value, context) => {
    if ((value.kind === 'item' && value.total_minor < 0)
      || (value.kind !== 'item' && value.quantity_milli !== EXPENSE_RECEIPT_QUANTITY_SCALE)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'invalid_receipt_item' })
    }
  })).min(1).max(EXPENSE_RECEIPT_MAX_ITEMS),
}).strict()

export const ClaimExpenseReceiptItemSchema = z.object({
  request_id: uuid,
  publication_id: uuid,
  expected_receipt_version: safePositive,
  item_id: uuid,
  beneficiary_token: partyToken,
  quantity_milli: safePositive,
}).strict()

export const DeleteExpenseReceiptClaimSchema = z.object({
  request_id: uuid,
  publication_id: uuid,
  expected_receipt_version: safePositive,
  claim_id: uuid,
}).strict()

export const DeleteExpenseReceiptSchema = z.object({
  request_id: uuid,
  draft_id: uuid,
  scope: z.enum(['image', 'split']),
}).strict()

export const ExpenseReceiptImageTargetSchema = z.object({
  draft_id: uuid.nullable().default(null),
  publication_id: uuid.nullable().default(null),
  expense_id: uuid.nullable().default(null),
}).strict().refine((value) => (
  [value.draft_id, value.publication_id, value.expense_id]
    .filter((candidate) => candidate !== null).length === 1
), 'single_target_required')

const receiptPartyWireSchema = z.object({
  token: partyToken,
  display_name: z.string().trim().min(1).max(120)
    .refine((value) => !value.includes('@'), 'unsafe_display_name'),
  is_self: z.boolean(),
}).strict()

const receiptItemWireSchema = z.object({
  id: uuid,
  ordinal: z.number().int().min(1).max(EXPENSE_RECEIPT_MAX_ITEMS),
  kind: z.enum(['item', 'discount', 'tax', 'tip']),
  description: z.string().trim().min(1).max(200),
  quantity_milli: safePositive,
  total_minor: z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
  claimable: z.boolean(),
  claimed_quantity_milli: safeNonnegative,
  remaining_quantity_milli: safeNonnegative,
}).strict().superRefine((value, context) => {
  const expectedClaimable = value.kind === 'item' && value.total_minor > 0
  if (expectedClaimable !== value.claimable
    || (expectedClaimable && (
      value.claimed_quantity_milli + value.remaining_quantity_milli !== value.quantity_milli
      || value.claimed_quantity_milli > value.quantity_milli
    ))
    || (value.kind === 'item' && value.total_minor < 0)
    || (!expectedClaimable && (
      (value.kind !== 'item' && value.quantity_milli !== EXPENSE_RECEIPT_QUANTITY_SCALE)
      || value.claimed_quantity_milli !== 0
      || value.remaining_quantity_milli !== 0
    ))) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'invalid_receipt_item' })
  }
})

const receiptClaimWireSchema = z.object({
  id: uuid,
  item_id: uuid,
  actor_token: partyToken,
  beneficiary_token: partyToken,
  quantity_milli: safePositive,
  created_at: z.string().datetime({ offset: true }),
}).strict()

const receiptViewWireSchema = z.object({
  contract_version: z.literal(1),
  status: z.literal('ready'),
  draft_id: uuid,
  publication_id: uuid.nullable(),
  receipt_version: safePositive,
  phase: z.enum(['uploading', 'extracting', 'review', 'claiming', 'deleting']),
  delete_scope: z.enum(['image', 'split']).nullable(),
  image_available: z.boolean(),
  title: z.string().trim().min(1).max(200).nullable(),
  incurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  currency: z.string().length(3).regex(EXPENSE_CURRENCY_CODE_PATTERN).nullable(),
  receipt_total_minor: safePositive.nullable(),
  items_total_minor: z.number().int().min(Number.MIN_SAFE_INTEGER)
    .max(Number.MAX_SAFE_INTEGER).nullable(),
  total_matches: z.boolean(),
  all_claimed: z.boolean(),
  is_author: z.boolean(),
  can_claim: z.boolean(),
  parties: z.array(receiptPartyWireSchema).max(50),
  items: z.array(receiptItemWireSchema).max(EXPENSE_RECEIPT_MAX_ITEMS),
  claims: z.array(receiptClaimWireSchema).max(500),
}).strict().superRefine((value, context) => {
  if ((value.currency === null) !== (value.receipt_total_minor === null)
    || (value.receipt_total_minor === null) !== (value.items_total_minor === null)
    || value.can_claim && (value.publication_id === null || value.phase !== 'claiming')
    || (value.phase === 'deleting') !== (value.delete_scope !== null)
    || (value.phase === 'deleting' && (
      value.publication_id !== null || !value.is_author || value.image_available
    ))
    || value.claims.some((claim) => !value.items.some((item) => item.id === claim.item_id))
    || value.claims.some((claim) => !value.parties.some(
      (party) => party.token === claim.actor_token || party.token === claim.beneficiary_token,
    ))) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'invalid_receipt_view' })
  }
})

export interface ExpenseReceiptPartyView {
  token: string
  displayName: string
  isSelf: boolean
}

export interface ExpenseReceiptItemView {
  id: string
  ordinal: number
  kind: 'item' | 'discount' | 'tax' | 'tip'
  description: string
  quantityMilli: number
  totalMinor: number
  claimable: boolean
  claimedQuantityMilli: number
  remainingQuantityMilli: number
}

export interface ExpenseReceiptClaimView {
  id: string
  itemId: string
  actorToken: string
  beneficiaryToken: string
  quantityMilli: number
  createdAt: string
}

export interface ExpenseReceiptSplitView {
  draftId: string
  publicationId: string | null
  receiptVersion: number
  phase: 'uploading' | 'extracting' | 'review' | 'claiming' | 'deleting'
  deleteScope: 'image' | 'split' | null
  imageAvailable: boolean
  title: string | null
  incurredOn: string | null
  currency: string | null
  receiptTotalMinor: number | null
  itemsTotalMinor: number | null
  totalMatches: boolean
  allClaimed: boolean
  isAuthor: boolean
  canClaim: boolean
  parties: ExpenseReceiptPartyView[]
  items: ExpenseReceiptItemView[]
  claims: ExpenseReceiptClaimView[]
}

export function parseExpenseReceiptSplitView(value: unknown): ExpenseReceiptSplitView | null {
  const parsed = receiptViewWireSchema.safeParse(value)
  if (!parsed.success) return null
  return {
    draftId: parsed.data.draft_id,
    publicationId: parsed.data.publication_id,
    receiptVersion: parsed.data.receipt_version,
    phase: parsed.data.phase,
    deleteScope: parsed.data.delete_scope,
    imageAvailable: parsed.data.image_available,
    title: parsed.data.title,
    incurredOn: parsed.data.incurred_on,
    currency: parsed.data.currency,
    receiptTotalMinor: parsed.data.receipt_total_minor,
    itemsTotalMinor: parsed.data.items_total_minor,
    totalMatches: parsed.data.total_matches,
    allClaimed: parsed.data.all_claimed,
    isAuthor: parsed.data.is_author,
    canClaim: parsed.data.can_claim,
    parties: parsed.data.parties.map((party) => ({
      token: party.token,
      displayName: party.display_name,
      isSelf: party.is_self,
    })),
    items: parsed.data.items.map((item) => ({
      id: item.id,
      ordinal: item.ordinal,
      kind: item.kind,
      description: item.description,
      quantityMilli: item.quantity_milli,
      totalMinor: item.total_minor,
      claimable: item.claimable,
      claimedQuantityMilli: item.claimed_quantity_milli,
      remainingQuantityMilli: item.remaining_quantity_milli,
    })),
    claims: parsed.data.claims.map((claim) => ({
      id: claim.id,
      itemId: claim.item_id,
      actorToken: claim.actor_token,
      beneficiaryToken: claim.beneficiary_token,
      quantityMilli: claim.quantity_milli,
      createdAt: claim.created_at,
    })),
  }
}

export interface ReceiptAllocationItem {
  id: string
  kind: 'item' | 'discount' | 'tax' | 'tip'
  quantityMilli: number
  totalMinor: number
}

export interface ReceiptAllocationClaim {
  id: string
  itemId: string
  beneficiaryToken: string
  quantityMilli: number
}

function addSafe(left: number, right: number): number {
  const result = left + right
  if (!Number.isSafeInteger(result)) throw new Error('expense_receipt_amount_overflow')
  return result
}

function distributeByLargestRemainder(
  totalMinor: number,
  weights: Array<{ key: string; stableId: string; weight: number }>,
): Map<string, number> {
  if (!Number.isSafeInteger(totalMinor) || totalMinor < 0 || weights.length === 0) {
    throw new Error('expense_receipt_allocation_invalid')
  }
  const totalWeight = weights.reduce((sum, row) => addSafe(sum, row.weight), 0)
  if (totalWeight <= 0) throw new Error('expense_receipt_allocation_invalid')
  const rows = weights.map((row) => {
    const product = BigInt(totalMinor) * BigInt(row.weight)
    return {
      ...row,
      base: Number(product / BigInt(totalWeight)),
      remainder: product % BigInt(totalWeight),
    }
  })
  const baseTotal = rows.reduce((sum, row) => addSafe(sum, row.base), 0)
  let remainderUnits = totalMinor - baseTotal
  rows.sort((left, right) => (
    left.remainder === right.remainder
      ? left.stableId.localeCompare(right.stableId)
      : left.remainder > right.remainder ? -1 : 1
  ))
  const result = new Map<string, number>()
  for (const row of rows) {
    const allocated = row.base + (remainderUnits > 0 ? 1 : 0)
    if (remainderUnits > 0) remainderUnits -= 1
    result.set(row.key, addSafe(result.get(row.key) ?? 0, allocated))
  }
  return result
}

export function allocateReceiptClaims(
  receiptTotalMinor: number,
  items: readonly ReceiptAllocationItem[],
  claims: readonly ReceiptAllocationClaim[],
): Map<string, number> {
  if (!Number.isSafeInteger(receiptTotalMinor) || receiptTotalMinor <= 0) {
    throw new Error('expense_receipt_total_invalid')
  }
  const itemIds = new Set<string>()
  const claimableItemIds = new Set<string>()
  const claimIds = new Set<string>()
  const beneficiaryItemMinor = new Map<string, number>()
  let claimableTotalMinor = 0
  let adjustmentMinor = 0

  for (const item of items) {
    if (!item.id || itemIds.has(item.id) || !Number.isSafeInteger(item.quantityMilli)
      || item.quantityMilli <= 0 || !Number.isSafeInteger(item.totalMinor)) {
      throw new Error('expense_receipt_item_invalid')
    }
    itemIds.add(item.id)
    if (item.kind !== 'item') {
      adjustmentMinor = addSafe(adjustmentMinor, item.totalMinor)
      continue
    }
    if (item.totalMinor < 0) throw new Error('expense_receipt_item_invalid')
    // Preserve zero-total review lines; allocation starts after a positive amount is saved.
    if (item.totalMinor === 0) continue
    claimableItemIds.add(item.id)
    claimableTotalMinor = addSafe(claimableTotalMinor, item.totalMinor)
    const itemClaims = claims.filter((claim) => claim.itemId === item.id)
    if (itemClaims.reduce((sum, claim) => addSafe(sum, claim.quantityMilli), 0)
      !== item.quantityMilli) {
      throw new Error('expense_receipt_quantity_incomplete')
    }
    const allocated = distributeByLargestRemainder(
      item.totalMinor,
      itemClaims.map((claim) => ({
        key: claim.beneficiaryToken,
        stableId: claim.id,
        weight: claim.quantityMilli,
      })),
    )
    for (const [beneficiary, amount] of allocated) {
      beneficiaryItemMinor.set(
        beneficiary,
        addSafe(beneficiaryItemMinor.get(beneficiary) ?? 0, amount),
      )
    }
  }
  for (const claim of claims) {
    if (!claim.id || claimIds.has(claim.id) || !claimableItemIds.has(claim.itemId)
      || !claim.beneficiaryToken || !Number.isSafeInteger(claim.quantityMilli)
      || claim.quantityMilli <= 0) {
      throw new Error('expense_receipt_claim_invalid')
    }
    claimIds.add(claim.id)
  }
  if (addSafe(claimableTotalMinor, adjustmentMinor) !== receiptTotalMinor
    || beneficiaryItemMinor.size === 0) {
    throw new Error('expense_receipt_total_mismatch')
  }

  const adjustmentAbsolute = Math.abs(adjustmentMinor)
  const adjustment = adjustmentAbsolute === 0
    ? new Map<string, number>()
    : distributeByLargestRemainder(
      adjustmentAbsolute,
      [...beneficiaryItemMinor].map(([beneficiary, amount]) => ({
        key: beneficiary,
        stableId: beneficiary,
        weight: amount,
      })),
    )
  const result = new Map<string, number>()
  for (const [beneficiary, itemMinor] of beneficiaryItemMinor) {
    const shareMinor = adjustmentMinor < 0
      ? itemMinor - (adjustment.get(beneficiary) ?? 0)
      : itemMinor + (adjustment.get(beneficiary) ?? 0)
    if (shareMinor < 0) throw new Error('expense_receipt_share_negative')
    result.set(beneficiary, shareMinor)
  }
  if ([...result.values()].reduce((sum, amount) => addSafe(sum, amount), 0)
    !== receiptTotalMinor) {
    throw new Error('expense_receipt_total_mismatch')
  }
  return result
}
