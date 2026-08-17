import 'server-only'

import { getLocale, getTranslations } from 'next-intl/server'
import type { User } from '@supabase/supabase-js'
import type { LoanItem } from '@/lib/loans/types'
import { getAdmin } from '@/lib/supabase/admin'
import {
  expenseActivityIdFromEventKey,
  resolveExpenseRecentEventTargets,
  resolveRecentEventSourceAccess,
  syncEventAttendanceInvitationEvents,
  syncExpenseMemberInvitationEvents,
  type RecentEventSourceAccess,
} from './access.server'
import {
  buildDetailLines,
  EVENT_TYPE_TO_KEY,
  EXPENSE_EVENT_TYPE_TO_KEY,
  formatEventTimestamp,
  getDisplayLocale,
  isRecentEventSource,
  parseRecentEventRow,
  pickLoanUpdatedLabelKey,
} from './display'
import { getUnreadRecentEventsForUser, recordRecentEvent } from './helpers.server'
import type {
  EventRecentEventRow,
  ExpenseRecentEventRow,
  RecentEventDisplay,
  RecentEventSource,
} from './types'

export interface RecentEventInbox {
  ok: boolean
  sources: RecentEventSource[]
  rows: RecentEventDisplay[]
  unreadBySource: Partial<Record<RecentEventSource, number>>
}

interface LoadRecentEventInboxOptions {
  access?: RecentEventSourceAccess
  sources?: readonly RecentEventSource[]
  knownLoans?: readonly LoanItem[]
  linkContext?: 'home' | 'feature'
}

export async function loadRecentEventInbox(
  user: Pick<User, 'id' | 'email'>,
  options: LoadRecentEventInboxOptions = {},
): Promise<RecentEventInbox> {
  const access = options.access ?? await resolveRecentEventSourceAccess(user)
  const requested = options.sources ? new Set(options.sources) : null
  const sources = access.sources.filter((source) => !requested || requested.has(source))
  if (sources.length === 0) return { ok: true, sources, rows: [], unreadBySource: {} }

  const [t, tLoans, locale] = await Promise.all([
    getTranslations('teskeid.home'),
    getTranslations('teskeid.loans'),
    getLocale(),
  ])
  const displayLocale = getDisplayLocale(locale)
  let loans: readonly LoanItem[] = options.knownLoans ?? []

  try {
    if (sources.includes('loans')) {
      if (options.knownLoans === undefined) {
        const loansResult = await getAdmin().rpc('get_my_loans', { p_actor_id: user.id })
        if (!loansResult.error) loans = (loansResult.data ?? []) as LoanItem[]
      }
      await Promise.allSettled(
        loans
          .filter((loan) => (
            loan.requires_acknowledgement
            && loan.invitation_status === 'pending'
            && loan.returned_at === null
            && loan.invitation_id !== null
          ))
          .map((loan) => recordRecentEvent({
            userId: user.id,
            source: 'loans',
            eventType: 'loan_invitation_received',
            entityType: 'invitation',
            entityId: loan.invitation_id!,
            eventKey: `loans:invitation:${loan.invitation_id}:received`,
            payload: { itemName: loan.item_name, recipientRole: loan.my_role },
            href: '/auth-mvp/lanad-og-skilad',
            updateOnConflict: false,
          })),
      )
    }

    const eventInvitationSync = sources.includes('events')
      ? await syncEventAttendanceInvitationEvents(user.id)
      : { ok: true, invitationIds: new Set<string>() }
    if (sources.includes('expenses')) await syncExpenseMemberInvitationEvents(user.id)

    const rawRows = await getUnreadRecentEventsForUser(user.id, sources)
    const parsedRows = rawRows.flatMap((row) => {
      if (!isRecentEventSource(row.source) || !sources.includes(row.source)) return []
      const parsed = parseRecentEventRow(row)
      if (parsed?.source === 'events' && !eventInvitationSync.ok) return []
      if (
        parsed?.source === 'events'
        && eventInvitationSync.ok
        && !eventInvitationSync.invitationIds.has(parsed.entity_id)
      ) return []
      return parsed ? [parsed] : []
    })
    const unreadBySource = parsedRows.reduce<Partial<Record<RecentEventSource, number>>>(
      (counts, event) => ({ ...counts, [event.source]: (counts[event.source] ?? 0) + 1 }),
      {},
    )
    const expenseRows = parsedRows.filter(
      (event): event is ExpenseRecentEventRow => event.source === 'expenses',
    )
    const expenseTargets = sources.includes('expenses')
      ? await resolveExpenseRecentEventTargets(user.id, expenseRows)
      : new Map<string, string>()
    const tFn = (key: string, params?: Record<string, string>) =>
      t(key as Parameters<typeof t>[0], params as Parameters<typeof t>[1])

    const rows: RecentEventDisplay[] = parsedRows.map((event) => {
      if (event.source === 'events') {
        const invitation = event as EventRecentEventRow
        return {
          id: invitation.id,
          source: invitation.source,
          label: t('eventAttendanceInvitationReceived', {
            eventName: invitation.payload.eventName,
          }),
          href: invitation.href,
          viewHref: invitation.href,
          isDeleted: false,
          detailLines: invitation.payload.inviterDisplayName
            ? [t('eventAttendanceInvitationFrom', {
              name: invitation.payload.inviterDisplayName,
            })]
            : [],
          occurredAtLabel: formatEventTimestamp(
            invitation.occurred_at,
            (key) => tLoans(key as Parameters<typeof tLoans>[0]),
          ),
        }
      }
      if (event.source === 'expenses') {
        const title = event.payload.expenseTitle ?? event.payload.groupTitle ?? ''
        const activityId = expenseActivityIdFromEventKey(event.event_key)
        return {
          id: event.id,
          source: event.source,
          label: t(
            EXPENSE_EVENT_TYPE_TO_KEY[event.event_type] as Parameters<typeof t>[0],
            { title },
          ),
          href: event.href,
          viewHref: activityId ? expenseTargets.get(activityId) ?? null : null,
          isDeleted: false,
          detailLines: [],
          occurredAtLabel: formatEventTimestamp(
            event.occurred_at,
            (key) => tLoans(key as Parameters<typeof tLoans>[0]),
          ),
        }
      }

      const itemName = event.payload.itemName ?? ''
      const isDeleted = event.event_type === 'loan_deleted'
      let labelKey: string
      if (event.event_type === 'loan_invitation_received' && event.payload.recipientRole) {
        labelKey = event.payload.recipientRole === 'borrower'
          ? 'eventLoanInvitationReceivedBorrower'
          : 'eventLoanInvitationReceivedLender'
      } else if (event.event_type === 'loan_updated') {
        labelKey = pickLoanUpdatedLabelKey(event.payload.changes)
      } else {
        labelKey = EVENT_TYPE_TO_KEY[event.event_type] ?? event.event_type
      }
      let viewHref: string | null = null
      if (!isDeleted && event.entity_id) {
        if (event.entity_type === 'invitation') {
          const matchingLoan = loans.find((loan) => loan.invitation_id === event.entity_id)
          const params = new URLSearchParams()
          if (!matchingLoan) params.set('invitation', event.entity_id)
          if (options.linkContext !== 'feature') params.set('from', 'heim')
          viewHref = matchingLoan
            ? `/auth-mvp/lanad-og-skilad/${matchingLoan.id}${params.size ? `?${params}` : ''}`
            : `/auth-mvp/lanad-og-skilad?${params}`
        } else if (event.entity_type === 'loan') {
          viewHref = options.linkContext === 'feature'
            ? `/auth-mvp/lanad-og-skilad/${event.entity_id}`
            : `/auth-mvp/lanad-og-skilad/${event.entity_id}?from=heim`
        }
      }
      return {
        id: event.id,
        source: event.source,
        label: t(labelKey as Parameters<typeof t>[0], { itemName }),
        href: event.href,
        viewHref,
        isDeleted,
        detailLines: buildDetailLines(event.payload.changes, tFn, displayLocale),
        occurredAtLabel: formatEventTimestamp(
          event.occurred_at,
          (key) => tLoans(key as Parameters<typeof tLoans>[0]),
        ),
      }
    })

    return { ok: true, sources, rows, unreadBySource }
  } catch {
    return { ok: false, sources, rows: [], unreadBySource: {} }
  }
}
