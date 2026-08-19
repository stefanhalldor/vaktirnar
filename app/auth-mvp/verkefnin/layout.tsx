import type { Metadata } from 'next'
import { unstable_noStore as noStore } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { TeskeidNavigationFeedbackProvider } from '@/components/teskeid/TeskeidNavigationFeedback'
import { guardHouseholdChoreSession } from '@/lib/household-chores/guard'
import { HouseholdChoreRouteLoading } from './HouseholdChoreRouteLoading'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('teskeid.householdChores')
  return {
    title: t('title'),
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  }
}

export default async function HouseholdChoresLayout({
  children,
}: {
  children: React.ReactNode
}) {
  noStore()
  await guardHouseholdChoreSession()
  return (
    <TeskeidNavigationFeedbackProvider
      pendingFallback={<HouseholdChoreRouteLoading />}
    >
      {children}
    </TeskeidNavigationFeedbackProvider>
  )
}
