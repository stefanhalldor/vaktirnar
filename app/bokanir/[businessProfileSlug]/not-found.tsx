import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { BookingShell } from '@/components/bookings/BookingShell'

export default async function BookingProviderNotFound() {
  const t = await getTranslations('bookings')
  return (
    <BookingShell title={t('access.providerNotFoundTitle')} description={t('access.providerNotFoundBody')}>
      <Link
        href="/"
        className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {t('backHome')}
      </Link>
    </BookingShell>
  )
}
