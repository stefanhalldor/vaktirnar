import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { guardLoanAccess } from '@/lib/loans/guard'
import { getAdmin } from '@/lib/supabase/admin'
import { ClaimForm } from '@/components/loans/ClaimForm'
import type { ClaimInvitationDetails } from '@/lib/loans/types'

export default async function ClaimPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { user } = await guardLoanAccess()
  const t = await getTranslations('teskeid.loans')

  const admin = getAdmin()
  const { data, error } = await admin.rpc('get_invitation_for_claim', {
    p_actor_id:      user.id,
    p_invitation_id: id,
  })

  if (error) {
    console.error('[loans/claim] get_invitation_for_claim error:', error.code)
    return (
      <div className="min-h-screen bg-[#fbf9f4] flex items-center justify-center px-4">
        <p className="text-sm text-red-600">{t('errors.loadFailed')}</p>
      </div>
    )
  }

  const invitation = (data as ClaimInvitationDetails[])[0] ?? null
  if (!invitation) notFound()

  // Already handled — redirect to list; show status message
  const alreadyHandled =
    invitation.status === 'accepted' ||
    invitation.status === 'declined' ||
    invitation.status === 'cancelled'

  const isExpired = invitation.status === 'expired' || invitation.expires_at < new Date().toISOString()

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
        <h2 className="text-xl font-semibold text-[#154212] mb-2">{t('claimTitle')}</h2>

        {/* Loan summary */}
        <div className="bg-white border border-black/5 rounded-2xl p-4 mb-6 flex flex-col gap-2">
          <p className="font-medium text-sm text-[#1b1c19]">{invitation.item_name}</p>
          <p className="text-xs text-[#72796e]">
            {invitation.recipient_role === 'lender' ? t('directionLent') : t('directionBorrowed')}
          </p>
          {invitation.creator_display_name && (
            <p className="text-xs text-[#72796e]">
              {t('invitedBy')}: {invitation.creator_display_name}
            </p>
          )}
          <p className="text-xs text-[#72796e]">
            {t('loanedAt')}: {invitation.loaned_at}
          </p>
        </div>

        {alreadyHandled ? (
          <p className="text-sm text-[#72796e] text-center py-4">
            {t(`inviteStatus.${invitation.status}`)}
          </p>
        ) : isExpired ? (
          <p className="text-sm text-amber-600 text-center py-4">
            {t('errors.expiredInvite')}
          </p>
        ) : (
          <ClaimForm invitationId={id} />
        )}
      </main>
    </div>
  )
}
