'use client'

import { BookingErrorState } from '@/components/bookings/BookingErrorState'
import { useTranslations } from 'next-intl'

export default function BookingProviderDetailError({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('bookings')
  return (
    <BookingErrorState
      reset={reset}
      providerHref="/auth-mvp/bokanir"
      backLabel={t('provider.backToInbox')}
      menuVariant="authenticated"
    />
  )
}
