import { getTranslations } from 'next-intl/server'
import { TeskeidLoader } from '@/components/teskeid/TeskeidLoader'

export async function ExpenseRouteLoading() {
  const t = await getTranslations('teskeid.loader')
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <TeskeidLoader
        ideaTitles={[]}
        loadingLabel={t('loadingLabel')}
        fallbackIdeaTitle={t('fallbackIdeaTitle')}
      />
    </div>
  )
}
