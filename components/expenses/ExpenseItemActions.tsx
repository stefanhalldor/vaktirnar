'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cancelExpense, deleteOwnUnsettledExpense } from '@/lib/expenses/actions'
import type {
  ExpenseActionErrorCode,
  ExpenseActionResult,
  ExpenseDeleteCapabilityView,
} from '@/lib/expenses/contracts'
import { expenseEditStepHref } from '@/lib/expenses/flow'
import { useExpenseTranslations } from './i18n.client'
import { useExpenseMutationRequestIds } from './request-id'
import { expenseDangerButtonClass, expenseSecondaryButtonClass } from './ui'

export function ExpenseItemActions({
  expenseId,
  canEdit,
  canCancel,
  deleteCapability = { status: 'hidden' },
}: {
  expenseId: string
  canEdit: boolean
  canCancel: boolean
  deleteCapability?: ExpenseDeleteCapabilityView
}) {
  const t = useExpenseTranslations()
  const router = useRouter()
  const requestIds = useExpenseMutationRequestIds()
  const alertRef = useRef<HTMLParagraphElement>(null)
  const deleteTriggerRef = useRef<HTMLButtonElement>(null)
  const deleteConfirmRef = useRef<HTMLButtonElement>(null)
  const deleteInFlightRef = useRef(false)
  const restoreDeleteTriggerFocusRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deletePending, setDeletePending] = useState(false)
  const [pendingKind, setPendingKind] = useState<'edit' | 'cancel' | 'delete' | null>(null)
  const [isPending, startTransition] = useTransition()
  const controlsPending = isPending || deletePending

  useEffect(() => {
    if (confirmingDelete) {
      deleteConfirmRef.current?.focus()
    } else if (restoreDeleteTriggerFocusRef.current) {
      deleteTriggerRef.current?.focus()
      restoreDeleteTriggerFocusRef.current = false
    }
  }, [confirmingDelete])

  useEffect(() => {
    if (error) alertRef.current?.focus()
  }, [error])

  function dismissDeleteConfirmation() {
    if (deleteInFlightRef.current) return
    restoreDeleteTriggerFocusRef.current = true
    setConfirmingDelete(false)
  }

  function presentDeleteError(code: ExpenseActionErrorCode) {
    setConfirmingDelete(false)
    setError(t(`errors.${code}`))
  }

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

  async function deletePermanently() {
    if (deleteCapability.status !== 'available' || deleteInFlightRef.current) return
    deleteInFlightRef.current = true
    setDeletePending(true)
    setError(null)
    setPendingKind('delete')
    const payload = {
      expense_id: expenseId,
      expected_financial_version: deleteCapability.expectedFinancialVersion,
    }
    let keepLockedForNavigation = false
    try {
      let result: ExpenseActionResult
      try {
        result = await deleteOwnUnsettledExpense({
          ...payload,
          request_id: requestIds.forPayload(payload),
        })
      } catch {
        presentDeleteError('delete_outcome_unknown')
        return
      }
      if (!result.ok) {
        presentDeleteError(result.error)
        return
      }
      try {
        router.replace('/auth-mvp/utlagt-og-endurgreitt')
        router.refresh()
        requestIds.succeeded(payload)
        keepLockedForNavigation = true
      } catch {
        presentDeleteError('delete_outcome_unknown')
      }
    } finally {
      if (!keepLockedForNavigation) {
        deleteInFlightRef.current = false
        setDeletePending(false)
      }
    }
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
      {deleteCapability.status === 'available' ? (
        confirmingDelete ? (
          <div
            role="alertdialog"
            aria-modal="false"
            aria-label={t('expense.delete')}
            aria-describedby={`expense-delete-disclosure-${expenseId}`}
            onKeyDown={(event) => {
              if (event.key === 'Escape') dismissDeleteConfirmation()
            }}
            className="space-y-3 rounded-xl border border-destructive/40 p-4"
          >
            <p id={`expense-delete-disclosure-${expenseId}`} className="text-sm leading-6">
              {t('expense.deleteDisclosure')}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                ref={deleteConfirmRef}
                type="button"
                className={`${expenseDangerButtonClass} flex-1`}
                disabled={controlsPending}
                onClick={deletePermanently}
              >
                {deletePending
                  ? t('expense.deleting')
                  : t('expense.confirmDelete')}
              </button>
              <button
                type="button"
                className={`${expenseSecondaryButtonClass} flex-1`}
                disabled={controlsPending}
                onClick={dismissDeleteConfirmation}
              >
                {t('expense.keep')}
              </button>
            </div>
          </div>
        ) : (
          <button
            ref={deleteTriggerRef}
            type="button"
            className={`${expenseDangerButtonClass} w-full`}
            disabled={controlsPending}
            onClick={() => {
              setError(null)
              setConfirmingDelete(true)
            }}
          >
            {t('expense.delete')}
          </button>
        )
      ) : deleteCapability.status === 'blocked' ? (
        <p className="text-sm leading-6 text-muted-foreground">
          {t(`expense.deleteBlocked.${deleteCapability.reason}`)}
        </p>
      ) : null}
    </div>
  )
}
