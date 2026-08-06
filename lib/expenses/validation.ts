import { z } from 'zod'
import { EXPENSE_CURRENCIES } from './input-money'
import { PAYMENT_DETAIL_KEYS_BY_KIND } from './payment-detail-policy'

const uuid = z.string().uuid()
const requestId = uuid
const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
})
const amountInput = z.string().trim().min(1).max(40)
const currency = z.enum(EXPENSE_CURRENCIES)
const memberKey = z.string().trim().min(1).max(80)

export const EXPENSE_CATEGORIES = [
  'food',
  'accommodation',
  'transport',
  'travel',
  'home',
  'entertainment',
  'gifts',
  'shopping',
  'other',
] as const

export const ExpenseNewMemberSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('self'), key: memberKey }),
  z.object({
    type: z.literal('guest'),
    key: memberKey,
    display_name: z.string().trim().min(1).max(120),
  }),
  z.object({ type: z.literal('relationship'), key: memberKey, relationship_id: uuid }),
  z.object({
    type: z.literal('circle_member'),
    key: memberKey,
    circle_id: uuid,
    circle_member_id: uuid,
  }),
])

export const CreateExpenseGroupSchema = z.object({
  request_id: requestId,
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).nullable().optional().transform((v) => v || null),
  emoji: z.string().trim().max(16).nullable().optional().transform((v) => v || null),
  default_currency: currency,
  default_include_creator: z.boolean().default(true),
  members: z.array(ExpenseNewMemberSchema).max(49).default([]),
})

const paymentInput = z.object({
  member_key: memberKey,
  amount: amountInput,
})

const allocationInput = z.object({
  member_key: memberKey,
  amount: amountInput.optional(),
  percentage: z.string().trim().max(20).optional(),
  weight: z.string().trim().max(20).optional(),
  participates_in_remainder: z.boolean().optional(),
})

export const CreateExpenseSchema = z.object({
  request_id: requestId,
  draft_id: uuid.nullable().optional().transform((v) => v ?? null),
  group_id: uuid.nullable().optional().transform((v) => v ?? null),
  circle_id: uuid.nullable().optional().transform((v) => v ?? null),
  title: z.string().trim().min(1).max(200),
  total: amountInput,
  currency,
  incurred_on: dateField,
  category: z.enum(EXPENSE_CATEGORIES).nullable().optional().transform((v) => v ?? null),
  note: z.string().trim().max(1000).nullable().optional().transform((v) => v || null),
  split_method: z.enum([
    'equal',
    'percentage',
    'weighted',
    'fixed',
    'mixed_equal_remainder',
    'mixed_percentage_remainder',
  ]),
  members: z.array(ExpenseNewMemberSchema).max(50).default([]),
  payments: z.array(paymentInput).min(1).max(50),
  allocations: z.array(allocationInput).min(1).max(50),
}).superRefine((value, ctx) => {
  if (value.group_id === null) {
    const selfCount = value.members.filter((member) => member.type === 'self').length
    if (selfCount !== 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['members'], message: 'self_required' })
    }
    if (value.members.length < 2) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['members'], message: 'participant_required' })
    }
    value.members.forEach((member, index) => {
      if (member.type === 'circle_member' && member.circle_id !== value.circle_id) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['members', index, 'circle_id'], message: 'circle_mismatch' })
      }
    })
    if (value.circle_id === null && value.members.some((member) => member.type === 'circle_member')) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['circle_id'], message: 'circle_required' })
    }
  } else if (value.members.length > 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['members'], message: 'members_not_allowed' })
  } else if (value.circle_id !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['circle_id'], message: 'circle_not_allowed' })
  }
})

export const UpdateExpenseSchema = z.object({
  request_id: requestId,
  draft_id: uuid.nullable().optional().transform((v) => v ?? null),
  expense_id: uuid,
  expected_financial_version: z.number().int().nonnegative(),
  title: z.string().trim().min(1).max(200),
  total: amountInput,
  currency,
  incurred_on: dateField,
  category: z.enum(EXPENSE_CATEGORIES).nullable().optional().transform((v) => v ?? null),
  note: z.string().trim().max(1000).nullable().optional().transform((v) => v || null),
  split_method: z.enum([
    'equal',
    'percentage',
    'weighted',
    'fixed',
    'mixed_equal_remainder',
    'mixed_percentage_remainder',
  ]),
  preserve_shares: z.boolean(),
  new_members: z.array(z.object({
    id: uuid,
    display_name: z.string().trim().min(1).max(120),
  }).strict()).max(48).default([]),
  payments: z.array(paymentInput).min(1).max(50),
  allocations: z.array(allocationInput).max(50),
}).superRefine((value, ctx) => {
  if (value.preserve_shares && value.allocations.length !== 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['allocations'], message: 'must_be_empty' })
  }
  if (!value.preserve_shares && value.allocations.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['allocations'], message: 'required' })
  }
  if (new Set(value.new_members.map((member) => member.id)).size !== value.new_members.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['new_members'], message: 'duplicate' })
  }
  const referencedMemberKeys = new Set([
    ...value.payments.map((payment) => payment.member_key),
    ...value.allocations.map((allocation) => allocation.member_key),
  ])
  value.new_members.forEach((member, index) => {
    if (!referencedMemberKeys.has(member.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['new_members', index],
        message: 'unused',
      })
    }
  })
})

export const AddExpenseGroupMemberSchema = z.object({
  group_id: uuid,
  request_id: requestId,
  member: z.union([
    z.object({ type: z.literal('guest'), display_name: z.string().trim().min(1).max(120) }),
    z.object({ type: z.literal('relationship'), relationship_id: uuid }),
  ]),
})

export const RemoveExpenseGroupMemberSchema = z.object({
  group_id: uuid,
  member_id: uuid,
  request_id: requestId,
})

export const RespondExpenseGroupInvitationSchema = z.object({
  group_id: uuid,
  action: z.enum(['accept', 'decline']),
  request_id: requestId,
})

export const LeaveExpenseGroupSchema = z.object({
  group_id: uuid,
  request_id: requestId,
})

export const CancelExpenseSchema = z.object({
  expense_id: uuid,
  request_id: requestId,
})

export const LinkExpenseGuestMemberSchema = z.object({
  group_id: uuid,
  member_id: uuid,
  recipient_email: z.string().trim().email().max(320),
  request_id: requestId,
})

export const RespondExpenseMemberInvitationSchema = z.object({
  invitation_id: uuid,
  action: z.enum(['accept', 'decline']),
  request_id: requestId,
})

export const CancelExpenseMemberInvitationSchema = z.object({
  invitation_id: uuid,
  request_id: requestId,
})

export const ResendExpenseMemberInvitationSchema = z.object({
  invitation_id: uuid,
})

export const SetExpenseGroupStatusSchema = z.object({
  group_id: uuid,
  status: z.enum(['settling', 'settled']),
  request_id: requestId,
})

export const ReportExpenseRepaymentSchema = z.object({
  group_id: uuid,
  from_member_id: uuid,
  to_member_id: uuid,
  expected_financial_version: z.number().int().nonnegative(),
  amount: amountInput,
  currency,
  occurred_on: dateField,
  note: z.string().trim().max(1000).nullable().optional().transform((v) => v || null),
  request_id: requestId,
})

export const RecordExpenseRepaymentReceivedSchema = ReportExpenseRepaymentSchema

export const TransitionExpenseRepaymentSchema = z.object({
  repayment_id: uuid,
  action: z.enum(['confirm', 'reject', 'cancel']),
  request_id: requestId,
})

const preferenceDetailsSchema = z.object({
  accountNumber: z.string().trim().max(80).optional(),
  nationalId: z.string().trim().max(32).optional(),
  phoneNumber: z.string().trim().max(40).optional(),
  paymentLink: z.string().trim().url().max(500).optional(),
  instructions: z.string().trim().max(1000).optional(),
  defaultReference: z.string().trim().max(200).optional(),
}).strict()

export const SaveExpensePaymentPreferenceSchema = z.object({
  preference_id: uuid.nullable().optional().transform((v) => v ?? null),
  expected_version: z.number().int().positive().nullable().optional().transform((v) => v ?? null),
  request_id: requestId,
  title: z.string().trim().min(1).max(120),
  kind: z.enum(['bank_account', 'payment_app_phone', 'payment_link', 'cash', 'other']),
  supported_currencies: z.array(currency)
    .max(EXPENSE_CURRENCIES.length)
    .refine((items) => new Set(items).size === items.length, 'duplicate_currency')
    .nullable(),
  details: preferenceDetailsSchema,
  visibility: z.enum(['private', 'debt_context']),
  assignment: z.discriminatedUnion('scope_type', [
    z.object({ scope_type: z.literal('general') }),
    z.object({ scope_type: z.literal('currency'), currency }),
    z.object({ scope_type: z.literal('group_currency'), group_id: uuid, currency }),
  ]).nullable(),
}).superRefine((value, ctx) => {
  if (value.preference_id !== null && value.expected_version === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['expected_version'], message: 'required' })
  }
  if (value.kind === 'bank_account' && !value.details.accountNumber) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['details', 'accountNumber'], message: 'required' })
  }
  if (value.kind === 'payment_app_phone' && !value.details.phoneNumber) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['details', 'phoneNumber'], message: 'required' })
  }
  if (value.kind === 'payment_link' && !value.details.paymentLink?.startsWith('https://')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['details', 'paymentLink'], message: 'https_required' })
  }
  if (value.kind === 'other' && !value.details.instructions) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['details', 'instructions'], message: 'required' })
  }
  const allowedKeys = new Set(PAYMENT_DETAIL_KEYS_BY_KIND[value.kind])
  for (const key of Object.keys(value.details)) {
    if (!allowedKeys.has(key as keyof typeof value.details)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['details', key], message: 'not_allowed' })
    }
  }
  const assignmentCurrency = value.assignment && value.assignment.scope_type !== 'general'
    ? value.assignment.currency
    : null
  if (
    assignmentCurrency
    && value.supported_currencies !== null
    && !value.supported_currencies.includes(assignmentCurrency)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['assignment', 'currency'],
      message: 'unsupported_currency',
    })
  }
})

export const DeactivateExpensePaymentPreferenceSchema = z.object({
  preference_id: uuid,
  expected_version: z.number().int().positive(),
  request_id: requestId,
})

export type CreateExpenseInput = z.infer<typeof CreateExpenseSchema>
export type UpdateExpenseInput = z.infer<typeof UpdateExpenseSchema>
export type CreateExpenseGroupInput = z.infer<typeof CreateExpenseGroupSchema>
export type ExpenseNewMemberInput = z.infer<typeof ExpenseNewMemberSchema>
export type SaveExpensePaymentPreferenceInput = z.infer<typeof SaveExpensePaymentPreferenceSchema>
