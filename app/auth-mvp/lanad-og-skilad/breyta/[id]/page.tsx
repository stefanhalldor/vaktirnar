import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { guardLoanAccess } from '@/lib/loans/guard'
import { getAdmin } from '@/lib/supabase/admin'
import { updateLoan, updateLoanItemDetails } from '@/lib/loans/actions'
import { LoanForm } from '@/components/loans/LoanForm'
import { LoanItemDetailsForm } from '@/components/loans/LoanItemDetailsForm'
import { LoanShell } from '@/components/loans/LoanShell'
import { SwitchRoleButton } from '@/components/loans/SwitchRoleButton'
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
      href={`/auth-mvp/lanad-og-skilad/${id}`}
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

  let activeItem: LoanItem
  let isPendingRecipient = false

  if (item) {
    activeItem = item
  } else {
    // Pending recipient fallback: actor has a pending invitation but is not yet
    // an actual party. They can switch their role but cannot edit item details.
    const { data: pendingData, error: pendingError } = await admin.rpc(
      'get_loan_for_pending_recipient',
      { p_actor_id: user.id, p_loan_id: id },
    )
    if (pendingError) {
      console.error('[loans/breyta] get_loan_for_pending_recipient failed')
      notFound()
    }
    const pendingItem = (pendingData as LoanItem[] | null)?.[0] ?? null
    if (!pendingItem) notFound()
    activeItem = pendingItem
    isPendingRecipient = true
  }

  const { canEdit, canEditItemDetails, showAddParty } = getLoanCardControls(activeItem)

  // Actual parties must have canEditItemDetails to reach this page.
  // Pending recipients bypass this check — they can only switch role.
  if (!isPendingRecipient && !canEditItemDetails) notFound()

  const switchRoleButton = (
    <SwitchRoleButton
      loanId={id}
      currentRole={activeItem.my_role as 'lender' | 'borrower'}
      hasPendingInvitation={activeItem.invitation_status === 'pending'}
      labels={{
        switchToLender:   t('switchRole.switchToLender'),
        switchToBorrower: t('switchRole.switchToBorrower'),
        pendingWarning:   t('switchRole.pendingWarning'),
        error:            t('switchRole.error'),
      }}
    />
  )

  // Pending recipients can only switch their role — no item editing.
  if (isPendingRecipient) {
    return (
      <LoanShell nav={nav} homeLabel={t('homeLink')}>
        <div>
          <h2 className="text-xl font-semibold text-[#154212] mb-6">{t('editTitle')}</h2>
          {switchRoleButton}
        </div>
      </LoanShell>
    )
  }

  const addPartyCta = showAddParty ? (
    <div className="mt-6 pt-6 border-t border-border">
      <Link
        href={`/auth-mvp/lanad-og-skilad/baeta-vid-adila/${id}`}
        className="inline-flex items-center min-h-[44px] text-sm font-medium text-[#154212] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded"
      >
        {t('addParty')}
      </Link>
    </div>
  ) : null

  if (canEdit) {
    const boundAction = updateLoan.bind(null, id)
    return (
      <LoanShell nav={nav} homeLabel={t('homeLink')}>
        <div>
          <h2 className="text-xl font-semibold text-[#154212] mb-6">{t('editTitle')}</h2>
          <div className="mb-5">{switchRoleButton}</div>
          <LoanForm action={boundAction} initial={activeItem} />
          {addPartyCta}
        </div>
      </LoanShell>
    )
  }

  const boundAction = updateLoanItemDetails.bind(null, id)
  return (
    <LoanShell nav={nav} homeLabel={t('homeLink')}>
      <div>
        <h2 className="text-xl font-semibold text-[#154212] mb-6">{t('editTitle')}</h2>
        <div className="mb-5">{switchRoleButton}</div>
        <LoanItemDetailsForm action={boundAction} initial={activeItem} />
        {addPartyCta}
      </div>
    </LoanShell>
  )
}
