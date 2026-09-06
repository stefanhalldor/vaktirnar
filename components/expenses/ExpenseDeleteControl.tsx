'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useRouter } from 'next/navigation'
import { CircleAlert, X } from 'lucide-react'

import {
  deleteOwnExpenseCreationDraft,
  deleteOwnUnsettledExpense,
} from '@/lib/expenses/actions'
import type {
  ExpenseActionErrorCode,
  ExpenseCreationDraftDeleteCapabilityView,
  ExpenseDeleteCapabilityView,
} from '@/lib/expenses/contracts'
import { useExpenseTranslations } from './i18n.client'
import { useExpenseMutationRequestIds } from './request-id'
import {
  expenseDangerButtonClass,
  expenseSecondaryButtonClass,
} from './ui'

type ConfirmedExpenseDeleteTarget = {
  kind: 'confirmed_expense'
  expenseId: string
  capability: ExpenseDeleteCapabilityView
}

type CreationDraftDeleteTarget = {
  kind: 'creation_draft'
  capability: ExpenseCreationDraftDeleteCapabilityView
}

export type ExpenseDeleteTarget = ConfirmedExpenseDeleteTarget | CreationDraftDeleteTarget

function subjectKey(target: ExpenseDeleteTarget): 'privateDraft' | 'sharedDraft' | 'confirmedExpense' {
  if (target.kind === 'confirmed_expense') return 'confirmedExpense'
  return target.capability.status === 'ready' && target.capability.subject === 'shared_draft'
    ? 'sharedDraft'
    : 'privateDraft'
}

function isHidden(target: ExpenseDeleteTarget): boolean {
  return target.kind === 'confirmed_expense'
    ? target.capability.status === 'hidden'
    : target.capability.status === 'not_found'
}

function isUnavailable(target: ExpenseDeleteTarget): boolean {
  return target.capability.status === 'unavailable'
}

export function ExpenseDeleteControl({
  target,
  creatorKnown,
  successHref,
  statusHref = '/auth-mvp/utlagt-og-endurgreitt',
  disabled = false,
  className = 'space-y-3',
  onBusyChange,
}: {
  target: ExpenseDeleteTarget
  /** A separate server-owned projection established exact creator identity. */
  creatorKnown: boolean
  /**
   * Confirmed destination, or a server-selected safe override for a
   * deletion-only draft route whose original context is no longer readable.
   */
  successHref?: string
  /** Safe server-selected destination used to reconcile an ambiguous outcome. */
  statusHref?: string
  disabled?: boolean
  className?: string
  onBusyChange?: (busy: boolean) => void
}) {
  const t = useExpenseTranslations()
  const router = useRouter()
  const requestIds = useExpenseMutationRequestIds()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const keepRef = useRef<HTMLButtonElement>(null)
  const inFlightRef = useRef(false)
  const mutationCompletedRef = useRef(false)
  const restoreTriggerFocusRef = useRef(false)
  const reconciliationStartedRef = useRef(false)
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [checkingStatus, setCheckingStatus] = useState(false)
  const [errorCode, setErrorCode] = useState<ExpenseActionErrorCode | null>(null)
  const [requiresStatusCheck, setRequiresStatusCheck] = useState(false)
  const [reconciliationPending, startReconciliation] = useTransition()

  useEffect(() => {
    if (!open && restoreTriggerFocusRef.current) {
      restoreTriggerFocusRef.current = false
      triggerRef.current?.focus()
    }
  }, [open])

  useEffect(() => {
    if (!checkingStatus
      || !reconciliationStartedRef.current
      || reconciliationPending) return
    reconciliationStartedRef.current = false
    setCheckingStatus(false)
    setPending(false)
    if (mutationCompletedRef.current) return
    inFlightRef.current = false
    setErrorCode(null)
    setRequiresStatusCheck(false)
    onBusyChange?.(false)
    if (open) {
      restoreTriggerFocusRef.current = true
      setOpen(false)
    }
  }, [checkingStatus, onBusyChange, open, reconciliationPending])

  const hiddenByCapability = isHidden(target)
  if (!creatorKnown) return null

  const key = subjectKey(target)
  const blockedReason = target.kind === 'confirmed_expense'
    && target.capability.status === 'blocked'
      ? target.capability.reason
      : null

  function setBusy(next: boolean) {
    setPending(next)
    onBusyChange?.(next)
  }

  function checkStatus() {
    if (checkingStatus || pending) return
    setCheckingStatus(true)
    onBusyChange?.(true)
    // Navigation is read-only. The retained request identity is deliberately
    // not marked successful or replaced with a fresh destructive request.
    try {
      reconciliationStartedRef.current = true
      startReconciliation(() => {
        router.replace(statusHref)
        router.refresh()
      })
    } catch {
      reconciliationStartedRef.current = false
      setCheckingStatus(false)
      if (!inFlightRef.current && !requiresStatusCheck && !mutationCompletedRef.current) {
        onBusyChange?.(false)
      }
      setErrorCode('delete_outcome_unknown')
      setRequiresStatusCheck(true)
    }
  }

  async function deletePermanently() {
    if (inFlightRef.current || disabled) return
    if (target.kind === 'confirmed_expense' && target.capability.status !== 'available') return
    if (target.kind === 'creation_draft' && target.capability.status !== 'ready') return

    inFlightRef.current = true
    setBusy(true)
    setErrorCode(null)
    setRequiresStatusCheck(false)
    let keepLockedForNavigation = false
    try {
      if (target.kind === 'confirmed_expense') {
        const capability = target.capability
        if (capability.status !== 'available') return
        const payload = {
          operation: 'delete_confirmed_expense' as const,
          expense_id: target.expenseId,
          expected_financial_version: capability.expectedFinancialVersion,
        }
        const result = await deleteOwnUnsettledExpense({
          expense_id: payload.expense_id,
          expected_financial_version: payload.expected_financial_version,
          request_id: requestIds.forPayload(payload),
        })
        if (!result.ok) {
          setErrorCode(result.error)
          const reconcileBeforeRetry =
            result.error === 'delete_outcome_unknown'
              || result.error === 'conflict'
              || result.error === 'not_found'
              || result.error === 'not_allowed'
          setRequiresStatusCheck(reconcileBeforeRetry)
          if (reconcileBeforeRetry) {
            keepLockedForNavigation = true
            setPending(false)
            onBusyChange?.(true)
          }
          return
        }
        requestIds.succeeded(payload)
        mutationCompletedRef.current = true
        keepLockedForNavigation = true
        try {
          router.replace(successHref ?? '/auth-mvp/utlagt-og-endurgreitt')
          router.refresh()
        } catch {
          setPending(false)
          setErrorCode('delete_outcome_unknown')
          setRequiresStatusCheck(true)
        }
        return
      }

      const capability = target.capability
      if (capability.status !== 'ready') return
      const payload = {
        operation: 'delete_creation_draft' as const,
        draft_id: capability.draftId,
        expected_draft_version: capability.expectedDraftVersion,
        expected_publication_version: capability.expectedPublicationVersion,
      }
      const result = await deleteOwnExpenseCreationDraft({
        draft_id: payload.draft_id,
        expected_draft_version: payload.expected_draft_version,
        expected_publication_version: payload.expected_publication_version,
        request_id: requestIds.forPayload(payload),
      })
      if (!result.ok) {
        setErrorCode(result.error)
        const reconcileBeforeRetry =
          result.error === 'delete_outcome_unknown'
            || result.error === 'conflict'
            || result.error === 'not_found'
            || result.error === 'not_allowed'
        setRequiresStatusCheck(reconcileBeforeRetry)
        if (reconcileBeforeRetry) {
          keepLockedForNavigation = true
          setPending(false)
          onBusyChange?.(true)
        }
        return
      }
      requestIds.succeeded(payload)
      mutationCompletedRef.current = true
      keepLockedForNavigation = true
      try {
        // The RPC result proves what was deleted, not that the actor can still
        // read its former Event/group context. Context navigation is allowed
        // only when the rendering server route supplied a proven safe href.
        router.replace(successHref ?? '/auth-mvp/utlagt-og-endurgreitt')
        router.refresh()
      } catch {
        setPending(false)
        setErrorCode('delete_outcome_unknown')
        setRequiresStatusCheck(true)
      }
    } catch {
      setErrorCode('delete_outcome_unknown')
      setRequiresStatusCheck(true)
      keepLockedForNavigation = true
      setPending(false)
      onBusyChange?.(true)
    } finally {
      if (!keepLockedForNavigation) {
        inFlightRef.current = false
        setBusy(false)
      }
    }
  }

  if (blockedReason) {
    return (
      <div className={className}>
        <button type="button" className={`${expenseDangerButtonClass} w-full`} disabled>
          {t('deleteControl.trigger')}
        </button>
        <p className="text-sm leading-6 text-muted-foreground">
          {t(`deleteControl.blocked.${blockedReason}`)}
        </p>
      </div>
    )
  }

  if (isUnavailable(target) || hiddenByCapability) {
    return (
      <div className={className}>
        <button type="button" className={`${expenseDangerButtonClass} w-full`} disabled>
          {t('deleteControl.trigger')}
        </button>
        <p className="text-sm leading-6 text-muted-foreground">
          {t('deleteControl.unavailable')}
        </p>
        <button
          type="button"
          className={`${expenseSecondaryButtonClass} w-full`}
          disabled={disabled || checkingStatus}
          onClick={checkStatus}
        >
          {t(checkingStatus ? 'deleteControl.checkingStatus' : 'deleteControl.checkStatus')}
        </button>
      </div>
    )
  }

  return (
    <div className={className}>
      <Dialog.Root
        open={open}
        onOpenChange={(nextOpen) => {
          if (pending || checkingStatus) return
          if (!nextOpen) restoreTriggerFocusRef.current = true
          setOpen(nextOpen)
          if (nextOpen && !requiresStatusCheck) {
            setErrorCode(null)
          }
        }}
      >
        <Dialog.Trigger asChild>
          <button
            ref={triggerRef}
            type="button"
            className={`${expenseDangerButtonClass} w-full`}
            disabled={disabled}
          >
            {t('deleteControl.trigger')}
          </button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45" />
          <Dialog.Content
            role="alertdialog"
            aria-busy={pending || checkingStatus || undefined}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-t-2xl bg-background px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 shadow-xl focus:outline-none sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-[min(28rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:pb-5"
            onOpenAutoFocus={(event) => {
              event.preventDefault()
              keepRef.current?.focus()
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault()
              triggerRef.current?.focus()
            }}
            onEscapeKeyDown={(event) => {
              if (pending || checkingStatus) event.preventDefault()
            }}
            onPointerDownOutside={(event) => {
              if (pending || checkingStatus) event.preventDefault()
            }}
          >
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <Dialog.Title className="break-words text-lg font-semibold">
                  {t(`deleteControl.subjects.${key}.title`)}
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-sm leading-6 text-muted-foreground">
                  {t(`deleteControl.subjects.${key}.description`)}
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  disabled={pending || checkingStatus}
                  aria-label={t('deleteControl.closeLabel')}
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-55"
                >
                  <X aria-hidden size={20} />
                </button>
              </Dialog.Close>
            </div>

            {errorCode ? (
              <p role="alert" className="mt-4 flex gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm leading-6 text-destructive">
                <CircleAlert aria-hidden className="mt-0.5 shrink-0" size={18} />
                <span className="min-w-0 break-words">{t(`errors.${errorCode}`)}</span>
              </p>
            ) : null}

            <p role="status" aria-live="polite" className="sr-only">
              {pending
                ? t('deleteControl.deleting')
                : checkingStatus
                  ? t('deleteControl.checkingStatus')
                  : ''}
            </p>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Dialog.Close asChild>
                <button
                  ref={keepRef}
                  type="button"
                  disabled={pending || checkingStatus}
                  className={`${expenseSecondaryButtonClass} sm:min-w-40`}
                >
                  {t(requiresStatusCheck ? 'deleteControl.close' : 'deleteControl.keep')}
                </button>
              </Dialog.Close>
              {requiresStatusCheck ? (
                <button
                  type="button"
                  disabled={pending || checkingStatus}
                  onClick={checkStatus}
                  className={`${expenseSecondaryButtonClass} sm:min-w-40`}
                >
                  {t(checkingStatus ? 'deleteControl.checkingStatus' : 'deleteControl.checkStatus')}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={pending || checkingStatus}
                  onClick={() => void deletePermanently()}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl bg-destructive px-4 text-sm font-semibold text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-55 sm:min-w-40"
                >
                  {t(pending ? 'deleteControl.deleting' : 'deleteControl.confirm')}
                </button>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
