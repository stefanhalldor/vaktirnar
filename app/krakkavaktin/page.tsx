import { getTranslations, getLocale } from 'next-intl/server'
import Link from 'next/link'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { Footer } from '@/components/Footer'
import { Badge } from '@/components/Badge'
import { KrakkavaktinSections } from '@/components/KrakkavaktinSections'
import { WaitlistForm } from '@/components/WaitlistForm'
import { ArrowLeft } from 'lucide-react'

export default async function KrakkavaktinPage() {
  const t = await getTranslations('krakkavaktin')
  const ft = await getTranslations('footer')
  const locale = await getLocale()

  return (
    <main className="min-h-screen bg-[#FAFAFA]">
      {/* Nav */}
      <nav className="flex justify-between items-center px-6 py-5 max-w-3xl mx-auto">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft size={14} />
          {t('back')}
        </Link>
        <LanguageSwitcher />
      </nav>

      {/* Hero */}
      <section className="max-w-3xl mx-auto px-6 pt-8 pb-12">
        <div className="mb-5">
          <Badge variant="warning" pulse>{t('status')}</Badge>
        </div>
        <h1 className="text-3xl font-medium text-gray-900 max-w-lg leading-snug mb-4">
          Krakkavaktin er spjall um eitt: getur barnið þitt leikið?
        </h1>
        <p className="text-sm text-gray-500 leading-relaxed max-w-md">
          Engar tilkynningar um allt mögulegt, engin 'séð' merki, engin yfirlit. Bara já, nei, hvenær og hvar.
        </p>
      </section>

      {/* Allar skúffur */}
      <section className="max-w-3xl mx-auto px-6 pb-16">
        <KrakkavaktinSections
          labels={{
            chat: 'Spjall',
            guardian: 'Forsjáraðili',
            childTeam: 'Barnateymi',
            featureChat: t('features.chat'),
            featureChatDesc: t('features.chat_desc'),
            featureChild: t('features.child'),
            featureChildDesc: t('features.child_desc'),
            featureDisappear: t('features.disappear'),
            featureDisappearDesc: t('features.disappear_desc'),
            featureCalm: t('features.calm'),
            featureCalmDesc: t('features.calm_desc'),
          }}
        />
      </section>

      {/* Messenger samanburður */}
      <section className="max-w-3xl mx-auto px-6 pb-16">
        <p className="text-gray-500 leading-relaxed text-sm max-w-xl border-l-2 border-gray-200 pl-4 italic">
          {t('messengerQuote')}
        </p>
      </section>

      {/* Waitlist */}
      <section className="max-w-3xl mx-auto px-6 pb-24">
        <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center">
          <h2 className="text-xl font-medium text-gray-900 mb-2">{t('waitlistTitle')}</h2>
          <p className="text-sm text-gray-500 mb-6 max-w-sm mx-auto">{t('waitlistDesc')}</p>
          <div className="max-w-sm mx-auto">
            <WaitlistForm
              product="krakkavaktin"
              locale={locale}
              placeholder={t('waitlistPlaceholder')}
              buttonLabel={t('waitlistButton')}
              successMessage={t('waitlistSuccess')}
            />
          </div>
        </div>
      </section>

      <Footer tagline={ft('tagline')} copyright={ft('copyright')} />
    </main>
  )
}
