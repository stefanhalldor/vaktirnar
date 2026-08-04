'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { InvitationDecisionButtons } from '@/components/teskeid/InvitationDecisionButtons'
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
    <InvitationDecisionButtons
      acceptLabel={t('acknowledge')}
      declineLabel={t('declineAcknowledgement')}
      isPending={isPending}
      error={error}
      onAccept={handleAccept}
      onDecline={handleDecline}
    />
  )
}
