'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { claimInvitation, declineInvitation } from '@/lib/loans/actions'

interface Props {
  invitationId: string
}

export function ClaimForm({ invitationId }: Props) {
  const t = useTranslations('teskeid.loans')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  function handleAccept() {
    setError('')
    startTransition(async () => {
      const result = await claimInvitation(invitationId)
      if (result.ok) {
        router.push('/auth-mvp/lanad-og-skilad')
        router.refresh()
      } else {
        const key = result.error
        if (key === 'wrong_email')      setError(t('errors.wrongEmail'))
        else if (key === 'already_claimed') setError(t('errors.alreadyClaimed'))
        else if (key === 'not_claimable')   setError(t('errors.notClaimable'))
        else if (key === 'expired')         setError(t('errors.expiredInvite'))
        else if (key === 'self_claim')      setError(t('errors.selfClaim'))
        else                                setError(t('errors.claimFailed'))
      }
    })
  }

  function handleDecline() {
    setError('')
    startTransition(async () => {
      const result = await declineInvitation(invitationId)
      if (result.ok) {
        router.push('/auth-mvp/lanad-og-skilad')
        router.refresh()
      } else {
        setError(t('errors.saveFailed'))
      }
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleDecline}
          disabled={isPending}
          className="flex-1 h-10 rounded-xl border border-gray-200 text-sm text-[#42493e] hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          {t('declineAcknowledgement')}
        </button>
        <button
          type="button"
          onClick={handleAccept}
          disabled={isPending}
          className="flex-1 h-10 rounded-xl bg-[#154212] text-white text-sm font-medium hover:bg-[#2d5a27] transition-colors disabled:opacity-50"
        >
          {t('acknowledge')}
        </button>
      </div>
    </div>
  )
}
