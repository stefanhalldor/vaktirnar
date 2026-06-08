import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { Home } from 'lucide-react'
import { guardLoanAccess } from '@/lib/loans/guard'
import { getAdmin } from '@/lib/supabase/admin'
import { LoanList } from '@/components/loans/LoanList'
import { PendingInvitationCard } from '@/components/loans/PendingInvitationCard'
import { LoanShell } from '@/components/loans/LoanShell'
import type { LoanItem, PendingInvitation } from '@/lib/loans/types'

export default async function LoanPage() {
  const { user } = await guardLoanAccess()
  const t = await getTranslations('teskeid.loans')
  const admin = getAdmin()

  const [loansResult, invitationsResult] = await Promise.all([
    admin.rpc('get_my_loans', { p_actor_id: user.id }),
    admin.rpc('get_my_pending_invitations', { p_actor_id: user.id }),
  ])

  if (loansResult.error) {
    console.error('[loans/page] get_my_loans failed')
  }
  if (invitationsResult.error) {
    console.error('[loans/page] get_my_pending_invitations failed')
  }

  const items = (loansResult.data ?? []) as LoanItem[]
  const pendingInvitations = (invitationsResult.data ?? []) as PendingInvitation[]

  const nav = (
    <div className="flex items-center justify-between gap-3">
      <h1 className="text-base font-semibold text-[#154212]">{t('title')}</h1>
      <Link
        href="/auth-mvp/heim"
        className="flex items-center justify-center w-11 h-11 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        aria-label={t('homeLink')}
      >
        <Home size={20} aria-hidden />
      </Link>
    </div>
  )

  return (
    <LoanShell nav={nav} homeLabel={t('homeLink')}>
      {loansResult.error || invitationsResult.error ? (
        <p className="text-sm text-red-600 py-8 text-center">{t('errors.loadFailed')}</p>
      ) : (
        <>
          {pendingInvitations.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-medium text-[#42493e]">{t('pendingInvitations')}</h2>
              {pendingInvitations.map((inv) => (
                <PendingInvitationCard key={inv.invitation_id} invitation={inv} />
              ))}
            </section>
          )}
          <LoanList items={items} />
        </>
      )}
    </LoanShell>
  )
}
