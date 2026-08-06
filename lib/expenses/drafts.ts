import { z } from 'zod'
import {
  EXPENSE_CURRENCIES,
  parseExpenseAmountToMinor,
  parseExpensePercentageToBasisPoints,
  parseExpenseWeight,
} from './input-money'
import { sumMinorAmounts } from './money'
import { EXPENSE_FLOW_STEPS, type ExpenseFlowStep } from './flow'
import { ExpenseNewMemberSchema } from './validation'

const memberKey = z.string().trim().min(1).max(80)
const textMap = z.record(memberKey, z.string().max(80))
const booleanMap = z.record(memberKey, z.boolean())

export const ExpenseDraftMemberSchema = z.object({
  key: memberKey,
  label: z.string().trim().min(1).max(120),
  input: ExpenseNewMemberSchema.optional(),
  newGuest: z.object({
    id: z.string().uuid(),
    display_name: z.string().trim().min(1).max(120),
    recipient_email: z.string().trim().email().max(320).optional(),
    relationship_id: z.string().uuid().optional(),
  }).strict().refine((value) => !(value.recipient_email && value.relationship_id), 'ambiguous_identity').optional(),
  isSelf: z.boolean(),
  included: z.boolean().optional(),
}).strict()

export const ExpenseDraftPayloadSchema = z.object({
  circleId: z.string().uuid().nullable().default(null),
  members: z.array(ExpenseDraftMemberSchema).min(1).max(50),
  removedMemberIds: z.array(z.string().uuid()).max(48).default([]),
  included: booleanMap,
  title: z.string().max(200),
  total: z.string().max(40),
  currency: z.enum(EXPENSE_CURRENCIES),
  incurredOn: z.string().max(10),
  category: z.string().max(40),
  note: z.string().max(1000),
  splitMethod: z.enum(['fixed', 'percentage', 'weighted']),
  payments: textMap,
  payerKeys: z.array(memberKey).min(1).max(50),
  amounts: textMap,
  percentages: textMap,
  weights: textMap,
  preserveShares: z.boolean(),
}).strict()

export const SaveExpenseDraftSchema = z.object({
  draft_id: z.string().uuid(),
  expected_version: z.number().int().positive().nullable(),
  context_type: z.enum(['one_off', 'group', 'edit']),
  group_id: z.string().uuid().nullable(),
  expense_id: z.string().uuid().nullable(),
  current_step: z.enum(EXPENSE_FLOW_STEPS),
  payload: ExpenseDraftPayloadSchema,
}).strict()

export type ExpenseDraftPayload = z.infer<typeof ExpenseDraftPayloadSchema>
export type SaveExpenseDraftInput = z.infer<typeof SaveExpenseDraftSchema>

export interface ExpensePrivateDraftView {
  id: string
  contextType: SaveExpenseDraftInput['context_type']
  groupId: string | null
  expenseId: string | null
  currentStep: ExpenseFlowStep
  payload: ExpenseDraftPayload
  version: number
  savedAt: string
}

export interface ExpenseDraftAttention {
  totalMinor: number
  differenceMinor: number | null
}

/**
 * An incomplete draft stays outside the authoritative ledger, but remains
 * visible and recoverable until its payments and allocation balance exactly.
 */
export function getExpenseDraftAttention(
  payload: ExpenseDraftPayload,
): ExpenseDraftAttention | null {
  let totalMinor: number
  try {
    totalMinor = parseExpenseAmountToMinor(payload.total, payload.currency)
  } catch {
    return null
  }

  try {
    const payerKeys = [...new Set(payload.payerKeys)]
    const paidMinor = sumMinorAmounts(payerKeys.map((key) => (
      parseExpenseAmountToMinor(payload.payments[key] ?? '', payload.currency, { allowZero: true })
    )))
    if (paidMinor !== totalMinor) {
      return { totalMinor, differenceMinor: totalMinor - paidMinor }
    }

    if (payload.preserveShares) return null
    const participantKeys = payload.members
      .filter((member) => payload.included[member.key] !== false)
      .map((member) => member.key)
    if (participantKeys.length === 0) return { totalMinor, differenceMinor: totalMinor }

    if (payload.splitMethod === 'fixed') {
      const allocatedMinor = sumMinorAmounts(participantKeys.map((key) => (
        parseExpenseAmountToMinor(payload.amounts[key] ?? '', payload.currency, { allowZero: true })
      )))
      return allocatedMinor === totalMinor
        ? null
        : { totalMinor, differenceMinor: totalMinor - allocatedMinor }
    }

    if (payload.splitMethod === 'percentage') {
      const basisPoints = participantKeys.map((key) => (
        parseExpensePercentageToBasisPoints(payload.percentages[key] ?? '')
      ))
      return sumMinorAmounts(basisPoints) === 10_000
        ? null
        : { totalMinor, differenceMinor: null }
    }

    // Match the form and final payload: a missing legacy draft value means one
    // share, not an invalid allocation.
    const weights = participantKeys.map((key) => parseExpenseWeight(payload.weights[key] ?? '1'))
    return weights.some((weight) => weight > 0)
      ? null
      : { totalMinor, differenceMinor: null }
  } catch {
    return { totalMinor, differenceMinor: null }
  }
}
