import { getTranslations } from 'next-intl/server'
import { NavBar } from '@/components/teskeid/NavBar'
import { SubmissionForm } from '@/components/teskeid/SubmissionForm'
import { Footer } from '@/components/landing/Footer'

export default async function SendaHugmyndPage() {
  const t = await getTranslations('teskeid')

  return (
    <main className="min-h-screen bg-[#FAFAFA]">
      <NavBar />

      <div className="max-w-2xl mx-auto px-6 pt-10 pb-20">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">{t('submit.title')}</h1>
        <p className="text-sm text-gray-500 leading-relaxed mb-8">{t('submit.description')}</p>

        <SubmissionForm />
      </div>

      <Footer tagline={t('footer.tagline')} copyright={t('footer.copyright')} />
    </main>
  )
}
