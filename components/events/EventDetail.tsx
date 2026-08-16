'use client'

import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { ChevronRight, Plus } from 'lucide-react'
import type { EventDetailView } from '@/lib/events/contracts'
import type { ExpenseGroupView } from '@/lib/expenses/contracts'
import { formatDateOnly, formatDateTime } from '@/lib/date-format'
import { formatExpenseMinor } from '@/lib/expenses/input-money'

export function EventDetail({
  event,
  group,
}: {
  event: EventDetailView
  group: ExpenseGroupView
}) {
  const t = useTranslations('teskeid.events')
  const locale = useLocale()
  const participants = [...event.participants].sort((left, right) => left.position - right.position)

  return (
    <div className="space-y-8">
      <section className="border-y border-border py-4">
        <p className="text-xs text-muted-foreground">
          {t('detail.createdAt', { date: formatDateTime(event.createdAt, locale) })}
        </p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('detail.privateRosterHint')}</p>
      </section>

      {group.canCreateExpense ? (
        <Link
          href={`/auth-mvp/utlagt-og-endurgreitt/hopar/${group.id}/nytt-utgjald`}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Plus aria-hidden size={18} />
          {t('detail.addExpense')}
        </Link>
      ) : null}

      <section aria-labelledby="event-roster-heading">
        <div className="mb-2">
          <h2 id="event-roster-heading" className="text-sm font-semibold">{t('detail.participants')}</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{t('detail.frozenRosterHint')}</p>
        </div>
        {participants.length === 0 ? (
          <p className="border-y border-border py-4 text-sm text-muted-foreground">{t('detail.noParticipants')}</p>
        ) : (
          <div className="divide-y divide-border border-y border-border">
            {participants.map((participant) => (
              <div key={participant.id} className="flex min-h-14 items-center gap-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm font-medium">{participant.displayName}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t(participant.isTeskeidUser
                      ? 'detail.teskeidParticipant'
                      : 'detail.guestParticipant')}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="event-expenses-heading">
        <h2 id="event-expenses-heading" className="mb-2 text-sm font-semibold">{t('detail.expenses')}</h2>
        {group.expenses.length === 0 ? (
          <p className="border-y border-border py-4 text-sm text-muted-foreground">{t('detail.noExpenses')}</p>
        ) : (
          <div className="divide-y divide-border border-y border-border">
            {group.expenses.map((expense) => (
              <Link
                key={expense.id}
                href={`/auth-mvp/utlagt-og-endurgreitt/utgjold/${expense.id}`}
                className="flex min-h-14 items-center gap-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm font-medium">{expense.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateOnly(expense.incurredOn, locale)}
                    {expense.status === 'cancelled' ? ` · ${t('detail.cancelled')}` : ''}
                  </span>
                </span>
                <strong className="shrink-0 text-sm">
                  {formatExpenseMinor(expense.totalMinor, expense.currency, locale)}
                </strong>
                <ChevronRight aria-hidden size={17} className="shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        )}
      </section>

      <Link
        href={`/auth-mvp/utlagt-og-endurgreitt/hopar/${group.id}`}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {t('detail.openSettlement')}
      </Link>
    </div>
  )
}
