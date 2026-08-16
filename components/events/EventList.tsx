'use client'

import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { CalendarPlus, ChevronRight } from 'lucide-react'
import type { EventSummary } from '@/lib/events/contracts'
import { formatDateTime } from '@/lib/date-format'

export function EventList({ events }: { events: EventSummary[] }) {
  const t = useTranslations('teskeid.events')
  const locale = useLocale()

  return (
    <div className="space-y-6">
      <Link
        href="/auth-mvp/vidburdir/nyr"
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <CalendarPlus aria-hidden size={18} />
        {t('list.create')}
      </Link>

      {events.length === 0 ? (
        <section className="border-y border-border py-6 text-center">
          <h2 className="text-sm font-semibold">{t('list.emptyTitle')}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{t('list.emptyDescription')}</p>
        </section>
      ) : (
        <section aria-labelledby="event-list-heading">
          <h2 id="event-list-heading" className="mb-2 text-sm font-semibold">{t('list.heading')}</h2>
          <div className="divide-y divide-border border-y border-border">
            {events.map((event) => (
              <Link
                key={event.id}
                href={`/auth-mvp/vidburdir/${event.id}`}
                className="flex min-h-16 items-center gap-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm font-medium">{event.name}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                    {t('list.participantCount', { count: event.guestCount })}
                  </span>
                  <span className="block text-xs leading-5 text-muted-foreground">
                    {t('list.createdAt', { date: formatDateTime(event.createdAt, locale) })}
                  </span>
                </span>
                <ChevronRight aria-hidden size={18} className="shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
