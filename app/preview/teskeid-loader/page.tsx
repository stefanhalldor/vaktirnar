import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { PreviewBanner } from '@/components/landing/PreviewBanner'
import { TeskeidLoader } from '@/components/teskeid/TeskeidLoader'

export const metadata: Metadata = {
  title: 'Teskeið-loader preview',
  robots: 'noindex',
}

export default async function TeskeidLoaderPreviewPage() {
  const t = await getTranslations('teskeid.loader')

  let ideaTitles: string[] = []
  try {
    const supabase = await createClient()
    const { data: ideas } = await supabase
      .from('ideas')
      .select('title')
      .eq('is_public', true)
      .order('is_featured', { ascending: false })
      .order('votes_count', { ascending: false })
      .limit(8)
    ideaTitles = (ideas ?? []).map((i: { title: string }) => i.title).filter(Boolean)
  } catch {
    // Supabase unavailable — fallback handles this
  }

  return (
    <main className="min-h-screen bg-[#fbf9f4]">
      <PreviewBanner />
      <div className="mx-auto max-w-2xl px-4 py-10 flex flex-col gap-12">

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-[#42493e]">{t('livePreview')}</h2>
          <div className="flex min-h-80 items-center justify-center border border-black/5 bg-white">
            <TeskeidLoader
              ideaTitles={ideaTitles}
              loadingLabel={t('loadingLabel')}
              fallbackIdeaTitle={t('fallbackIdeaTitle')}
            />
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-[#42493e]">{t('fallbackPreview')}</h2>
          <div className="flex min-h-80 items-center justify-center border border-black/5 bg-white">
            <TeskeidLoader
              ideaTitles={[]}
              loadingLabel={t('loadingLabel')}
              fallbackIdeaTitle={t('fallbackIdeaTitle')}
            />
          </div>
        </section>

      </div>
    </main>
  )
}
