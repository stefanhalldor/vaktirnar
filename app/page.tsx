import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { NavBar } from '@/components/teskeid/NavBar'
import { PublicTopNav } from '@/components/teskeid/PublicTopNav'
import { HeroSection } from '@/components/teskeid/HeroSection'
import { PersonalizedIdeaGrid } from '@/components/teskeid/PersonalizedIdeaGrid'
import { PageViewTracker } from '@/components/teskeid/PageViewTracker'
import { ReadyTeskeidCard } from '@/components/teskeid/ReadyTeskeidCard'

export default async function Home() {
  const t = await getTranslations('teskeid')

  const supabase = await createClient()
  const [{ data: { user } }, { data: ideas }] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from('ideas')
      .select('*')
      .eq('is_public', true)
      .order('is_featured', { ascending: false })
      .order('votes_count', { ascending: false }),
  ])

  const allIdeas = ideas ?? []
  const launchedIdeas = allIdeas.filter((idea) => idea.status === 'launched')
  const futureIdeas = allIdeas.filter((idea) => idea.status !== 'launched')

  return (
    <main className="min-h-screen bg-[#fbf9f4]">
      <PageViewTracker />
      {!user && <PublicTopNav />}
      <NavBar variant={user ? 'authenticated' : 'public'} />
      <HeroSection
        supportingLine={t('hero.supportingLine')}
        expandLabel={t('hero.expandLabel')}
        collapseLabel={t('hero.collapseLabel')}
        expandedDescription={t('hero.expandedDescription')}
      />

      {!user && launchedIdeas.length > 0 && (
        <section className="max-w-[768px] mx-auto px-5 pb-6">
          <h2 className="text-sm font-medium text-muted-foreground mb-3">{t('home.readyTeskeidarTitle')}</h2>
          <div className="flex flex-col gap-3">
            {launchedIdeas.map((idea) => (
              <ReadyTeskeidCard
                key={idea.slug}
                idea={idea}
                href="/innskraning"
                openLabel={t('home.readyTeskeidOpen')}
              />
            ))}
          </div>
        </section>
      )}

      <section className="max-w-[768px] mx-auto px-5 pb-8">
        <div className="text-base font-medium text-[#42493e] text-center max-w-[600px] mx-auto mb-6 leading-[26px] space-y-1">
          <p>{t('hero.ideasIntro')}</p>
          <p>{t('hero.ideasIntroAction')}</p>
        </div>
        <PersonalizedIdeaGrid ideas={futureIdeas} />
      </section>

      <footer className="max-w-[768px] mx-auto px-5 py-8 border-t border-black/5 mt-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-2 text-sm text-[#72796e]">
          <span>{t('footer.tagline')}</span>
          <span>{t('footer.copyright')}</span>
        </div>
      </footer>

    </main>
  )
}
