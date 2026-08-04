'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { leaveExpenseGroup, setExpenseGroupStatus } from '@/lib/expenses/actions'
import type { ExpenseGroupView } from '@/lib/expenses/contracts'
import { useExpenseTranslations } from './i18n.client'
import { useExpenseMutationRequestIds } from './request-id'
import { expenseDangerButtonClass, expenseSecondaryButtonClass } from './ui'

export function ExpenseGroupActions({ group }: { group: ExpenseGroupView }) {
  const t = useExpenseTranslations()
  const router = useRouter()
  const requestIds = useExpenseMutationRequestIds()
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function setStatus(status: 'settling' | 'settled') {
    const confirmationKey = status === 'settling' ? 'group.startSettlementConfirm' : 'group.markSettledConfirm'
    if (!window.confirm(t(confirmationKey))) return
    setError(null)
    const payload = { group_id: group.id, status }
    startTransition(async () => {
      const result = await setExpenseGroupStatus({ ...payload, request_id: requestIds.forPayload(payload) })
      if (!result.ok) { setError(t(`errors.${result.error}`)); return }
      requestIds.succeeded(payload)
      router.refresh()
    })
  }

  function leave() {
    if (!window.confirm(t('group.leaveConfirm'))) return
    setError(null)
    const payload = { group_id: group.id }
    startTransition(async () => {
      const result = await leaveExpenseGroup({ ...payload, request_id: requestIds.forPayload(payload) })
      if (!result.ok) { setError(t(`errors.${result.error}`)); return }
      requestIds.succeeded(payload)
      router.push('/auth-mvp/utlagt-og-endurgreitt')
      router.refresh()
    })
  }

  if (!group.canManage && !group.canLeave) return null
  return (
    <section className="space-y-2 border-t border-border pt-5">
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {group.canManage && group.status === 'active' ? <button type="button" className={`${expenseSecondaryButtonClass} w-full`} disabled={isPending} onClick={() => setStatus('settling')}>{isPending ? t('group.changingStatus') : t('group.startSettlement')}</button> : null}
      {group.canManage && group.status === 'settling' ? <button type="button" className={`${expenseSecondaryButtonClass} w-full`} disabled={isPending} onClick={() => setStatus('settled')}>{isPending ? t('group.changingStatus') : t('group.markSettled')}</button> : null}
      {group.canLeave ? <button type="button" className={`${expenseDangerButtonClass} w-full`} disabled={isPending} onClick={leave}>{isPending ? t('group.leaving') : t('group.leave')}</button> : null}
    </section>
  )
}
