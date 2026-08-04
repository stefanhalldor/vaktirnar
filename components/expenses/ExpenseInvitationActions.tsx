'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { respondExpenseGroupInvitation } from '@/lib/expenses/actions'
import type { ExpenseInvitationView } from '@/lib/expenses/contracts'
import { useExpenseTranslations } from './i18n.client'
import { useExpenseMutationRequestIds } from './request-id'
import { expenseDangerButtonClass, expensePrimaryButtonClass } from './ui'

export function ExpenseInvitationActions({ invitation }: { invitation: ExpenseInvitationView }) {
  const t = useExpenseTranslations()
  const router = useRouter()
  const requestIds = useExpenseMutationRequestIds()
  const [pendingAction, setPendingAction] = useState<'accept' | 'decline' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function respond(action: 'accept' | 'decline') {
    setPendingAction(action)
    setError(null)
    const payload = { group_id: invitation.groupId, action }
    startTransition(async () => {
      const result = await respondExpenseGroupInvitation({
        ...payload,
        request_id: requestIds.forPayload(payload),
      })
      if (!result.ok) {
        setError(t(`errors.${result.error}`))
        setPendingAction(null)
        return
      }
      requestIds.succeeded(payload)
      if (action === 'accept') router.push(`/auth-mvp/utlagt-og-endurgreitt/hopar/${invitation.groupId}`)
      else router.push('/auth-mvp/utlagt-og-endurgreitt')
      router.refresh()
    })
  }

  return (
    <div>
      {error ? <p role="alert" className="mb-3 text-sm text-destructive">{error}</p> : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <button type="button" className={expensePrimaryButtonClass} disabled={isPending} onClick={() => respond('accept')}>
          {isPending && pendingAction === 'accept' ? t('invitation.accepting') : t('invitation.accept')}
        </button>
        <button type="button" className={expenseDangerButtonClass} disabled={isPending} onClick={() => respond('decline')}>
          {isPending && pendingAction === 'decline' ? t('invitation.declining') : t('invitation.decline')}
        </button>
      </div>
    </div>
  )
}
