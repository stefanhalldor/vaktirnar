'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { BookingPendingLink } from './BookingPendingLink'

type ExchangeState = 'checking' | 'denied'

export function GuestAccessExchange({
  publicId,
  providerHref,
}: {
  publicId: string
  providerHref: string
}) {
  const t = useTranslations('bookings')
  const router = useRouter()
  const attempted = useRef(false)
  const [state, setState] = useState<ExchangeState>('checking')

  useEffect(() => {
    if (attempted.current) return
    attempted.current = true
    const params = new URLSearchParams(window.location.hash.slice(1))
    const capability = params.get('access')
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)

    if (!capability || !/^[A-Za-z0-9_-]{43}$/.test(capability)) {
      setState('denied')
      return
    }

    void fetch(`/api/bookings/public/requests/${encodeURIComponent(publicId)}/exchange`, {
      method: 'POST',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ capability }),
    }).then(response => {
      if (!response.ok) throw new Error('exchange failed')
      router.refresh()
    }).catch(() => setState('denied'))
  }, [publicId, router])

  if (state === 'checking') {
    return <p role="status" className="border-y border-border py-6 text-sm text-muted-foreground">{t('access.checking')}</p>
  }

  return (
    <div role="alert" className="space-y-4 border-y border-border py-6">
      <div>
        <h2 className="font-semibold text-primary">{t('access.notFoundTitle')}</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{t('access.notFoundBody')}</p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Link
          href={providerHref}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-4 text-center text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t('backToProvider')}
        </Link>
        <BookingPendingLink
          href={`/innskraning?next=${encodeURIComponent(`${providerHref}/fyrirspurn/${encodeURIComponent(publicId)}`)}`}
          pendingLabel={t('access.openingSignIn')}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-center text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t('access.signIn')}
        </BookingPendingLink>
      </div>
    </div>
  )
}
