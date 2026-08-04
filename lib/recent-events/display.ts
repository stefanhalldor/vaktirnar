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
  KnownRecentEventRow,
  LoanFieldChange,
  LoanRecentEventPayload,
  LoanRecentEventType,
  RecentEventPayload,
  RecentEventRow,
  RecentEventSource,
} from './types'

const LOCALE_MAP: Record<string, string> = { is: 'is-IS', en: 'en-GB' }

export function getDisplayLocale(locale: string): string {
  return LOCALE_MAP[locale] ?? locale
}

export function formatDateStr(dateStr: string | null | undefined, locale: string): string {
  if (!dateStr) return ''
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(year, (month ?? 1) - 1, day ?? 1),
  )
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
  expense_group_member_left:         'eventExpenseGroupMemberLeft',
  expense_group_settling:            'eventExpenseGroupSettling',
  expense_group_settled:             'eventExpenseGroupSettled',
  expense_repayment_reported:        'eventExpenseRepaymentReported',
  expense_repayment_confirmed:       'eventExpenseRepaymentConfirmed',
  expense_repayment_rejected:        'eventExpenseRepaymentRejected',
  expense_repayment_cancelled:       'eventExpenseRepaymentCancelled',
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
  expense_group_member_left:         'expense_group',
  expense_group_settling:            'expense_group',
  expense_group_settled:             'expense_group',
  expense_repayment_reported:        'expense_repayment',
  expense_repayment_confirmed:       'expense_repayment',
  expense_repayment_rejected:        'expense_repayment',
  expense_repayment_cancelled:       'expense_repayment',
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

function sanitizeExpensePayload(
  eventType: ExpenseRecentEventType,
  value: unknown,
): ExpenseRecentEventPayload | null {
  if (!isRecord(value)) return null
  const actorUserId = optionalString(value.actorUserId)?.trim()
  if (!actorUserId || actorUserId.length > 128) return null
  const expenseTitle = boundedTitle(value.expenseTitle)
  const groupTitle = boundedTitle(value.groupTitle)
  const entityType = EXPENSE_EVENT_ENTITY_TYPE[eventType]
  if (entityType === 'expense' && !expenseTitle) return null
  if ((entityType === 'expense_group' || entityType === 'expense_group_invitation') && !groupTitle) {
    return null
  }
  if (entityType === 'expense_repayment' && !expenseTitle && !groupTitle) return null
  return {
    ...(expenseTitle ? { expenseTitle } : {}),
    ...(groupTitle ? { groupTitle } : {}),
    actorUserId,
  }
}

export function isRecentEventSource(value: string): value is RecentEventSource {
  return value === 'loans' || value === 'expenses'
}

export function isLoanRecentEventType(value: string): value is LoanRecentEventType {
  return Object.prototype.hasOwnProperty.call(LOAN_EVENT_TYPE_TO_KEY, value)
}

export function isExpenseRecentEventType(value: string): value is ExpenseRecentEventType {
  return Object.prototype.hasOwnProperty.call(EXPENSE_EVENT_TYPE_TO_KEY, value)
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
  source: RecentEventSource,
  eventType: string,
  value: unknown,
): RecentEventPayload | null {
  if (source === 'loans' && isLoanRecentEventType(eventType)) return sanitizeLoanPayload(value)
  if (source === 'expenses' && isExpenseRecentEventType(eventType)) {
    return sanitizeExpensePayload(eventType, value)
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
