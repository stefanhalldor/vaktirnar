import { getTranslations } from 'next-intl/server'
import { Hero } from '@/components/Hero'
import { VaktCard } from '@/components/VaktCard'
import { Footer } from '@/components/Footer'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'

export default async function Home() {
  const t = await getTranslations()

  return (
    <main className="min-h-screen">
      {/* Nav */}
      <nav className="flex justify-end px-6 py-4 max-w-5xl mx-auto">
        <LanguageSwitcher />
      </nav>

      {/* Hero */}
      <Hero
        title={t('hero.title')}
        tagline={t('hero.tagline')}
        description={t('hero.description')}
      />

      {/* Vaktir section */}
      <section className="max-w-5xl mx-auto px-4 pb-16">
        <h2 className="text-2xl font-bold text-gray-700 mb-8 text-center">
          {t('vaktir.title')}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <VaktCard
            name={t('vaktir.krakkavaktin.name')}
            description={t('vaktir.krakkavaktin.description')}
            status="available"
            href="/krakkavaktin"
            cta={t('vaktir.krakkavaktin.cta')}
            index={0}
          />
          <VaktCard
            name={t('vaktir.thridjavaktin.name')}
            description={t('vaktir.thridjavaktin.description')}
            status="coming-soon"
            index={1}
          />
          <VaktCard
            name={t('vaktir.sjoppuvaktin.name')}
            description={t('vaktir.sjoppuvaktin.description')}
            status="coming-soon"
            index={2}
          />
        </div>
      </section>

      <Footer tagline={t('footer.tagline')} copyright={t('footer.copyright')} />
    </main>
  )
}
