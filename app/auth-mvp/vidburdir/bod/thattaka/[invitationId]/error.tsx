'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { EventShell } from '../../../EventShell'

export default function InvitationError({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('teskeid.events')
  const [isPending, startTransition] = useTransition()
  return (
    <EventShell title={t('invitation.errorTitle')} homeLabel={t('homeLabel')}>
      <div className="space-y-5" role="alert">
        <p className="text-sm leading-6 text-muted-foreground">
          {t('invitation.errorDescription')}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            disabled={isPending}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
            onClick={() => startTransition(reset)}
          >
            {t('errors.retry')}
          </button>
          <Link
            href="/auth-mvp/heim"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {t('homeLabel')}
          </Link>
        </div>
      </div>
    </EventShell>
  )
}
