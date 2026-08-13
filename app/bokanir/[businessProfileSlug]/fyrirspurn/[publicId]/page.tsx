import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { BookingDetailClient } from '@/components/bookings/BookingDetailClient'
import { BookingShell } from '@/components/bookings/BookingShell'
import { GuestAccessExchange } from '@/components/bookings/GuestAccessExchange'
import { bookingDetailPath, bookingPublicServicePath } from '@/lib/bookings/contracts'
import { loadBookingDetailForPage } from '@/lib/bookings/repository.server'

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

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ businessProfileSlug: string; publicId: string }>
}) {
  const [{ businessProfileSlug, publicId }, t] = await Promise.all([
    params,
    getTranslations('bookings'),
  ])
  const providerHref = bookingPublicServicePath(businessProfileSlug)
  const view = await loadBookingDetailForPage({ publicId }).catch(() => null)

  if (!view) {
    return (
      <BookingShell
        title={t('detail.title')}
        description={t('detail.privateDescription')}
        backHref={providerHref}
        backLabel={t('backToProvider')}
      >
        <GuestAccessExchange publicId={publicId} providerHref={providerHref} />
      </BookingShell>
    )
  }

  if (view.businessProfileSlug !== businessProfileSlug) {
    redirect(bookingDetailPath(view.businessProfileSlug, view.publicId))
  }

  return (
    <BookingShell
      title={t('detail.title')}
      description={t('detail.privateDescription')}
      backHref={bookingPublicServicePath(view.businessProfileSlug)}
      backLabel={t('backToProvider')}
      menuVariant={view.permissions.signedIn ? 'authenticated' : 'public'}
    >
      <BookingDetailClient initialView={view} />
    </BookingShell>
  )
}
