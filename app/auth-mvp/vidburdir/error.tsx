'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { EventShell } from './EventShell'

export default function EventsError({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('teskeid.events')
  const [isPending, startTransition] = useTransition()
  return (
    <EventShell title={t('title')} homeLabel={t('homeLabel')}>
      <div className="space-y-5" role="alert">
        <p className="text-sm leading-6 text-muted-foreground">{t('errors.load_failed')}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            disabled={isPending}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
            onClick={() => startTransition(reset)}
          >
            {t('errors.retry')}
          </button>
          <Link
            href="/auth-mvp/heim"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {t('homeLabel')}
          </Link>
        </div>
      </div>
    </EventShell>
  )
}
