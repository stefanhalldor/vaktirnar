'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { BookingShell } from './BookingShell'

export function BookingErrorState({ reset, providerHref, backLabel, menuVariant = 'public' }: {
  reset: () => void
  providerHref?: string
  backLabel?: string
  menuVariant?: 'public' | 'authenticated'
}) {
  const t = useTranslations('bookings')
  const [pending, setPending] = useState(false)
  return (
    <BookingShell title={t('errorTitle')} description={t('errorBody')} menuVariant={menuVariant}>
      <div role="alert" className="border-y border-border py-6">
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setPending(true)
              reset()
            }}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-55"
          >
            {pending ? t('loading') : t('retry')}
          </button>
          {providerHref ? (
            <Link
              href={providerHref}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {backLabel ?? t('backToProvider')}
            </Link>
          ) : null}
        </div>
      </div>
    </BookingShell>
  )
}
