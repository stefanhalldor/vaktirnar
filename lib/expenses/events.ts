import { failExpenseDomain } from './domain-error'
import { assertPartyId, compareStableIds } from './money'

export const EXPENSES_PATH = '/auth-mvp/utlagt-og-endurgreitt'

export type ExpenseRecentEventType =
  | 'expense_created'
  | 'expense_updated'
  | 'expense_cancelled'
  | 'expense_group_member_added'
  | 'expense_group_member_removed'
  | 'expense_group_invitation_received'
  | 'expense_group_invitation_accepted'
  | 'expense_group_invitation_declined'
  | 'expense_member_invitation_received'
  | 'expense_member_invitation_accepted'
  | 'expense_member_invitation_declined'
  | 'expense_member_invitation_cancelled'
  | 'expense_group_member_left'
  | 'expense_group_settling'
  | 'expense_group_settled'
  | 'expense_repayment_reported'
  | 'expense_repayment_confirmed'
  | 'expense_repayment_rejected'
  | 'expense_repayment_cancelled'

export type ExpenseActivityEventType =
  | ExpenseRecentEventType
  | 'expense_group_member_renamed'
  | 'expense_payment_preference_saved'
  | 'expense_payment_preference_deactivated'
  | 'expense_share_collaborator_added'
  | 'expense_share_collaborator_linked'
  | 'expense_share_collaborator_removed'
  | 'expense_settlement_batch_proposed'
  | 'expense_settlement_batch_confirmed'
  | 'expense_settlement_batch_rejected'
  | 'expense_settlement_batch_cancelled'

export type ExpenseRecentEventEntityType =
  | 'expense'
  | 'expense_group'
  | 'expense_group_invitation'
  | 'expense_member_invitation'
  | 'expense_repayment'

export interface ExpenseRecentEventPayload {
  expenseTitle?: string
  groupTitle?: string
  actorUserId: string
}

/**
 * Typed parity contract for the transactional SQL projection and for tests or
 * future adapters. SQL96 writes activity + audience + recent_events together;
 * actions must not call recordRecentEvent again. The shape intentionally has
 * no financial or payment details: Nýlegt is never the audit ledger.
 */
export interface ExpenseRecentEventProjection {
  userId: string
  source: 'expenses'
  eventType: ExpenseRecentEventType
  entityType: ExpenseRecentEventEntityType
  entityId: string
  eventKey: string
  payload: Readonly<ExpenseRecentEventPayload>
  href: string
  updateOnConflict: boolean
  initiallyRead: boolean
}

const EXPENSE_EVENTS = new Set<ExpenseRecentEventType>([
  'expense_created',
  'expense_updated',
  'expense_cancelled',
])

const GROUP_MEMBERSHIP_EVENTS = new Set<ExpenseRecentEventType>([
  'expense_group_member_added',
  'expense_group_member_removed',
  'expense_group_invitation_accepted',
  'expense_group_invitation_declined',
  'expense_group_member_left',
])

const GROUP_INVITATION_EVENTS = new Set<ExpenseRecentEventType>([
  'expense_group_invitation_received',
])

const MEMBER_INVITATION_EVENTS = new Set<ExpenseRecentEventType>([
  'expense_member_invitation_received',
  'expense_member_invitation_accepted',
  'expense_member_invitation_declined',
  'expense_member_invitation_cancelled',
])

const GROUP_STATUS_EVENTS = new Set<ExpenseRecentEventType>([
  'expense_group_settling',
  'expense_group_settled',
])

const REPAYMENT_STATUS_EVENTS = new Set<ExpenseRecentEventType>([
  'expense_repayment_reported',
  'expense_repayment_confirmed',
  'expense_repayment_rejected',
  'expense_repayment_cancelled',
])

function boundedTitle(title: string | undefined): string | undefined {
  if (title === undefined) return undefined
  if (typeof title !== 'string') failExpenseDomain('event_projection_invalid')
  const normalized = title.trim()
  if (normalized.length === 0 || normalized.length > 200) {
    failExpenseDomain('event_projection_invalid')
  }
  return normalized
}

function entityTypeFor(eventType: ExpenseRecentEventType): ExpenseRecentEventEntityType {
  if (EXPENSE_EVENTS.has(eventType)) return 'expense'
  if (GROUP_INVITATION_EVENTS.has(eventType)) return 'expense_group_invitation'
  if (MEMBER_INVITATION_EVENTS.has(eventType)) return 'expense_member_invitation'
  if (GROUP_MEMBERSHIP_EVENTS.has(eventType) || GROUP_STATUS_EVENTS.has(eventType)) {
    return 'expense_group'
  }
  if (REPAYMENT_STATUS_EVENTS.has(eventType)) return 'expense_repayment'
  failExpenseDomain('event_projection_invalid')
}

function eventKeyFor(input: { activityId: string }): { eventKey: string; updateOnConflict: false } {
  // Every projection is immutable and keyed by its durable activity row. The
  // current recent-events helper has no sequence-aware compare-and-set, so a
  // shared mutable status key could let an out-of-order retry overwrite a
  // newer confirmed/settled event.
  return {
    eventKey: `expenses:activity:${input.activityId}`,
    updateOnConflict: false,
  }
}

export function buildExpenseRecentEventProjections(input: {
  /** ID of the immutable, transactionally-created expense activity row. */
  activityId: string
  eventType: ExpenseRecentEventType
  entityId: string
  actorUserId: string
  /** Must come from server-authorized membership/participant state, never client input. */
  authorizedRecipientUserIds: readonly string[]
  expenseTitle?: string
  groupTitle?: string
}): ExpenseRecentEventProjection[] {
  if (!input.activityId?.trim() || !input.entityId?.trim()) {
    failExpenseDomain('event_projection_invalid')
  }
  const actorUserId = assertPartyId(input.actorUserId)
  const entityType = entityTypeFor(input.eventType)
  const expenseTitle = boundedTitle(input.expenseTitle)
  const groupTitle = boundedTitle(input.groupTitle)
  if (entityType === 'expense' && !expenseTitle) {
    failExpenseDomain('event_projection_invalid')
  }
  if (
    (entityType === 'expense_group'
      || entityType === 'expense_group_invitation'
      || entityType === 'expense_member_invitation')
    && !groupTitle
  ) {
    failExpenseDomain('event_projection_invalid')
  }
  if (entityType === 'expense_repayment' && !expenseTitle && !groupTitle) {
    failExpenseDomain('event_projection_invalid')
  }

  const recipients = new Set<string>([actorUserId])
  for (const recipientId of input.authorizedRecipientUserIds) {
    recipients.add(assertPartyId(recipientId))
  }
  const { eventKey, updateOnConflict } = eventKeyFor(input)
  const payload = Object.freeze({
    ...(expenseTitle ? { expenseTitle } : {}),
    ...(groupTitle ? { groupTitle } : {}),
    actorUserId,
  })

  return [...recipients]
    .sort(compareStableIds)
    .map((userId) => ({
      userId,
      source: 'expenses' as const,
      eventType: input.eventType,
      entityType,
      entityId: input.entityId,
      eventKey,
      payload,
      href: entityType === 'expense'
        ? `${EXPENSES_PATH}/utgjold/${input.entityId}`
        : entityType === 'expense_repayment'
          ? `${EXPENSES_PATH}/endurgreidslur/${input.entityId}`
          : entityType === 'expense_group_invitation'
            ? `${EXPENSES_PATH}/bod/${input.entityId}`
            : entityType === 'expense_member_invitation'
              ? `${EXPENSES_PATH}/bod/adili/${input.entityId}`
            : `${EXPENSES_PATH}/hopar/${input.entityId}`,
      updateOnConflict,
      initiallyRead: userId === actorUserId,
    }))
}
