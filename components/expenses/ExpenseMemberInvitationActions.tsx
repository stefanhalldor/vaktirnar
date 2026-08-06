'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { InvitationDecisionButtons } from '@/components/teskeid/InvitationDecisionButtons'
import { respondExpenseMemberInvitation } from '@/lib/expenses/actions'
import { useExpenseTranslations } from './i18n.client'
import { useExpenseMutationRequestIds } from './request-id'

export function ExpenseMemberInvitationActions({ invitationId }: { invitationId: string }) {
  const t = useExpenseTranslations()
  const router = useRouter()
  const requestIds = useExpenseMutationRequestIds()
  const [error, setError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<'accept' | 'decline' | null>(null)
  const [isPending, startTransition] = useTransition()
  const containerRef = useRef<HTMLDivElement>(null)

  function respond(action: 'accept' | 'decline') {
    const payload = { invitation_id: invitationId, action }
    setError(null)
    setPendingAction(action)
    startTransition(async () => {
      const result = await respondExpenseMemberInvitation({
        ...payload,
        request_id: requestIds.forPayload(payload),
      })
      if (!result.ok) {
        setError(t(`errors.${result.error}`))
        setPendingAction(null)
        queueMicrotask(() => containerRef.current?.querySelector<HTMLElement>('[role="alert"]')?.focus())
        return
      }
      requestIds.succeeded(payload)
      router.push('/auth-mvp/heim')
      router.refresh()
    })
  }

  return (
    <div ref={containerRef}>
      <InvitationDecisionButtons
        acceptLabel={pendingAction === 'accept' ? t('memberInvitation.accepting') : t('memberInvitation.accept')}
        declineLabel={pendingAction === 'decline' ? t('memberInvitation.declining') : t('memberInvitation.decline')}
        isPending={isPending}
        error={error}
        onAccept={() => respond('accept')}
        onDecline={() => respond('decline')}
      />
    </div>
  )
}
