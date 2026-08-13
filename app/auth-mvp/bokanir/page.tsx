import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { BookingShell } from '@/components/bookings/BookingShell'
import { ProviderBookingWorkspaceClient } from '@/components/bookings/ProviderBookingWorkspaceClient'
import { guardBookingProvider } from '@/lib/bookings/access.server'
import { loadProviderBookingWorkspace } from '@/lib/bookings/repository.server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('bookings')
  return {
    title: t('provider.title'),
    description: t('provider.intro'),
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  }
}

export default async function BookingProviderPage() {
  const [{ user, spaceId }, t] = await Promise.all([
    guardBookingProvider(),
    getTranslations('bookings'),
  ])
  const workspace = await loadProviderBookingWorkspace(user.id, spaceId)

  return (
    <BookingShell
      title={t('provider.title')}
      description={t('provider.intro')}
      backHref="/auth-mvp/heim"
      backLabel={t('provider.back')}
      menuVariant="authenticated"
    >
      <ProviderBookingWorkspaceClient initialWorkspace={workspace} />
    </BookingShell>
  )
}
