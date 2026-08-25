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

export const EVENT_EXPENSE_VISIBILITIES = ['participants_only', 'all_event'] as const
export const EventExpenseVisibilitySchema = z.enum(EVENT_EXPENSE_VISIBILITIES)
export type EventExpenseVisibility = z.infer<typeof EventExpenseVisibilitySchema>

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
    type: z.literal('event_guest'),
    key: memberKey,
    event_guest_id: uuid,
  }),
  z.object({
    type: z.literal('email'),
    key: memberKey,
    recipient_email: z.string().trim().email().max(320),
    display_name: z.string().trim().min(1).max(120),
  }),
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
}).superRefine((value, ctx) => {
  if (value.members.some((member) => member.type === 'event_guest')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['members'],
      message: 'event_guest_not_allowed',
    })
  }
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
  event_id: uuid.nullable().optional().transform((v) => v ?? null),
  expected_event_roster_revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
    .nullable().optional().transform((v) => v ?? null),
  link_to_event: z.boolean().default(false),
  event_visibility: EventExpenseVisibilitySchema.default('participants_only'),
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
  if ((value.event_id === null) !== (value.expected_event_roster_revision === null)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['event_id'],
      message: 'event_revision_required',
    })
  }
  if (value.event_id !== null && (value.group_id !== null || value.circle_id !== null)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['event_id'],
      message: 'event_one_off_required',
    })
  }
  if (value.link_to_event && value.event_id === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['link_to_event'],
      message: 'event_required',
    })
  }
  const eventGuests = value.members.filter((member) => member.type === 'event_guest')
  if (eventGuests.length > 0 && value.event_id === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['members'],
      message: 'event_required',
    })
  }
  if (new Set(eventGuests.map((member) => member.event_guest_id)).size !== eventGuests.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['members'],
      message: 'duplicate_event_guest',
    })
  }
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
    recipient_email: z.string().trim().email().max(320).optional(),
    relationship_id: uuid.optional(),
  }).strict()).max(48).default([]),
  removed_member_ids: z.array(uuid).max(48).default([]),
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
    if (member.recipient_email && member.relationship_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['new_members', index],
        message: 'ambiguous_identity',
      })
    }
    if (!referencedMemberKeys.has(member.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['new_members', index],
        message: 'unused',
      })
    }
  })
  if (new Set(value.removed_member_ids).size !== value.removed_member_ids.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['removed_member_ids'],
      message: 'duplicate_member',
    })
  }
})

export const AddExpenseGroupMemberSchema = z.object({
  group_id: uuid,
  request_id: requestId,
  member: z.union([
    z.object({ type: z.literal('guest'), display_name: z.string().trim().min(1).max(120) }),
    z.object({
      type: z.literal('email'),
      display_name: z.string().trim().min(1).max(120),
      recipient_email: z.string().trim().email().max(320),
    }),
    z.object({ type: z.literal('relationship'), relationship_id: uuid }),
  ]),
})

export const AddExpenseShareCollaboratorSchema = z.object({
  group_id: uuid,
  expense_id: uuid,
  share_member_id: uuid,
  request_id: requestId,
  member: z.union([
    z.object({ type: z.literal('guest'), display_name: z.string().trim().min(1).max(120) }),
    z.object({
      type: z.literal('email'),
      display_name: z.string().trim().min(1).max(120),
      recipient_email: z.string().trim().email().max(320),
    }),
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

export const RenameExpenseGuestMemberSchema = z.object({
  group_id: uuid,
  member_id: uuid,
  display_name: z.string().trim().min(1).max(120),
  request_id: requestId,
})

export const RespondExpenseMemberInvitationSchema = z.object({
  invitation_id: uuid,
  action: z.enum(['accept', 'decline']),
  request_id: requestId,
  expected_expense_id: uuid.optional(),
}).superRefine((value, ctx) => {
  if (value.action === 'accept' && !value.expected_expense_id) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['expected_expense_id'], message: 'expense_required' })
  }
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

export const AttachExpenseToEventSchema = z.object({
  expense_id: uuid,
  event_id: uuid,
  expected_financial_version: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  expected_event_roster_revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  visibility: EventExpenseVisibilitySchema,
  request_id: requestId,
}).strict()

export const SetExpenseEventVisibilitySchema = z.object({
  expense_id: uuid,
  expected_event_id: uuid,
  expected_link_revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  visibility: EventExpenseVisibilitySchema,
  request_id: requestId,
}).strict()

export const DetachExpenseFromEventSchema = z.object({
  expense_id: uuid,
  expected_event_id: uuid,
  expected_financial_version: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  request_id: requestId,
}).strict()

export const BindExpenseMemberEventIdentitySchema = z.object({
  expense_id: uuid,
  member_id: uuid,
  event_participant_id: uuid,
  expected_financial_version: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  request_id: requestId,
}).strict()

export const DisputeExpenseClaimSchema = z.object({
  expense_id: uuid,
  member_id: uuid,
  expected_financial_version: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  request_id: requestId,
}).strict()

const settlementBatchContextSchema = z.object({
  group_id: uuid,
  from_member_id: uuid,
  to_member_id: uuid,
  expected_financial_version: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  amount_minor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
}).strict().refine(
  (value) => value.from_member_id !== value.to_member_id,
  { message: 'expense_distinct_members_required' },
)

const settlementBatchAnchorSchema = z.object({
  group_id: uuid,
  from_member_id: uuid,
  to_member_id: uuid,
}).strict().refine(
  (value) => value.from_member_id !== value.to_member_id,
  { message: 'expense_distinct_members_required' },
)

const settlementBatchPaymentProfileSchema = z.object({
  profile_id: uuid,
  version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  state_token: z.string().regex(/^[0-9a-f]{32}$/),
}).strict()

export const ProposeExpenseSettlementBatchSchema = z.object({
  anchor: settlementBatchAnchorSchema,
  currency,
  expected_contexts: z.array(settlementBatchContextSchema).min(1).max(100),
  expected_payment_profile: settlementBatchPaymentProfileSchema.nullable(),
  cash_amount: amountInput,
  use_offset: z.boolean(),
  occurred_on: dateField,
  note: z.string().trim().max(1000).nullable().optional().transform((v) => v || null),
  request_id: requestId,
}).strict().superRefine((value, ctx) => {
  const keys = value.expected_contexts.map((context) => (
    `${context.group_id}:${context.from_member_id}:${context.to_member_id}`
  ))
  if (new Set(keys).size !== keys.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['expected_contexts'],
      message: 'expense_duplicate_context',
    })
  }
  if (!value.expected_contexts.some((context) => (
    context.group_id === value.anchor.group_id
    && context.from_member_id === value.anchor.from_member_id
    && context.to_member_id === value.anchor.to_member_id
  ))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['anchor'],
      message: 'expense_settlement_anchor_required',
    })
  }
})

export const TransitionExpenseSettlementBatchSchema = z.object({
  batch_id: uuid,
  action: z.enum(['confirm', 'reject', 'cancel']),
  request_id: requestId,
}).strict()

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
