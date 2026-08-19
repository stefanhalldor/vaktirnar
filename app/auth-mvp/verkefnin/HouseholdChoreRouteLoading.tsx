import { getTranslations } from 'next-intl/server'
import { TeskeidLoader } from '@/components/teskeid/TeskeidLoader'

export async function HouseholdChoreRouteLoading() {
  const [t, loaderTranslations] = await Promise.all([
    getTranslations('teskeid.householdChores'),
    getTranslations('teskeid.loader'),
  ])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <TeskeidLoader
        ideaTitles={[]}
        loadingLabel={t('loading')}
        fallbackIdeaTitle={loaderTranslations('fallbackIdeaTitle')}
      />
    </div>
  )
}
