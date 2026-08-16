import { getTranslations } from 'next-intl/server'
import { TeskeidLoader } from '@/components/teskeid/TeskeidLoader'

export async function EventRouteLoading() {
  const [eventTranslations, loaderTranslations] = await Promise.all([
    getTranslations('teskeid.events'),
    getTranslations('teskeid.loader'),
  ])
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <TeskeidLoader
        ideaTitles={[]}
        loadingLabel={eventTranslations('loading')}
        fallbackIdeaTitle={loaderTranslations('fallbackIdeaTitle')}
      />
    </div>
  )
}
