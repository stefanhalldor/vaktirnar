'use client'

import { BookingErrorState } from '@/components/bookings/BookingErrorState'
import { useTranslations } from 'next-intl'

export default function PublicBookingProviderError({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('bookings')
  return <BookingErrorState reset={reset} providerHref="/" backLabel={t('backHome')} />
}
