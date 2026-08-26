import { z } from 'zod'

import { EXPENSE_CURRENCIES, type ExpenseCurrency } from './input-money'

const sql159UuidSchema = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
)
const sql159PositiveSafeIntegerSchema = z.number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER)
const sql159NonnegativeSafeIntegerSchema = z.number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER)
const sql159DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}, 'invalid_date')
const sql159TitleSchema = z.string()
  .min(1)
  .max(200)
  .refine((value) => value.trim() === value, 'title_not_normalized')
const sql159CurrencySchema = z.enum(EXPENSE_CURRENCIES)
const sql159AllocationStateSchema = z.enum(['incomplete', 'balanced_unconfirmed'])
const sql159FingerprintSchema = z.string().regex(/^[0-9a-f]{32}$/)

export const ShareExpenseDraftSchema = z.object({
  request_id: sql159UuidSchema,
  draft_id: sql159UuidSchema,
  expected_draft_version: sql159PositiveSafeIntegerSchema,
  expected_publication_version: sql159PositiveSafeIntegerSchema.nullable(),
}).strict()

export const UnshareExpenseDraftSchema = z.object({
  request_id: sql159UuidSchema,
  draft_id: sql159UuidSchema,
  expected_draft_version: sql159PositiveSafeIntegerSchema,
  expected_publication_version: sql159PositiveSafeIntegerSchema,
}).strict()

export const FinalizeExpenseDraftSchema = z.object({
  request_id: sql159UuidSchema,
  draft_id: sql159UuidSchema,
  expected_draft_version: sql159PositiveSafeIntegerSchema,
  expected_publication_version: sql159PositiveSafeIntegerSchema.nullable(),
  split_confirmed: z.literal(true),
}).strict()

export const RefreshExpenseDraftPublicationLifecycleSchema = z.object({
  draft_id: sql159UuidSchema,
}).strict()

export type ShareExpenseDraftInput = z.infer<typeof ShareExpenseDraftSchema>
export type UnshareExpenseDraftInput = z.infer<typeof UnshareExpenseDraftSchema>
export type FinalizeExpenseDraftInput = z.infer<typeof FinalizeExpenseDraftSchema>
export type RefreshExpenseDraftPublicationLifecycleInput = z.infer<
  typeof RefreshExpenseDraftPublicationLifecycleSchema
>

const expenseDraftPublicationNotFoundWireSchema = z.object({
  contract_version: z.literal(1),
  status: z.literal('not_found'),
}).strict()

const expenseDraftPublicationNeverSharedWireSchema = z.object({
  contract_version: z.literal(1),
  status: z.literal('ready'),
  draft_id: sql159UuidSchema,
  draft_version: sql159PositiveSafeIntegerSchema,
  sharing_state: z.literal('never_shared'),
  expected_publication_version: z.null(),
}).strict()

const expenseDraftPublicationSharedWireSchema = z.object({
  contract_version: z.literal(1),
  status: z.literal('ready'),
  draft_id: sql159UuidSchema,
  draft_version: sql159PositiveSafeIntegerSchema,
  sharing_state: z.literal('shared'),
  expected_publication_version: sql159PositiveSafeIntegerSchema,
}).strict()

const expenseDraftPublicationWithdrawnWireSchema = z.object({
  contract_version: z.literal(1),
  status: z.literal('ready'),
  draft_id: sql159UuidSchema,
  draft_version: sql159PositiveSafeIntegerSchema,
  sharing_state: z.literal('withdrawn'),
  expected_publication_version: sql159PositiveSafeIntegerSchema,
}).strict()

const expenseDraftPublicationLifecycleWireSchema = z.union([
  expenseDraftPublicationNotFoundWireSchema,
  expenseDraftPublicationNeverSharedWireSchema,
  expenseDraftPublicationSharedWireSchema,
  expenseDraftPublicationWithdrawnWireSchema,
])

interface ExpenseDraftPublicationLifecycleReadyBase {
  status: 'ready'
  draftId: string
  draftVersion: number
  hasUnsharedChanges: boolean | null
}

export type ExpenseDraftPublicationLifecycleReadyView =
  | (ExpenseDraftPublicationLifecycleReadyBase & {
      sharingState: 'never_shared'
      expectedPublicationVersion: null
    })
  | (ExpenseDraftPublicationLifecycleReadyBase & {
      sharingState: 'shared' | 'withdrawn'
      expectedPublicationVersion: number
    })

export type ExpenseDraftPublicationLifecycleView =
  | ExpenseDraftPublicationLifecycleReadyView
  | { status: 'unavailable' }

export function parseExpenseDraftPublicationLifecycle(
  value: unknown,
): ExpenseDraftPublicationLifecycleView {
  const parsed = expenseDraftPublicationLifecycleWireSchema.safeParse(value)
  if (!parsed.success || parsed.data.status === 'not_found') {
    return { status: 'unavailable' }
  }
  return {
    status: 'ready',
    draftId: parsed.data.draft_id,
    draftVersion: parsed.data.draft_version,
    sharingState: parsed.data.sharing_state,
    expectedPublicationVersion: parsed.data.expected_publication_version,
    // This RPC intentionally exposes neither the source draft version nor the
    // shareable fingerprint. Do not infer a false "unchanged" answer.
    hasUnsharedChanges: null,
  } as ExpenseDraftPublicationLifecycleReadyView
}

export function shareExpectedPublicationVersion(
  lifecycle: ExpenseDraftPublicationLifecycleReadyView,
): number | null {
  return lifecycle.expectedPublicationVersion
}

export function finalizeExpectedPublicationVersion(
  lifecycle: ExpenseDraftPublicationLifecycleReadyView,
): number | null {
  return lifecycle.sharingState === 'shared'
    ? lifecycle.expectedPublicationVersion
    : null
}

const expenseShareResultWireSchema = z.object({
  contract_version: z.literal(1),
  state: z.literal('shared_draft'),
  draft_id: sql159UuidSchema,
  draft_version: sql159PositiveSafeIntegerSchema,
  publication_id: sql159UuidSchema,
  publication_version: sql159PositiveSafeIntegerSchema,
  allocation_state: sql159AllocationStateSchema,
  shareable_fingerprint: sql159FingerprintSchema,
}).strict()

const expenseUnshareResultWireSchema = z.object({
  contract_version: z.literal(1),
  state: z.literal('private_draft'),
  draft_id: sql159UuidSchema,
  draft_version: sql159PositiveSafeIntegerSchema,
  publication_id: sql159UuidSchema,
  publication_version: sql159PositiveSafeIntegerSchema,
}).strict()

const invitationIdsSchema = z.array(sql159UuidSchema).max(49).refine(
  (ids) => new Set(ids).size === ids.length,
  'duplicate_invitation_id',
)

const expenseFinalizeResultWireSchema = z.object({
  contract_version: z.literal(1),
  state: z.literal('confirmed'),
  draft_id: sql159UuidSchema,
  group_id: sql159UuidSchema,
  expense_id: sql159UuidSchema,
  invitation_ids: invitationIdsSchema,
}).strict()

export interface ExpenseDraftShareResult {
  state: 'shared_draft'
  draftId: string
  draftVersion: number
  publicationId: string
  publicationVersion: number
  allocationState: 'incomplete' | 'balanced_unconfirmed'
  shareableFingerprint: string
}

export interface ExpenseDraftUnshareResult {
  state: 'private_draft'
  draftId: string
  draftVersion: number
  publicationId: string
  publicationVersion: number
}

export interface ExpenseDraftFinalizeResult {
  state: 'confirmed'
  draftId: string
  groupId: string
  expenseId: string
  invitationIds: string[]
}

export function parseExpenseShareResult(value: unknown): ExpenseDraftShareResult | null {
  const parsed = expenseShareResultWireSchema.safeParse(value)
  if (!parsed.success) return null
  return {
    state: 'shared_draft',
    draftId: parsed.data.draft_id,
    draftVersion: parsed.data.draft_version,
    publicationId: parsed.data.publication_id,
    publicationVersion: parsed.data.publication_version,
    allocationState: parsed.data.allocation_state,
    shareableFingerprint: parsed.data.shareable_fingerprint,
  }
}

export function parseExpenseUnshareResult(value: unknown): ExpenseDraftUnshareResult | null {
  const parsed = expenseUnshareResultWireSchema.safeParse(value)
  if (!parsed.success) return null
  return {
    state: 'private_draft',
    draftId: parsed.data.draft_id,
    draftVersion: parsed.data.draft_version,
    publicationId: parsed.data.publication_id,
    publicationVersion: parsed.data.publication_version,
  }
}

export function parseExpenseFinalizeResult(value: unknown): ExpenseDraftFinalizeResult | null {
  const parsed = expenseFinalizeResultWireSchema.safeParse(value)
  if (!parsed.success) return null
  return {
    state: 'confirmed',
    draftId: parsed.data.draft_id,
    groupId: parsed.data.group_id,
    expenseId: parsed.data.expense_id,
    invitationIds: parsed.data.invitation_ids,
  }
}

const privateDraftDetailTargetWireSchema = z.object({
  kind: z.literal('private_draft'),
  draft_id: sql159UuidSchema,
}).strict()

const sharedDraftDetailTargetWireSchema = z.object({
  kind: z.literal('shared_draft'),
  publication_id: sql159UuidSchema,
}).strict()

const visibleSharedDraftBaseWire = {
  lifecycle_state: z.literal('shared_draft'),
  publication_id: sql159UuidSchema,
  publication_version: sql159PositiveSafeIntegerSchema,
  title: sql159TitleSchema,
  total_minor: sql159PositiveSafeIntegerSchema,
  currency: sql159CurrencySchema,
  incurred_on: sql159DateSchema,
  allocation_state: sql159AllocationStateSchema,
} as const

const visibleAuthorSharedDraftWireSchema = z.object({
  ...visibleSharedDraftBaseWire,
  viewer_role: z.literal('author'),
  has_unshared_changes: z.boolean(),
  detail_target: privateDraftDetailTargetWireSchema,
}).strict()

const visibleParticipantSharedDraftWireSchema = z.object({
  ...visibleSharedDraftBaseWire,
  viewer_role: z.literal('participant'),
  has_unshared_changes: z.null(),
  detail_target: sharedDraftDetailTargetWireSchema,
}).strict().superRefine((value, context) => {
  if (value.detail_target.publication_id !== value.publication_id) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['detail_target', 'publication_id'],
      message: 'publication_target_mismatch',
    })
  }
})

const visibleSharedDraftWireSchema = z.union([
  visibleAuthorSharedDraftWireSchema,
  visibleParticipantSharedDraftWireSchema,
])

const visibleSharedDraftReadyWireSchema = z.object({
  contract_version: z.literal(1),
  status: z.literal('ready'),
  rows: z.array(visibleSharedDraftWireSchema).min(1).max(100),
}).strict()

const visibleSharedDraftNoneWireSchema = z.object({
  contract_version: z.literal(1),
  status: z.literal('none'),
  rows: z.tuple([]),
}).strict()

const visibleSharedDraftUnavailableWireSchema = z.object({
  contract_version: z.literal(1),
  status: z.literal('unavailable'),
  rows: z.tuple([]),
}).strict()

const visibleSharedDraftListWireSchema = z.union([
  visibleSharedDraftReadyWireSchema,
  visibleSharedDraftNoneWireSchema,
  visibleSharedDraftUnavailableWireSchema,
])

interface ExpenseSharedDraftSummaryBaseView {
  lifecycleState: 'shared_draft'
  publicationId: string
  publicationVersion: number
  title: string
  totalMinor: number
  currency: ExpenseCurrency
  incurredOn: string
  allocationState: 'incomplete' | 'balanced_unconfirmed'
}

export type ExpenseSharedDraftSummaryView =
  | (ExpenseSharedDraftSummaryBaseView & {
      viewerRole: 'author'
      hasUnsharedChanges: boolean
      detailTarget: { kind: 'private_draft'; draftId: string }
    })
  | (ExpenseSharedDraftSummaryBaseView & {
      viewerRole: 'participant'
      hasUnsharedChanges: null
      detailTarget: { kind: 'shared_draft'; publicationId: string }
    })

export type ExpenseSharedDraftListView =
  | { status: 'ready'; items: ExpenseSharedDraftSummaryView[] }
  | { status: 'unavailable'; items: [] }

function unavailableSharedDraftList(): ExpenseSharedDraftListView {
  return { status: 'unavailable', items: [] }
}

export function parseVisibleSharedExpenseDrafts(value: unknown): ExpenseSharedDraftListView {
  const parsed = visibleSharedDraftListWireSchema.safeParse(value)
  if (!parsed.success) return unavailableSharedDraftList()
  if (parsed.data.status === 'unavailable') return unavailableSharedDraftList()
  if (parsed.data.status === 'none') return { status: 'ready', items: [] }
  if (
    new Set(parsed.data.rows.map((row) => row.publication_id)).size
      !== parsed.data.rows.length
  ) return unavailableSharedDraftList()

  const rows: ExpenseSharedDraftSummaryView[] = parsed.data.rows.map((row) => {
    const common: ExpenseSharedDraftSummaryBaseView = {
      lifecycleState: 'shared_draft',
      publicationId: row.publication_id,
      publicationVersion: row.publication_version,
      title: row.title,
      totalMinor: row.total_minor,
      currency: row.currency,
      incurredOn: row.incurred_on,
      allocationState: row.allocation_state,
    }
    if (row.viewer_role === 'author') {
      return {
        ...common,
        viewerRole: 'author',
        hasUnsharedChanges: row.has_unshared_changes,
        detailTarget: {
          kind: 'private_draft',
          draftId: row.detail_target.draft_id,
        },
      }
    }
    return {
      ...common,
      viewerRole: 'participant',
      hasUnsharedChanges: null,
      detailTarget: {
        kind: 'shared_draft',
        publicationId: row.detail_target.publication_id,
      },
    }
  })
  return { status: 'ready', items: rows }
}

const sharedDraftPartyWireSchema = z.object({
  display_name: z.string()
    .min(1)
    .max(120)
    .refine((value) => value.trim() === value && !value.includes('@'), 'unsafe_display_name'),
  is_author: z.boolean(),
  is_payer: z.boolean(),
  is_participant: z.boolean(),
  proposed_paid_minor: sql159NonnegativeSafeIntegerSchema.nullable(),
  proposed_share_minor: sql159NonnegativeSafeIntegerSchema.nullable(),
}).strict().superRefine((value, context) => {
  if (!value.is_payer && !value.is_participant) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'party_not_selected' })
  }
})

const sharedDraftDetailDraftWireSchema = z.object({
  lifecycle_state: z.literal('shared_draft'),
  publication_id: sql159UuidSchema,
  publication_version: sql159PositiveSafeIntegerSchema,
  title: sql159TitleSchema,
  total_minor: sql159PositiveSafeIntegerSchema,
  currency: sql159CurrencySchema,
  incurred_on: sql159DateSchema,
  allocation_state: sql159AllocationStateSchema,
  viewer_role: z.enum(['author', 'participant']),
  parties: z.array(sharedDraftPartyWireSchema).min(1).max(50),
}).strict().superRefine((value, context) => {
  if (value.parties.filter((party) => party.is_author).length !== 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['parties'], message: 'author_count_invalid' })
  }
  if (value.allocation_state === 'incomplete') {
    if (value.parties.some((party) => (
      party.proposed_paid_minor !== null || party.proposed_share_minor !== null
    ))) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['parties'], message: 'incomplete_amount_leak' })
    }
    return
  }
  if (value.parties.some((party) => (
    party.proposed_paid_minor === null
    || party.proposed_share_minor === null
    || (!party.is_payer && party.proposed_paid_minor !== 0)
    || (!party.is_participant && party.proposed_share_minor !== 0)
  ))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['parties'], message: 'balanced_party_invalid' })
    return
  }
  const paidTotal = value.parties.reduce(
    (sum, party) => sum + (party.proposed_paid_minor ?? 0),
    0,
  )
  const shareTotal = value.parties.reduce(
    (sum, party) => sum + (party.proposed_share_minor ?? 0),
    0,
  )
  if (!Number.isSafeInteger(paidTotal) || !Number.isSafeInteger(shareTotal)
    || paidTotal !== value.total_minor || shareTotal !== value.total_minor) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['parties'], message: 'balanced_total_invalid' })
  }
})

const sharedDraftDetailWireSchema = z.union([
  expenseDraftPublicationNotFoundWireSchema,
  z.object({
    contract_version: z.literal(1),
    status: z.literal('ready'),
    draft: sharedDraftDetailDraftWireSchema,
  }).strict(),
])

export interface ExpenseSharedDraftPartyView {
  displayName: string
  isAuthor: boolean
  isPayer: boolean
  isParticipant: boolean
  proposedPaidMinor: number | null
  proposedShareMinor: number | null
}

export type ExpenseSharedDraftDetailView =
  | {
      status: 'ready'
      lifecycleState: 'shared_draft'
      publicationId: string
      publicationVersion: number
      title: string
      totalMinor: number
      currency: ExpenseCurrency
      incurredOn: string
      allocationState: 'incomplete' | 'balanced_unconfirmed'
      viewerRole: 'author' | 'participant'
      parties: ExpenseSharedDraftPartyView[]
    }
  | { status: 'not_found' }
  | { status: 'unavailable' }

export function parseExpenseSharedDraftDetail(value: unknown): ExpenseSharedDraftDetailView {
  const parsed = sharedDraftDetailWireSchema.safeParse(value)
  if (!parsed.success) return { status: 'unavailable' }
  if (parsed.data.status === 'not_found') return { status: 'not_found' }
  return {
    status: 'ready',
    lifecycleState: 'shared_draft',
    publicationId: parsed.data.draft.publication_id,
    publicationVersion: parsed.data.draft.publication_version,
    title: parsed.data.draft.title,
    totalMinor: parsed.data.draft.total_minor,
    currency: parsed.data.draft.currency,
    incurredOn: parsed.data.draft.incurred_on,
    allocationState: parsed.data.draft.allocation_state,
    viewerRole: parsed.data.draft.viewer_role,
    parties: parsed.data.draft.parties.map((party) => ({
      displayName: party.display_name,
      isAuthor: party.is_author,
      isPayer: party.is_payer,
      isParticipant: party.is_participant,
      proposedPaidMinor: party.proposed_paid_minor,
      proposedShareMinor: party.proposed_share_minor,
    })),
  }
}
