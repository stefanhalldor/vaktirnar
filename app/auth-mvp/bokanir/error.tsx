'use client'

import { BookingErrorState } from '@/components/bookings/BookingErrorState'
import { useTranslations } from 'next-intl'

export default function BookingProviderError({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('bookings')
  return (
    <BookingErrorState
      reset={reset}
      providerHref="/auth-mvp/heim"
      backLabel={t('provider.back')}
      menuVariant="authenticated"
    />
  )
}
