import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { BookingDetailClient } from '@/components/bookings/BookingDetailClient'
import { BookingShell } from '@/components/bookings/BookingShell'
import { guardBookingProvider } from '@/lib/bookings/access.server'
import { loadProviderBookingDetail } from '@/lib/bookings/repository.server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('bookings')
  return {
    title: t('meta.detailTitle'),
    description: t('meta.detailDescription'),
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  }
}

export default async function BookingProviderDetailPage({
  params,
}: {
  params: Promise<{ publicId: string }>
}) {
  const [{ publicId }, { user, spaceId }, t] = await Promise.all([
    params,
    guardBookingProvider(),
    getTranslations('bookings'),
  ])
  const view = await loadProviderBookingDetail(user.id, spaceId, publicId).catch(() => null)
  if (!view) notFound()

  return (
    <BookingShell
      title={t('detail.title')}
      description={t('detail.privateDescription')}
      backHref="/auth-mvp/bokanir"
      backLabel={t('provider.backToInbox')}
      menuVariant="authenticated"
    >
      <BookingDetailClient initialView={view} providerContext />
    </BookingShell>
  )
}
