import { unstable_noStore as noStore } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { guardHouseholdChoreAccess } from '@/lib/household-chores/guard'
import { HouseholdChoreAuthorityBoundary } from './HouseholdChoreAuthorityBoundary'

export default async function HouseholdChoreContentLayout({
  children,
}: {
  children: React.ReactNode
}) {
  noStore()
  const [, t, loaderTranslations] = await Promise.all([
    guardHouseholdChoreAccess(),
    getTranslations('teskeid.householdChores'),
    getTranslations('teskeid.loader'),
  ])
  return (
    <HouseholdChoreAuthorityBoundary
      loadingLabel={t('loading')}
      fallbackIdeaTitle={loaderTranslations('fallbackIdeaTitle')}
    >
      {children}
    </HouseholdChoreAuthorityBoundary>
  )
}
