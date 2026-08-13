import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { BookingShell } from '@/components/bookings/BookingShell'
import { PublicBookingService } from '@/components/bookings/BookingRequestForm'
import { loadPublicBookingService } from '@/lib/bookings/repository.server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('bookings')
  return {
    title: t('meta.publicTitle'),
    description: t('meta.publicDescription'),
    referrer: 'no-referrer',
  }
}

export default async function PublicBookingProviderPage({
  params,
}: {
  params: Promise<{ businessProfileSlug: string }>
}) {
  const { businessProfileSlug } = await params
  const view = await loadPublicBookingService(businessProfileSlug).catch(() => null)
  if (!view) notFound()

  return (
    <BookingShell
      title={view.service.title}
      backHref={view.businessProfile.websiteUrl ?? undefined}
      backLabel={view.businessProfile.websiteUrl ? view.businessProfile.displayName : undefined}
    >
      <PublicBookingService view={view} />
    </BookingShell>
  )
}
