/**
 * Shared event display helpers used by both /heim (Ólesið) and loan history.
 * All functions are pure; translations are injected as function arguments.
 */

import type {
  ExpenseRecentEventEntityType,
  ExpenseRecentEventPayload,
  ExpenseRecentEventType,
} from '@/lib/expenses/events'
import type {
  EventRecentEventPayload,
  HouseholdChoreInvitationRecentEventPayload,
  HouseholdChoreMembershipRemovedRecentEventPayload,
  HouseholdChoreMembershipTypeRecentEventPayload,
  HouseholdChoreRecentEventPayload,
  HouseholdChoreRecentEventType,
  KnownRecentEventRow,
  LoanFieldChange,
  LoanRecentEventPayload,
  LoanRecentEventType,
  RecentEventPayload,
  RecentEventRow,
  RecentEventSource,
} from './types'
import { TASKS_PATH } from '@/lib/household-chores/contracts'
import { formatDateOnly } from '@/lib/date-format'

const LOCALE_MAP: Record<string, string> = { is: 'is-IS', en: 'en-GB' }

export function getDisplayLocale(locale: string): string {
  return LOCALE_MAP[locale] ?? locale
}

export function formatDateStr(dateStr: string | null | undefined, locale: string): string {
  return formatDateOnly(dateStr, locale)
}

export function buildDetailLines(
  changes: LoanFieldChange[] | undefined,
  t: (key: string, params?: Record<string, string>) => string,
  displayLocale: string,
): string[] {
  if (!changes?.length) return []
  return changes.map((change) => {
    const fmt = (v: string | null | undefined) => formatDateStr(v, displayLocale)
    if (change.field === 'item_name') {
      return t('eventDetailItemNameChanged', { oldName: change.oldValue ?? '', newName: change.newValue ?? '' })
    }
    if (change.field === 'loaned_at') {
      return t('eventDetailLoanedAtChanged', { oldDate: fmt(change.oldValue), newDate: fmt(change.newValue) })
    }
    if (change.field === 'due_at') {
      if (change.changeType === 'added')   return t('eventDetailReturnDateAdded',   { date: fmt(change.newValue) })
      if (change.changeType === 'removed') return t('eventDetailReturnDateRemoved', { date: fmt(change.oldValue) })
      return t('eventDetailReturnDateChanged', { oldDate: fmt(change.oldValue), newDate: fmt(change.newValue) })
    }
    // note
    if (change.changeType === 'added')   return t('eventDetailNoteAdded',   { content: change.newValue ?? '' })
    if (change.changeType === 'removed') return t('eventDetailNoteRemoved', { content: change.oldValue ?? '' })
    return t('eventDetailNoteChanged', { oldContent: change.oldValue ?? '', newContent: change.newValue ?? '' })
  })
}

const LOAN_EVENT_TYPE_TO_KEY: Record<LoanRecentEventType, string> = {
  loan_created:              'eventLoanCreated',
  loan_updated:              'eventLoanUpdated',
  loan_returned:             'eventLoanReturned',
  loan_return_undone:        'eventLoanReturnUndone',
  loan_deleted:              'eventLoanDeleted',
  loan_party_added:          'eventLoanPartyAdded',
  loan_invitation_received:  'eventLoanInvitationReceived',
  loan_invitation_accepted:  'eventLoanInvitationAccepted',
  loan_invitation_declined:  'eventLoanInvitationDeclined',
  loan_chat_message:         'eventLoanChatMessage',
  loan_role_switched:        'eventLoanRoleSwitched',
}

/** Kept as the loan-history compatible export used by existing callers. */
export const EVENT_TYPE_TO_KEY: Record<string, string> = LOAN_EVENT_TYPE_TO_KEY

export const EXPENSE_EVENT_TYPE_TO_KEY: Record<ExpenseRecentEventType, string> = {
  expense_created:                   'eventExpenseCreated',
  expense_updated:                   'eventExpenseUpdated',
  expense_cancelled:                 'eventExpenseCancelled',
  expense_group_member_added:        'eventExpenseGroupMemberAdded',
  expense_group_member_removed:      'eventExpenseGroupMemberRemoved',
  expense_group_invitation_received: 'eventExpenseGroupInvitationReceived',
  expense_group_invitation_accepted: 'eventExpenseGroupInvitationAccepted',
  expense_group_invitation_declined: 'eventExpenseGroupInvitationDeclined',
  expense_member_invitation_received: 'eventExpenseMemberInvitationReceived',
  expense_member_invitation_accepted: 'eventExpenseMemberInvitationAccepted',
  expense_member_invitation_declined: 'eventExpenseMemberInvitationDeclined',
  expense_member_invitation_cancelled: 'eventExpenseMemberInvitationCancelled',
  expense_group_member_left:         'eventExpenseGroupMemberLeft',
  expense_group_settling:            'eventExpenseGroupSettling',
  expense_group_settled:             'eventExpenseGroupSettled',
  expense_repayment_reported:        'eventExpenseRepaymentReported',
  expense_repayment_confirmed:       'eventExpenseRepaymentConfirmed',
  expense_repayment_rejected:        'eventExpenseRepaymentRejected',
  expense_repayment_cancelled:       'eventExpenseRepaymentCancelled',
  expense_identity_bound:            'eventExpenseIdentityBound',
  expense_claim_disputed:            'eventExpenseClaimDisputed',
}

const EXPENSE_EVENT_ENTITY_TYPE: Record<ExpenseRecentEventType, ExpenseRecentEventEntityType> = {
  expense_created:                   'expense',
  expense_updated:                   'expense',
  expense_cancelled:                 'expense',
  expense_group_member_added:        'expense_group',
  expense_group_member_removed:      'expense_group',
  expense_group_invitation_received: 'expense_group_invitation',
  expense_group_invitation_accepted: 'expense_group',
  expense_group_invitation_declined: 'expense_group',
  expense_member_invitation_received: 'expense_member_invitation',
  expense_member_invitation_accepted: 'expense_member_invitation',
  expense_member_invitation_declined: 'expense_member_invitation',
  expense_member_invitation_cancelled: 'expense_member_invitation',
  expense_group_member_left:         'expense_group',
  expense_group_settling:            'expense_group',
  expense_group_settled:             'expense_group',
  expense_repayment_reported:        'expense_repayment',
  expense_repayment_confirmed:       'expense_repayment',
  expense_repayment_rejected:        'expense_repayment',
  expense_repayment_cancelled:       'expense_repayment',
  expense_identity_bound:            'expense',
  expense_claim_disputed:            'expense',
}

const LOAN_FIELDS = new Set<LoanFieldChange['field']>([
  'item_name',
  'loaned_at',
  'due_at',
  'note',
])
const LOAN_CHANGE_TYPES = new Set<LoanFieldChange['changeType']>(['changed', 'added', 'removed'])
const LOANS_PATH = '/auth-mvp/lanad-og-skilad'
const EXPENSES_PATH = '/auth-mvp/utlagt-og-endurgreitt'
const EVENTS_INVITATION_PATH = '/auth-mvp/vidburdir/bod/thattaka'

function eventInvitationFallbackTarget(invitationId: string): string {
  return `${EVENTS_INVITATION_PATH}/${invitationId}`
}
const HOUSEHOLD_CHORES_INVITATION_PATH = `${TASKS_PATH}/bod`
const HOUSEHOLD_CHORES_MEMBERSHIP_PATH = `${TASKS_PATH}/adild`
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const HOUSEHOLD_REFERENCE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{8}$/
const UNSAFE_DISPLAY_PATTERN = /[@\u0000-\u001f\u007f]/

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function optionalNullableString(value: unknown): string | null | undefined {
  return value === null || typeof value === 'string' ? value : undefined
}

function sanitizeLoanChanges(value: unknown): LoanFieldChange[] | undefined {
  if (!Array.isArray(value)) return undefined
  const changes = value.flatMap((candidate): LoanFieldChange[] => {
    if (!isRecord(candidate)) return []
    if (
      typeof candidate.field !== 'string'
      || !LOAN_FIELDS.has(candidate.field as LoanFieldChange['field'])
      || typeof candidate.changeType !== 'string'
      || !LOAN_CHANGE_TYPES.has(candidate.changeType as LoanFieldChange['changeType'])
    ) {
      return []
    }
    const oldValue = optionalNullableString(candidate.oldValue)
    const newValue = optionalNullableString(candidate.newValue)
    return [{
      field: candidate.field as LoanFieldChange['field'],
      changeType: candidate.changeType as LoanFieldChange['changeType'],
      ...(oldValue !== undefined ? { oldValue } : {}),
      ...(newValue !== undefined ? { newValue } : {}),
    }]
  })
  return changes.length > 0 ? changes : undefined
}

function sanitizeLoanPayload(value: unknown): LoanRecentEventPayload {
  if (!isRecord(value)) return {}
  const itemName = optionalString(value.itemName)
  const changes = sanitizeLoanChanges(value.changes)
  const actorUserId = optionalString(value.actorUserId)
  const recipientRole = value.recipientRole === 'lender' || value.recipientRole === 'borrower'
    ? value.recipientRole
    : undefined
  const newRole = value.newRole === 'lender' || value.newRole === 'borrower'
    ? value.newRole
    : undefined
  return {
    ...(itemName !== undefined ? { itemName } : {}),
    ...(changes ? { changes } : {}),
    ...(actorUserId !== undefined ? { actorUserId } : {}),
    ...(recipientRole ? { recipientRole } : {}),
    ...(newRole ? { newRole } : {}),
  }
}

function boundedTitle(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const title = value.trim()
  return title.length > 0 && title.length <= 200 ? title : undefined
}

function boundedHouseholdLabel(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const label = value.trim()
  return label.length > 0
    && label.length <= 120
    && !UNSAFE_DISPLAY_PATTERN.test(label)
    ? label
    : undefined
}

function hasExactPayloadKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
): boolean {
  const allowed = new Set([...required, ...optional])
  return required.every((key) => Object.prototype.hasOwnProperty.call(value, key))
    && Object.keys(value).every((key) => allowed.has(key))
}

function householdPayloadBase(
  value: Record<string, unknown>,
): { circleName: string; displayReference: string } | null {
  const circleName = boundedHouseholdLabel(value.circle_name)
  const displayReference = typeof value.display_reference === 'string'
    && HOUSEHOLD_REFERENCE_PATTERN.test(value.display_reference)
    ? value.display_reference
    : null
  return circleName && displayReference ? { circleName, displayReference } : null
}

function householdMembershipType(value: unknown): 'member' | 'child' | null {
  return value === 'member' || value === 'child' ? value : null
}

function sanitizeHouseholdChorePayload(
  eventType: 'household_chore_invitation_received',
  value: unknown,
): HouseholdChoreInvitationRecentEventPayload | null
function sanitizeHouseholdChorePayload(
  eventType: 'household_chore_membership_type_changed',
  value: unknown,
): HouseholdChoreMembershipTypeRecentEventPayload | null
function sanitizeHouseholdChorePayload(
  eventType: 'household_chore_membership_removed',
  value: unknown,
): HouseholdChoreMembershipRemovedRecentEventPayload | null
function sanitizeHouseholdChorePayload(
  eventType: HouseholdChoreRecentEventType,
  value: unknown,
): HouseholdChoreRecentEventPayload | null
function sanitizeHouseholdChorePayload(
  eventType: HouseholdChoreRecentEventType,
  value: unknown,
): HouseholdChoreRecentEventPayload | null {
  if (!isRecord(value)) return null

  if (eventType === 'household_chore_invitation_received') {
    if (!hasExactPayloadKeys(
      value,
      ['circle_name', 'display_reference', 'requested_type'],
      ['inviter_label'],
    )) return null
    const base = householdPayloadBase(value)
    const requestedType = householdMembershipType(value.requested_type)
    const inviterLabel = value.inviter_label === undefined
      ? undefined
      : boundedHouseholdLabel(value.inviter_label)
    if (!base || !requestedType || (value.inviter_label !== undefined && !inviterLabel)) return null
    const payload: HouseholdChoreInvitationRecentEventPayload = {
      ...base,
      requestedType,
      ...(inviterLabel ? { inviterLabel } : {}),
    }
    return payload
  }

  if (eventType === 'household_chore_membership_type_changed') {
    if (!hasExactPayloadKeys(
      value,
      ['circle_name', 'display_reference', 'membership_type'],
      ['actor_label'],
    )) return null
    const base = householdPayloadBase(value)
    const membershipType = householdMembershipType(value.membership_type)
    const actorLabel = value.actor_label === undefined
      ? undefined
      : boundedHouseholdLabel(value.actor_label)
    if (!base || !membershipType || (value.actor_label !== undefined && !actorLabel)) return null
    const payload: HouseholdChoreMembershipTypeRecentEventPayload = {
      ...base,
      membershipType,
      ...(actorLabel ? { actorLabel } : {}),
    }
    return payload
  }

  if (!hasExactPayloadKeys(
    value,
    ['circle_name', 'display_reference'],
    ['actor_label'],
  )) return null
  const base = householdPayloadBase(value)
  const actorLabel = value.actor_label === undefined
    ? undefined
    : boundedHouseholdLabel(value.actor_label)
  if (!base || (value.actor_label !== undefined && !actorLabel)) return null
  const payload: HouseholdChoreMembershipRemovedRecentEventPayload = {
    ...base,
    ...(actorLabel ? { actorLabel } : {}),
  }
  return payload
}

function sanitizeExpensePayload(
  eventType: ExpenseRecentEventType,
  value: unknown,
): ExpenseRecentEventPayload | null {
  if (!isRecord(value)) return null
  const actorUserId = optionalString(value.actorUserId)?.trim()
  const privateClaimEvent = eventType === 'expense_identity_bound'
    || eventType === 'expense_claim_disputed'
  if ((!privateClaimEvent && !actorUserId) || (actorUserId && actorUserId.length > 128)) {
    return null
  }
  const expenseTitle = boundedTitle(value.expenseTitle)
  const groupTitle = boundedTitle(value.groupTitle)
  const entityType = EXPENSE_EVENT_ENTITY_TYPE[eventType]
  if (entityType === 'expense' && !expenseTitle) return null
  if (
    (entityType === 'expense_group'
      || entityType === 'expense_group_invitation'
      || entityType === 'expense_member_invitation')
    && !groupTitle
  ) {
    return null
  }
  if (entityType === 'expense_repayment' && !expenseTitle && !groupTitle) return null
  return {
    ...(expenseTitle ? { expenseTitle } : {}),
    ...(groupTitle ? { groupTitle } : {}),
    ...(actorUserId ? { actorUserId } : {}),
  }
}

function sanitizeEventPayload(value: unknown): EventRecentEventPayload | null {
  if (!isRecord(value)) return null
  const eventName = boundedTitle(value.eventName)
  if (!eventName) return null
  const inviterDisplayName = boundedTitle(value.inviterDisplayName)
  if (inviterDisplayName?.includes('@')) return null
  return {
    eventName,
    ...(inviterDisplayName ? { inviterDisplayName } : {}),
  }
}

export function isRecentEventSource(value: string): value is RecentEventSource {
  return value === 'loans'
    || value === 'expenses'
    || value === 'events'
    || value === 'heimilisverkin'
}

export function isLoanRecentEventType(value: string): value is LoanRecentEventType {
  return Object.prototype.hasOwnProperty.call(LOAN_EVENT_TYPE_TO_KEY, value)
}

export function isExpenseRecentEventType(value: string): value is ExpenseRecentEventType {
  return Object.prototype.hasOwnProperty.call(EXPENSE_EVENT_TYPE_TO_KEY, value)
}

export function isHouseholdChoreRecentEventType(
  value: string,
): value is HouseholdChoreRecentEventType {
  return value === 'household_chore_invitation_received'
    || value === 'household_chore_membership_type_changed'
    || value === 'household_chore_membership_removed'
}

export function sanitizeRecentEventPayload(
  source: 'loans',
  eventType: LoanRecentEventType,
  value: unknown,
): LoanRecentEventPayload
export function sanitizeRecentEventPayload(
  source: 'expenses',
  eventType: ExpenseRecentEventType,
  value: unknown,
): ExpenseRecentEventPayload | null
export function sanitizeRecentEventPayload(
  source: 'events',
  eventType: 'event_attendance_invitation_received',
  value: unknown,
): EventRecentEventPayload | null
export function sanitizeRecentEventPayload(
  source: 'heimilisverkin',
  eventType: HouseholdChoreRecentEventType,
  value: unknown,
): HouseholdChoreRecentEventPayload | null
export function sanitizeRecentEventPayload(
  source: RecentEventSource,
  eventType: string,
  value: unknown,
): RecentEventPayload | null {
  if (source === 'loans' && isLoanRecentEventType(eventType)) return sanitizeLoanPayload(value)
  if (source === 'expenses' && isExpenseRecentEventType(eventType)) {
    return sanitizeExpensePayload(eventType, value)
  }
  if (source === 'events' && eventType === 'event_attendance_invitation_received') {
    return sanitizeEventPayload(value)
  }
  if (source === 'heimilisverkin' && isHouseholdChoreRecentEventType(eventType)) {
    return sanitizeHouseholdChorePayload(eventType, value)
  }
  return null
}

function safeLocalHref(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    ? value
    : fallback
}

/**
 * Parses the untrusted text/JSON tuple returned from recent_events. Unknown
 * sources, mismatched source/event pairs and malformed expense payloads stay
 * server-side and are never serialized into the client feed.
 */
export function parseRecentEventRow(row: RecentEventRow): KnownRecentEventRow | null {
  if (row.source === 'loans' && isLoanRecentEventType(row.event_type)) {
    return {
      ...row,
      source: 'loans',
      event_type: row.event_type,
      payload: sanitizeLoanPayload(row.payload),
      href: safeLocalHref(row.href, LOANS_PATH),
    }
  }
  if (row.source === 'expenses' && isExpenseRecentEventType(row.event_type)) {
    const expectedEntityType = EXPENSE_EVENT_ENTITY_TYPE[row.event_type]
    if (row.entity_type !== expectedEntityType || !row.entity_id) return null
    const payload = sanitizeExpensePayload(row.event_type, row.payload)
    if (!payload) return null
    return {
      ...row,
      source: 'expenses',
      event_type: row.event_type,
      entity_type: expectedEntityType,
      entity_id: row.entity_id,
      payload,
      href: safeLocalHref(row.href, EXPENSES_PATH),
    }
  }
  if (
    row.source === 'events'
    && row.event_type === 'event_attendance_invitation_received'
    && row.entity_type === 'attendance_invitation'
    && typeof row.entity_id === 'string'
    && UUID_PATTERN.test(row.entity_id)
  ) {
    const payload = sanitizeEventPayload(row.payload)
    if (!payload) return null
    return {
      ...row,
      source: 'events',
      event_type: 'event_attendance_invitation_received',
      entity_type: 'attendance_invitation',
      entity_id: row.entity_id,
      payload,
      href: eventInvitationFallbackTarget(row.entity_id),
    }
  }
  if (
    row.source === 'heimilisverkin'
    && typeof row.entity_id === 'string'
    && UUID_PATTERN.test(row.entity_id)
  ) {
    if (row.event_type === 'household_chore_invitation_received') {
      if (
        row.entity_type !== 'household_chore_invitation'
        || row.event_key !== `household:invitation:${row.entity_id}`
      ) return null
      const payload = sanitizeHouseholdChorePayload(row.event_type, row.payload)
      if (!payload) return null
      return {
        ...row,
        source: 'heimilisverkin',
        event_type: row.event_type,
        entity_type: 'household_chore_invitation',
        entity_id: row.entity_id,
        payload,
        href: `${HOUSEHOLD_CHORES_INVITATION_PATH}/${row.entity_id}`,
      }
    }
    if (row.event_type === 'household_chore_membership_type_changed') {
      if (
        row.entity_type !== 'household_chore_membership_event'
        || row.event_key !== `household:membership:${row.entity_id}`
      ) return null
      const payload = sanitizeHouseholdChorePayload(row.event_type, row.payload)
      if (!payload) return null
      return {
        ...row,
        source: 'heimilisverkin',
        event_type: row.event_type,
        entity_type: 'household_chore_membership_event',
        entity_id: row.entity_id,
        payload,
        href: HOUSEHOLD_CHORES_MEMBERSHIP_PATH,
      }
    }
    if (row.event_type === 'household_chore_membership_removed') {
      if (
        row.entity_type !== 'household_chore_membership_event'
        || row.event_key !== `household:membership:${row.entity_id}`
      ) return null
      const payload = sanitizeHouseholdChorePayload(row.event_type, row.payload)
      if (!payload) return null
      return {
        ...row,
        source: 'heimilisverkin',
        event_type: row.event_type,
        entity_type: 'household_chore_membership_event',
        entity_id: row.entity_id,
        payload,
        href: HOUSEHOLD_CHORES_MEMBERSHIP_PATH,
      }
    }
  }
  return null
}

export function formatEventTimestamp(
  isoStr: string,
  tLoans: (key: string) => string,
): string {
  const d = new Date(isoStr)
  if (isNaN(d.getTime())) return ''
  // Iceland = UTC year-round (no daylight saving). UTC methods give correct local time.
  const weekday = tLoans(`weekdays.${d.getUTCDay()}`)
  const day = d.getUTCDate()
  const month = tLoans(`months.${d.getUTCMonth()}`)
  const hours = d.getUTCHours()   // no leading zero
  const mins = String(d.getUTCMinutes()).padStart(2, '0')
  const capitalized = weekday.charAt(0).toUpperCase() + weekday.slice(1)
  return `${capitalized} ${day}. ${month} kl. ${hours}:${mins}`
}

export function pickLoanUpdatedLabelKey(changes: LoanFieldChange[] | undefined): string {
  if (changes?.length === 1) {
    const field = changes[0]!.field
    if (field === 'item_name') return 'eventLoanUpdatedName'
    if (field === 'note')      return 'eventLoanUpdatedNote'
    if (field === 'due_at')    return 'eventLoanUpdatedDueAt'
    if (field === 'loaned_at') return 'eventLoanUpdatedLoanedAt'
  }
  return 'eventLoanUpdated'
}
