'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cancelExpense } from '@/lib/expenses/actions'
import type { ExpenseDeleteCapabilityView } from '@/lib/expenses/contracts'
import { expenseEditStepHref } from '@/lib/expenses/flow'
import { ExpenseDeleteControl } from './ExpenseDeleteControl'
import { useExpenseTranslations } from './i18n.client'
import { useExpenseMutationRequestIds } from './request-id'
import { expenseDangerButtonClass, expenseSecondaryButtonClass } from './ui'

export function ExpenseItemActions({
  expenseId,
  canEdit,
  canCancel,
  deleteCapability = { status: 'hidden' },
  deleteCreatorKnown = false,
  deleteSuccessHref = '/auth-mvp/utlagt-og-endurgreitt',
}: {
  expenseId: string
  canEdit: boolean
  canCancel: boolean
  deleteCapability?: ExpenseDeleteCapabilityView
  deleteCreatorKnown?: boolean
  deleteSuccessHref?: string
}) {
  const t = useExpenseTranslations()
  const router = useRouter()
  const requestIds = useExpenseMutationRequestIds()
  const alertRef = useRef<HTMLParagraphElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [deletePending, setDeletePending] = useState(false)
  const [pendingKind, setPendingKind] = useState<'edit' | 'cancel' | null>(null)
  const [isPending, startTransition] = useTransition()
  const controlsPending = isPending || deletePending

  useEffect(() => {
    if (error) alertRef.current?.focus()
  }, [error])

  function cancel() {
    if (!window.confirm(t('expense.cancelConfirm'))) return
    setError(null)
    setPendingKind('cancel')
    const payload = { expense_id: expenseId }
    startTransition(async () => {
      const result = await cancelExpense({
        ...payload,
        request_id: requestIds.forPayload(payload),
      })
      if (!result.ok) {
        setError(t(`errors.${result.error}`))
        return
      }
      requestIds.succeeded(payload)
      router.refresh()
    })
  }

  function edit() {
    setPendingKind('edit')
    startTransition(() => {
      router.push(expenseEditStepHref(expenseId, 'details'))
    })
  }

  return (
    <div className="space-y-3 border-t border-border pt-5">
      {error ? (
        <p ref={alertRef} tabIndex={-1} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {canEdit ? (
        <button
          type="button"
          className={`${expenseSecondaryButtonClass} w-full`}
          disabled={controlsPending}
          onClick={edit}
        >
          {isPending && pendingKind === 'edit' ? t('expense.openingEdit') : t('expense.edit')}
        </button>
      ) : null}
      {canCancel ? (
        <button
          type="button"
          className={`${expenseDangerButtonClass} w-full`}
          disabled={controlsPending}
          onClick={cancel}
        >
          {isPending && pendingKind === 'cancel' ? t('expense.cancelling') : t('expense.cancel')}
        </button>
      ) : null}
      <ExpenseDeleteControl
        target={{ kind: 'confirmed_expense', expenseId, capability: deleteCapability }}
        creatorKnown={deleteCreatorKnown}
        successHref={deleteSuccessHref}
        statusHref={deleteSuccessHref}
        disabled={controlsPending && !deletePending}
        onBusyChange={setDeletePending}
      />
    </div>
  )
}
