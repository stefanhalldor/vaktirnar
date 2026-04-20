import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { Footer } from '@/components/Footer'
import { MessageCircle, Calendar, Bell, Users } from 'lucide-react'

const featureIcons = {
  chat: MessageCircle,
  calendar: Calendar,
  push: Bell,
  custody: Users,
}

export default async function KrakkavaktinPage() {
  const t = await getTranslations('krakkavaktin')
  const ft = await getTranslations('footer')

  const features = [
    { key: 'chat', icon: featureIcons.chat },
    { key: 'calendar', icon: featureIcons.calendar },
    { key: 'push', icon: featureIcons.push },
    { key: 'custody', icon: featureIcons.custody },
  ] as const

  return (
    <main className="min-h-screen">
      {/* Nav */}
      <nav className="flex justify-between items-center px-6 py-4 max-w-5xl mx-auto">
        <Link
          href="/"
          className="text-sm text-gray-500 hover:text-violet-700 transition-colors"
        >
          {t('back')}
        </Link>
        <LanguageSwitcher />
      </nav>

      {/* Hero */}
      <section className="max-w-3xl mx-auto px-4 py-16 text-center">
        <div className="inline-flex items-center gap-2 bg-violet-100 text-violet-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
          <span className="w-2 h-2 bg-violet-500 rounded-full animate-pulse" />
          Tilbúin
        </div>
        <h1 className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-violet-600 to-rose-500 bg-clip-text text-transparent mb-4">
          {t('title')}
        </h1>
        <p className="text-xl font-semibold text-gray-600 mb-6">{t('subtitle')}</p>
        <p className="text-gray-500 leading-relaxed max-w-xl mx-auto">
          {t('description')}
        </p>
      </section>

      {/* Features */}
      <section className="max-w-3xl mx-auto px-4 pb-16">
        <h2 className="text-xl font-bold text-gray-700 mb-6 text-center">
          {t('featuresTitle')}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {features.map(({ key, icon: Icon }) => (
            <div
              key={key}
              className="flex items-start gap-3 bg-white rounded-2xl p-5 shadow-sm border border-violet-50"
            >
              <div className="flex-shrink-0 w-9 h-9 bg-violet-100 rounded-xl flex items-center justify-center">
                <Icon size={18} className="text-violet-600" />
              </div>
              <p className="text-sm text-gray-600 leading-relaxed">
                {t(`features.${key}`)}
              </p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-12 text-center">
          <a
            href="https://krakkavaktin.is"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-violet-600 to-rose-500 text-white font-semibold px-8 py-3.5 rounded-2xl shadow-md hover:shadow-lg hover:opacity-90 transition-all"
          >
            {t('cta')}
          </a>
        </div>
      </section>

      <Footer tagline={ft('tagline')} copyright={ft('copyright')} />
    </main>
  )
}
