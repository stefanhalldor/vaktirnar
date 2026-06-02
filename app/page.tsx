import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { NavBar } from '@/components/teskeid/NavBar'
import { HeroSection } from '@/components/teskeid/HeroSection'
import { IdeaGrid } from '@/components/teskeid/IdeaGrid'
import { Footer } from '@/components/landing/Footer'
import { FloatingSubmitButton } from '@/components/teskeid/FloatingSubmitButton'
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
    <main className="min-h-screen bg-[#FAFAFA]">
      <PageViewTracker />
      <NavBar />
      <HeroSection
        tagline={t('hero.tagline')}
        description={t('hero.description')}
        supportingLine={t('hero.supportingLine')}
      />

      <section className="max-w-4xl mx-auto px-6 pb-20">
        <p className="text-sm text-gray-500 leading-relaxed mb-6">{t('hero.ideasIntro')}</p>
        <IdeaGrid ideas={ideas ?? []} />
      </section>

      <Footer tagline={t('footer.tagline')} copyright={t('footer.copyright')} />
      <FloatingSubmitButton label={t('nav.submitIdea')} />
    </main>
  )
}
