import { getLocale } from 'next-intl/server'
import Link from 'next/link'
import { ExpensePayAll } from '@/components/expenses/ExpensePayAll'
import { EventExpensePreview } from '@/components/expenses/EventExpensePreview'
import { ExpenseShell } from '@/components/expenses/ExpenseShell'
import { getExpenseTranslations } from '@/components/expenses/i18n.server'
import { guardExpenseAccess } from '@/lib/expenses/guard'
import { getExpensePayAllView } from '@/lib/expenses/repository.server'
import { canUseEventExpenses } from '@/lib/events/guard'
import {
  getEventExpensePreview,
  getOwnedEventExpenseSource,
} from '@/lib/events/repository.server'
import type { EventExpensePreviewView, EventExpenseSourceView } from '@/lib/events/contracts'
import { expenseSecondaryButtonClass } from '@/components/expenses/ui'

export default async function ExpensePayAllPage({ searchParams }: {
  searchParams: Promise<{ event?: string | string[] }>
}) {
  const [{ user }, t, locale, query] = await Promise.all([
    guardExpenseAccess(),
    getExpenseTranslations(),
    getLocale(),
    searchParams,
  ])
  const eventMode = query.event !== undefined
  const view = eventMode ? null : await getExpensePayAllView(user.id)
  let eventSource: EventExpenseSourceView | null = null
  let eventPreview: EventExpensePreviewView | null = null
  let eventQueryUnavailable = false

  if (eventMode) {
    const requestedEventId = typeof query.event === 'string' ? query.event : null
    const canUseEvents = await canUseEventExpenses(user)
    if (requestedEventId && canUseEvents) {
      try {
        eventSource = await getOwnedEventExpenseSource(user.id, requestedEventId)
      } catch {
        eventQueryUnavailable = true
      }
      if (eventSource) {
        const authorizedEventSource = eventSource
        try {
          eventPreview = await getEventExpensePreview(user.id, authorizedEventSource.id)
          if (!eventPreview) {
            eventSource = null
            eventQueryUnavailable = true
          }
        } catch {
          eventPreview = {
            eventId: authorizedEventSource.id,
            status: 'unavailable',
            taggedExpenseCount: 0,
            currencies: [],
          }
        }
      } else {
        eventQueryUnavailable = true
      }
    } else {
      eventQueryUnavailable = true
    }
  }

  return (
    <ExpenseShell
      title={eventMode ? t('eventPreview.pageTitle') : t('payAll.title')}
      homeLabel={t('homeLabel')}
      backHref="/auth-mvp/utlagt-og-endurgreitt"
      backLabel={t('back')}
      closedTestingFeature="utlagt-og-endurgreitt"
    >
      {eventSource && eventPreview ? (
        <EventExpensePreview
          eventName={eventSource.name}
          preview={eventPreview}
        />
      ) : eventQueryUnavailable ? (
        <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900">
          {t('eventPreview.queryUnavailable')}
        </p>
      ) : null}
      {eventMode ? (
        <div className="mt-6 space-y-3 border-t border-border pt-5">
          <p className="text-xs leading-5 text-muted-foreground">
            {t('eventPreview.globalSettlementNotice')}
          </p>
          <Link
            href="/auth-mvp/utlagt-og-endurgreitt/gera-upp"
            className={`${expenseSecondaryButtonClass} w-full`}
          >
            {t('eventPreview.openGlobalSettlement')}
          </Link>
        </div>
      ) : view ? (
        <ExpensePayAll view={view} locale={locale} initialDate={new Date().toISOString().slice(0, 10)} />
      ) : null}
    </ExpenseShell>
  )
}
