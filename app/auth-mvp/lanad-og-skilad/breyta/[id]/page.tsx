import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { guardLoanAccess } from '@/lib/loans/guard'
import { getAdmin } from '@/lib/supabase/admin'
import { updateLoan, updateLoanItemDetails } from '@/lib/loans/actions'
import { LoanForm } from '@/components/loans/LoanForm'
import { LoanItemDetailsForm } from '@/components/loans/LoanItemDetailsForm'
import { LoanShell } from '@/components/loans/LoanShell'
import { getLoanCardControls } from '@/lib/loans/types'
import type { LoanItem } from '@/lib/loans/types'

export default async function EditLoanPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { user } = await guardLoanAccess()
  const t = await getTranslations('teskeid.loans')

  const nav = (
    <Link
      href="/auth-mvp/lanad-og-skilad"
      className="inline-flex items-center min-h-[44px] text-sm text-[#72796e] hover:text-[#154212] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded self-start"
    >
      {t('backToList')}
    </Link>
  )

  const admin = getAdmin()
  const { data, error } = await admin.rpc('get_my_loans', { p_actor_id: user.id })

  if (error) {
    console.error('[loans/breyta] get_my_loans failed')
    return (
      <LoanShell nav={nav} homeLabel={t('homeLink')}>
        <p className="text-sm text-red-600 py-8 text-center">{t('errors.loadFailed')}</p>
      </LoanShell>
    )
  }

  const item = (data as LoanItem[]).find((i) => i.id === id)

  if (!item) notFound()

  const { canEdit, canEditItemDetails } = getLoanCardControls(item)

  if (!canEditItemDetails) notFound()

  if (canEdit) {
    const boundAction = updateLoan.bind(null, id)
    return (
      <LoanShell nav={nav} homeLabel={t('homeLink')}>
        <div>
          <h2 className="text-xl font-semibold text-[#154212] mb-6">{t('editTitle')}</h2>
          <LoanForm action={boundAction} initial={item} />
        </div>
      </LoanShell>
    )
  }

  const boundAction = updateLoanItemDetails.bind(null, id)
  return (
    <LoanShell nav={nav} homeLabel={t('homeLink')}>
      <div>
        <h2 className="text-xl font-semibold text-[#154212] mb-6">{t('editTitle')}</h2>
        <LoanItemDetailsForm action={boundAction} initial={item} />
      </div>
    </LoanShell>
  )
}
