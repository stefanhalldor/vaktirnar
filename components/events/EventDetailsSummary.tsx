'use client'

import { useLocale, useTranslations } from 'next-intl'
import type { EventDetailsView } from '@/lib/events/contracts'
import { formatDateOnly } from '@/lib/date-format'

export function EventDetailsSummary({ details }: { details: EventDetailsView }) {
  const t = useTranslations('teskeid.events')
  const locale = useLocale()
  const hasContent = Boolean(
    details.eventDate || details.description || details.agenda,
  )
  if (!hasContent) return null

  return (
    <section className="space-y-4 border-y border-border py-5" aria-labelledby="event-details-summary-heading">
      <h2 id="event-details-summary-heading" className="text-sm font-semibold">
        {t('detail.details')}
      </h2>
      {details.eventDate && details.eventTime ? (
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground">{t('detail.when')}</h3>
          <p className="mt-1 text-sm">
            {formatDateOnly(details.eventDate, locale)}, {details.eventTime}
          </p>
        </div>
      ) : null}
      {details.description ? (
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground">{t('detail.description')}</h3>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{details.description}</p>
        </div>
      ) : null}
      {details.agenda ? (
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground">{t('detail.agenda')}</h3>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{details.agenda}</p>
        </div>
      ) : null}
    </section>
  )
}
