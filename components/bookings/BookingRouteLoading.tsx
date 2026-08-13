'use client'

import { useTranslations } from 'next-intl'
import { TeskeidLoader } from '@/components/teskeid/TeskeidLoader'

export function BookingRouteLoading() {
  const t = useTranslations('bookings')
  return (
    <TeskeidLoader
      ideaTitles={[t('title')]}
      fallbackIdeaTitle={t('title')}
      loadingLabel={t('loading')}
      className="min-h-[70vh] bg-background px-4"
    />
  )
}
