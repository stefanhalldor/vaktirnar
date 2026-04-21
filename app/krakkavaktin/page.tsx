import { getTranslations, getLocale } from 'next-intl/server'
import Link from 'next/link'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { Footer } from '@/components/Footer'
import { Badge } from '@/components/Badge'
import { Avatar } from '@/components/Avatar'
import { ChatOnly } from '@/components/ChatOnly'
import { GuardianCard } from '@/components/GuardianCard'
import { ChildTeamCard } from '@/components/ChildTeamCard'
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
      <section className="max-w-3xl mx-auto px-6 pt-8 pb-8">
        <div className="mb-5">
          <Badge variant="warning" pulse>{t('status')}</Badge>
        </div>
        <h1 className="text-3xl font-medium text-gray-900 max-w-lg leading-snug mb-4">
          Krakkavaktin er spjall um eitt: getur barnið þitt leikið?
        </h1>
        <p className="text-sm text-gray-500 leading-relaxed max-w-xl border-l-2 border-gray-200 pl-4 italic">
          {t('messengerQuote')}
        </p>
      </section>

      {/* Spjall */}
      <section className="max-w-3xl mx-auto px-6 pb-8">
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2">
                <Avatar initial="S" color="amber" size="sm" />
                <Avatar initial="J" color="blue" size="sm" />
                <Avatar initial="H" color="green" size="sm" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Siggi, Jóna & Hófí</p>
                <p className="text-xs text-gray-400">4 aðstandendur · hjá Stebba</p>
              </div>
            </div>
            <span className="text-xs font-semibold tracking-widest text-violet-600 uppercase">Krakkavaktin</span>
          </div>
          <div className="px-5 py-5">
            <ChatOnly />
          </div>
        </div>
      </section>

      {/* Barnateymi */}
      <section className="max-w-3xl mx-auto px-6 pb-8">
        <ChildTeamCard />
      </section>

      {/* Aðstandandi */}
      <section className="max-w-3xl mx-auto px-6 pb-16">
        <GuardianCard />
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
