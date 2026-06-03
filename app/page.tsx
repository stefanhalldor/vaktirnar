import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { NavBar, BottomNav } from '@/components/teskeid/NavBar'
import { HeroSection } from '@/components/teskeid/HeroSection'
import { IdeaGrid } from '@/components/teskeid/IdeaGrid'
import { PageViewTracker } from '@/components/teskeid/PageViewTracker'

export default async function Home() {
  const t = await getTranslations('teskeid')

  const supabase = await createClient()
  const { data: ideas } = await supabase
    .from('ideas')
    .select('*')
    .eq('is_public', true)
    .order('is_featured', { ascending: false })
    .order('votes_count', { ascending: false })

  return (
    <main className="min-h-screen bg-[#fbf9f4] pb-32">
      <PageViewTracker />
      <NavBar />
      <HeroSection
        tagline={t('hero.tagline')}
        description={t('hero.description')}
        supportingLine={t('hero.supportingLine')}
      />

      <section className="max-w-[768px] mx-auto px-5 pb-8">
        <p className="text-lg font-medium text-[#42493e] text-center max-w-[600px] mx-auto mb-6 leading-[28px]">
          {t('hero.ideasIntro')}
        </p>
        <IdeaGrid ideas={ideas ?? []} />
      </section>

      <footer className="max-w-[768px] mx-auto px-5 py-8 border-t border-black/5 mt-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-2 text-sm text-[#72796e]">
          <span>{t('footer.tagline')}</span>
          <span>{t('footer.copyright')}</span>
        </div>
      </footer>

      <BottomNav />
    </main>
  )
}
