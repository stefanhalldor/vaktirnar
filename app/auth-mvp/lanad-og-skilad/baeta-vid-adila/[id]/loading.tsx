import { getTranslations } from 'next-intl/server'
import { TeskeidLoader } from '@/components/teskeid/TeskeidLoader'

export default async function Loading() {
  const t = await getTranslations('teskeid.loader')
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fbf9f4]">
      <TeskeidLoader
        ideaTitles={[]}
        loadingLabel={t('loadingLabel')}
        fallbackIdeaTitle={t('fallbackIdeaTitle')}
      />
    </div>
  )
}
