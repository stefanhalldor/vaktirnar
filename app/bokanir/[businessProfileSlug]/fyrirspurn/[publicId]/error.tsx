'use client'

import { BookingErrorState } from '@/components/bookings/BookingErrorState'
import { useParams } from 'next/navigation'
import { bookingPublicServicePath } from '@/lib/bookings/contracts'

export default function BookingDetailError({
  reset,
}: {
  error: Error
  reset: () => void
}) {
  const params = useParams<{ businessProfileSlug: string }>()
  return (
    <BookingErrorState
      reset={reset}
      providerHref={bookingPublicServicePath(params.businessProfileSlug)}
    />
  )
}
