import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { LanguageSwitcher } from '@/components/landing/LanguageSwitcher'
import { Footer } from '@/components/landing/Footer'
import { Badge } from '@/components/landing/Badge'
import { Avatar } from '@/components/landing/Avatar'
import { ArrowRight, ExternalLink } from 'lucide-react'
import { VaktSuggestionForm } from '@/components/landing/VaktSuggestionForm'

export default async function Home() {
  const t = await getTranslations()

  return (
    <main className="min-h-screen bg-[#FAFAFA]">
      {/* Nav */}
      <nav className="flex justify-between items-center px-6 py-5 max-w-4xl mx-auto">
        <span className="text-xs font-semibold tracking-widest text-gray-400 uppercase">
          Lauflétt
        </span>
        <LanguageSwitcher />
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-12 pb-12">
        <h1 className="text-3xl font-medium text-gray-900 max-w-lg leading-snug">
          {t('hero.tagline')}
        </h1>
      </section>

      {/* Vaktir */}
      <section className="max-w-4xl mx-auto px-6 pb-16 flex flex-col gap-4">

        {/* Krakkavaktin */}
        <Link
          href="/krakkavaktin"
          className="block bg-white border border-gray-200 rounded-2xl p-6 hover:border-violet-300 transition-colors group"
        >
          <div className="mb-3">
            <Badge variant="warning" pulse>{t('vaktir.krakkavaktin.badge')}</Badge>
          </div>
          <h2 className="text-base font-semibold text-gray-900 mb-1">
            {t('vaktir.krakkavaktin.name')}
          </h2>
          <p className="text-sm text-gray-500 leading-relaxed mb-4">
            {t('vaktir.krakkavaktin.description')}
          </p>
          <span className="inline-flex items-center gap-1 text-sm font-medium text-violet-600 group-hover:text-violet-800 transition-colors">
            {t('vaktir.krakkavaktin.cta')}
            <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
          </span>
        </Link>

        {/* Þriðja vaktin */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <div className="mb-3">
            <Badge variant="info">{t('vaktir.thridjavaktin.badge')}</Badge>
          </div>
          <h2 className="text-base font-semibold text-gray-900 mb-1">
            {t('vaktir.thridjavaktin.name')}
          </h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            {t('vaktir.thridjavaktin.description')}
          </p>
        </div>

        {/* Fyrsta vakt krakkanna */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <div className="mb-3">
            <Badge variant="info">{t('vaktir.fyrstavaktin.badge')}</Badge>
          </div>
          <h2 className="text-base font-semibold text-gray-900 mb-1">
            {t('vaktir.fyrstavaktin.name')}
          </h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            {t('vaktir.fyrstavaktin.description')}
          </p>
        </div>

        {/* Aðrar vaktir */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <h2 className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-2">
            {t('vaktir.others.heading')}
          </h2>
          <p className="text-sm text-gray-500 leading-relaxed mb-2">
            {t('vaktir.others.list')}
          </p>
          <p className="text-sm text-gray-500 leading-relaxed">
            {t('vaktir.others.umonnun')}{' '}
            <a
              href="https://www.umonnun.is"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-violet-600 hover:text-violet-800 transition-colors"
            >
              www.umonnun.is
              <ExternalLink size={12} />
            </a>
          </p>
        </div>

        {/* Tillögur */}
        <div className="bg-white border border-gray-100 rounded-2xl p-6">
          <h2 className="text-sm font-medium text-gray-900 mb-3">
            {t('vaktir.suggestion.heading')}
          </h2>
          <VaktSuggestionForm
            placeholder={t('vaktir.suggestion.placeholder')}
            emailPlaceholder={t('vaktir.suggestion.emailPlaceholder')}
            buttonLabel={t('vaktir.suggestion.button')}
            successMessage={t('vaktir.suggestion.success')}
          />
        </div>

      </section>

      {/* Á bak við Lauflétt */}
      <section className="max-w-4xl mx-auto px-6 pb-24 border-t border-gray-100 pt-10">
        <div className="flex items-center gap-4">
          <Avatar initial="S" color="violet" size="md" />
          <div>
            <p className="text-sm font-medium text-gray-900">{t('about.name')}</p>
            <a
              href="https://www.gottvibe.is"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-400 hover:text-violet-600 transition-colors"
            >
              {t('about.url')}
            </a>
          </div>
        </div>
      </section>

      <Footer tagline={t('footer.tagline')} copyright={t('footer.copyright')} />
    </main>
  )
}
