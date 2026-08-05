import { getTranslations } from 'next-intl/server'
import { TeskeidLoader } from '@/components/teskeid/TeskeidLoader'

export async function BookkeepingRouteLoading() {
  const t = await getTranslations('teskeid.loader')
  return (
    <div className="flex min-h-screen items-center justify-center overflow-x-clip bg-background">
      <TeskeidLoader
        ideaTitles={[]}
        loadingLabel={t('loadingLabel')}
        fallbackIdeaTitle={t('fallbackIdeaTitle')}
      />
    </div>
  )
}
