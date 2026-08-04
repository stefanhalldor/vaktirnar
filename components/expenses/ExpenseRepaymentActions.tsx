'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { transitionExpenseRepayment } from '@/lib/expenses/actions'
import type { ExpenseRepaymentView } from '@/lib/expenses/contracts'
import { useExpenseTranslations } from './i18n.client'
import { useExpenseMutationRequestIds } from './request-id'
import {
  expenseDangerButtonClass,
  expensePrimaryButtonClass,
  expenseSecondaryButtonClass,
} from './ui'

type RepaymentAction = 'confirm' | 'reject' | 'cancel'

export function ExpenseRepaymentActions({ repayment }: { repayment: ExpenseRepaymentView }) {
  const t = useExpenseTranslations()
  const router = useRouter()
  const requestIds = useExpenseMutationRequestIds()
  const alertRef = useRef<HTMLParagraphElement>(null)
  const [pendingAction, setPendingAction] = useState<RepaymentAction | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function transition(action: RepaymentAction) {
    if (!window.confirm(t(`repayment.${action}Confirm`))) return
    setPendingAction(action)
    setError(null)
    const payload = { repayment_id: repayment.id, action }
    startTransition(async () => {
      const result = await transitionExpenseRepayment({
        ...payload,
        request_id: requestIds.forPayload(payload),
      })
      if (!result.ok) {
        setError(t(`errors.${result.error}`))
        setPendingAction(null)
        queueMicrotask(() => alertRef.current?.focus())
        return
      }
      requestIds.succeeded(payload)
      router.refresh()
    })
  }

  if (!repayment.canConfirm && !repayment.canReject && !repayment.canCancel) return null
  return (
    <section className="space-y-3 border-t border-border pt-5">
      {error ? (
        <p ref={alertRef} tabIndex={-1} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2">
        {repayment.canConfirm ? (
          <button type="button" className={expensePrimaryButtonClass} disabled={isPending} onClick={() => transition('confirm')}>
            {isPending && pendingAction === 'confirm' ? t('repayment.confirming') : t('repayment.confirm')}
          </button>
        ) : null}
        {repayment.canReject ? (
          <button type="button" className={expenseDangerButtonClass} disabled={isPending} onClick={() => transition('reject')}>
            {isPending && pendingAction === 'reject' ? t('repayment.rejecting') : t('repayment.reject')}
          </button>
        ) : null}
        {repayment.canCancel ? (
          <button type="button" className={`${expenseSecondaryButtonClass} sm:col-span-2`} disabled={isPending} onClick={() => transition('cancel')}>
            {isPending && pendingAction === 'cancel' ? t('repayment.cancelling') : t('repayment.cancel')}
          </button>
        ) : null}
      </div>
    </section>
  )
}
