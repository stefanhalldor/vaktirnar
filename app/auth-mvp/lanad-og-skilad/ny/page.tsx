import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { createLoan } from '@/lib/loans/actions'
import { LoanForm } from '@/components/loans/LoanForm'
import { LoanShell } from '@/components/loans/LoanShell'

export default async function NewLoanPage() {
  const t = await getTranslations('teskeid.loans')

  const nav = (
    <Link
      href="/auth-mvp/lanad-og-skilad"
      className="inline-flex items-center min-h-[44px] text-sm text-[#72796e] hover:text-[#154212] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded self-start"
    >
      {t('backToList')}
    </Link>
  )

  return (
    <LoanShell nav={nav} homeLabel={t('homeLink')}>
      <div>
        <h2 className="text-xl font-semibold text-[#154212] mb-6">{t('newTitle')}</h2>
        <LoanForm action={createLoan} />
      </div>
    </LoanShell>
  )
}
