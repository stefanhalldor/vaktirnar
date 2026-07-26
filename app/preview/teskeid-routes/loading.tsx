import { getTranslations } from 'next-intl/server'
import { TeskeidLoader } from '@/components/teskeid/TeskeidLoader'

export default async function Loading() {
  const [t, loader] = await Promise.all([getTranslations('teskeid.routeLab'), getTranslations('teskeid.loader')])
  return <main className="flex min-h-screen items-center justify-center bg-[#fbf9f4] px-4"><TeskeidLoader ideaTitles={[t('loading')]} loadingLabel={loader('loadingLabel')} fallbackIdeaTitle={loader('fallbackIdeaTitle')} /></main>
}
