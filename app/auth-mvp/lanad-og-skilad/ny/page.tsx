import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { createLoan } from '@/lib/loans/actions'
import { LoanForm } from '@/components/loans/LoanForm'

export default async function NewLoanPage() {
  const t = await getTranslations('teskeid.loans')

  return (
    <div className="min-h-screen bg-[#fbf9f4]">
      <header className="flex items-center px-5 h-14 border-b border-black/5 bg-[#fbf9f4]">
        <Link
          href="/auth-mvp/lanad-og-skilad"
          className="text-sm text-[#72796e] hover:text-[#154212] transition-colors"
        >
          {t('backToList')}
        </Link>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6">
        <h2 className="text-xl font-semibold text-[#154212] mb-6">{t('newTitle')}</h2>
        <LoanForm action={createLoan} />
      </main>
    </div>
  )
}
