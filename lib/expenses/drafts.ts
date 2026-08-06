import { z } from 'zod'
import { EXPENSE_CURRENCIES } from './input-money'
import { EXPENSE_FLOW_STEPS, type ExpenseFlowStep } from './flow'
import { ExpenseNewMemberSchema } from './validation'

const memberKey = z.string().trim().min(1).max(80)
const textMap = z.record(memberKey, z.string().max(80))
const booleanMap = z.record(memberKey, z.boolean())

export const ExpenseDraftMemberSchema = z.object({
  key: memberKey,
  label: z.string().trim().min(1).max(120),
  input: ExpenseNewMemberSchema.optional(),
  newGuest: z.object({ id: z.string().uuid(), display_name: z.string().trim().min(1).max(120) }).optional(),
  isSelf: z.boolean(),
  included: z.boolean().optional(),
}).strict()

export const ExpenseDraftPayloadSchema = z.object({
  circleId: z.string().uuid().nullable().default(null),
  members: z.array(ExpenseDraftMemberSchema).min(1).max(50),
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
