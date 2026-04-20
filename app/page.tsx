import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { Footer } from '@/components/Footer'
import { Badge } from '@/components/Badge'
import { Avatar } from '@/components/Avatar'
import { ArrowRight, Lock } from 'lucide-react'
// ArrowRight used in Krakkavaktin card only

export default async function Home() {
  const t = await getTranslations()

  return (
    <main className="min-h-screen bg-[#FAFAFA]">
      {/* Nav */}
      <nav className="flex justify-between items-center px-6 py-5 max-w-4xl mx-auto">
        <span className="text-xs font-semibold tracking-widest text-gray-400 uppercase">
          Vaktirnar
        </span>
        <LanguageSwitcher />
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-12 pb-10">
        <h1 className="text-3xl font-medium text-gray-900 max-w-lg leading-snug">
          {t('hero.title')}
        </h1>
      </section>

      {/* Vörurnar */}
      <section className="max-w-4xl mx-auto px-6 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Krakkavaktin */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6 hover:border-gray-300 transition-colors">
            <div className="mb-4">
              <Badge variant="warning" pulse>{t('vaktir.inDevelopment')}</Badge>
            </div>
            <h3 className="text-base font-semibold text-gray-900 mb-1">
              {t('vaktir.krakkavaktin.name')}
            </h3>
            <p className="text-sm text-gray-500 leading-relaxed mb-5">
              {t('vaktir.krakkavaktin.description')}
            </p>
            <Link
              href="/krakkavaktin"
              className="inline-flex items-center gap-1 text-sm font-medium text-violet-600 hover:text-violet-800 transition-colors group"
            >
              {t('vaktir.krakkavaktin.cta')}
              <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>

          {/* Þriðja vaktin */}
          <div className="bg-white border border-gray-100 rounded-2xl p-6 opacity-60">
            <div className="mb-4">
              <Badge variant="gray">
                <Lock size={10} />
                {t('vaktir.inDesign')}
              </Badge>
            </div>
            <h3 className="text-base font-semibold text-gray-500 mb-1">
              {t('vaktir.thridjavaktin.name')}
            </h3>
            <p className="text-sm text-gray-400 leading-relaxed">
              {t('vaktir.thridjavaktin.description')}
            </p>
          </div>

          {/* Sjoppuvaktin */}
          <div className="bg-white border border-gray-100 rounded-2xl p-6 opacity-60">
            <div className="mb-4">
              <Badge variant="gray">
                <Lock size={10} />
                {t('vaktir.inDesign')}
              </Badge>
            </div>
            <h3 className="text-base font-semibold text-gray-500 mb-1">
              {t('vaktir.sjoppuvaktin.name')}
            </h3>
            <p className="text-sm text-gray-400 leading-relaxed">
              {t('vaktir.sjoppuvaktin.description')}
            </p>
          </div>

        </div>
      </section>

      {/* Um okkur */}
      <section className="max-w-4xl mx-auto px-6 pb-24 border-t border-gray-100 pt-10">
        <div className="flex items-center gap-4">
          <Avatar initial="S" color="violet" size="md" />
          <div>
            <p className="text-sm font-medium text-gray-900">{t('about.name')}</p>
            <a
              href="https://www.lauflett.is"
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
