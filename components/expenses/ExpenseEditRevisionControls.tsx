'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { openExpenseEditRevision } from '@/lib/expenses/actions'
import type { ExpenseEditRevisionStateView } from '@/lib/expenses/contracts'
import { useExpenseTranslations } from './i18n.client'
import { useExpenseMutationRequestIds } from './request-id'
import { expensePrimaryButtonClass, expenseSecondaryButtonClass } from './ui'

export function ExpenseEditRevisionControls({
  expenseId,
  state,
  paymentAware,
}: {
  expenseId: string
  state: ExpenseEditRevisionStateView
  paymentAware: boolean
}) {
  const t = useExpenseTranslations()
  const router = useRouter()
  const requestIds = useExpenseMutationRequestIds()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function begin(mode: 'private' | 'shared') {
    const semanticPayload = { operation: 'open_edit_revision' as const, expense_id: expenseId, mode }
    setError(null)
    startTransition(async () => {
      try {
        const result = await openExpenseEditRevision({
          request_id: requestIds.forPayload(semanticPayload),
          expense_id: expenseId,
          mode,
        })
        if (!result.ok) {
          setError(t(`errors.${result.error}`))
          return
        }
        requestIds.succeeded(semanticPayload)
        router.push(`/auth-mvp/utlagt-og-endurgreitt/utgjold/${expenseId}/breyta?step=split&draft=${result.data.draftId}`)
        router.refresh()
      } catch {
        setError(t('errors.generic'))
      }
    })
  }

  if (state.status === 'open') {
    return (
      <section className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
        <div>
          <p className="font-semibold">{t('editRevision.openTitle')}</p>
          <p className="mt-1 text-sm leading-6">{t('editRevision.openBody')}</p>
        </div>
        {state.ownedByActor && state.draftId ? (
          <Link
            href={`/auth-mvp/utlagt-og-endurgreitt/utgjold/${expenseId}/breyta?step=split&draft=${state.draftId}`}
            className={`${expenseSecondaryButtonClass} w-full bg-background`}
          >
            {t('editRevision.continueAction')}
          </Link>
        ) : null}
      </section>
    )
  }

  if (state.status === 'unavailable') {
    return (
      <p role="status" className="rounded-xl border border-border bg-muted/50 p-4 text-sm leading-6">
        {t('editRevision.unavailable')}
      </p>
    )
  }

  if (!state.canOpen) {
    return (
      <p role="status" className="rounded-xl border border-border bg-muted/50 p-4 text-sm leading-6">
        {t('editRevision.cannotOpen')}
      </p>
    )
  }

  return (
    <>
      <button
        type="button"
        className={`${expenseSecondaryButtonClass} w-full`}
        onClick={() => setOpen(true)}
      >
        {t('editRevision.openAction')}
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 p-3 sm:items-center sm:justify-center">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="expense-edit-revision-title"
            className="max-h-[calc(100dvh-1.5rem)] w-full overflow-y-auto rounded-2xl bg-background p-5 shadow-xl sm:max-w-md"
          >
            <h2 id="expense-edit-revision-title" className="text-lg font-semibold">
              {t('editRevision.choiceTitle')}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {t('editRevision.choiceBody')}
            </p>
            {paymentAware ? (
              <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-950">
                {t('editRevision.paymentWarning')}
              </p>
            ) : null}
            {error ? <p role="alert" className="mt-3 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
            <div className="mt-5 space-y-3">
              <button type="button" className={`${expensePrimaryButtonClass} w-full min-h-11`} disabled={isPending} onClick={() => begin('private')}>
                {isPending ? t('editRevision.opening') : t('editRevision.privateChoice')}
              </button>
              <button type="button" className={`${expenseSecondaryButtonClass} w-full min-h-11`} disabled={isPending} onClick={() => begin('shared')}>
                {isPending ? t('editRevision.opening') : t('editRevision.sharedChoice')}
              </button>
              <button type="button" className="inline-flex min-h-11 w-full items-center justify-center text-sm font-medium" disabled={isPending} onClick={() => setOpen(false)}>
                {t('editRevision.cancelChoice')}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  )
}
