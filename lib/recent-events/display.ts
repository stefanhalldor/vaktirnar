/**
 * Shared event display helpers used by both /heim (Ólesið) and loan history.
 * All functions are pure; translations are injected as function arguments.
 */

import type { LoanFieldChange } from './types'

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

export const EVENT_TYPE_TO_KEY: Record<string, string> = {
  loan_created:              'eventLoanCreated',
  loan_updated:              'eventLoanUpdated',
  loan_returned:             'eventLoanReturned',
  loan_return_undone:        'eventLoanReturnUndone',
  loan_deleted:              'eventLoanDeleted',
  loan_invitation_received:  'eventLoanInvitationReceived',
  loan_invitation_accepted:  'eventLoanInvitationAccepted',
  loan_invitation_declined:  'eventLoanInvitationDeclined',
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
