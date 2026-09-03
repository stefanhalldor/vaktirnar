'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { discardLegacyExpenseEditDraft } from '@/lib/expenses/actions'
import { useExpenseTranslations } from './i18n.client'
import { useExpenseMutationRequestIds } from './request-id'
import { expensePrimaryButtonClass, expenseSecondaryButtonClass } from './ui'

export function LegacyExpenseEditDraftNotice({
  expenseId,
  draftId,
  draftVersion,
}: {
  expenseId: string
  draftId: string
  draftVersion: number
}) {
  const t = useExpenseTranslations()
  const router = useRouter()
  const requestIds = useExpenseMutationRequestIds()
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const detailHref = `/auth-mvp/utlagt-og-endurgreitt/utgjold/${expenseId}`

  function discard() {
    if (!window.confirm(t('editRevision.legacyDiscardConfirmation'))) return
    const payload = {
      operation: 'discard_legacy_edit_draft' as const,
      expense_id: expenseId,
      draft_id: draftId,
      expected_draft_version: draftVersion,
    }
    setError(null)
    startTransition(async () => {
      try {
        const result = await discardLegacyExpenseEditDraft({
          ...payload,
          request_id: requestIds.forPayload(payload),
        })
        if (!result.ok && result.error !== 'legacy_edit_draft_unbound') {
          setError(t(`editErrors.${result.error}`))
          return
        }
        if (result.ok) requestIds.succeeded(payload)
        router.replace(detailHref)
        router.refresh()
      } catch {
        setError(t('editErrors.save_failed'))
      }
    })
  }

  return (
    <section role="alert" className="space-y-4 border-y border-border py-6">
      <div className="space-y-2">
        <h2 className="text-base font-semibold">{t('editRevision.legacyTitle')}</h2>
        <p className="text-sm leading-6 text-muted-foreground">
          {t('editRevision.legacyBody')}
        </p>
        <p className="text-sm font-medium leading-6">
          {t('editRevision.legacyReassurance')}
        </p>
      </div>
      {error ? (
        <p role="status" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          className={`${expensePrimaryButtonClass} min-h-11 flex-1`}
          disabled={isPending}
          onClick={discard}
        >
          {isPending
            ? t('editRevision.legacyDiscardPending')
            : t('editRevision.legacyDiscardAction')}
        </button>
        <Link href={detailHref} className={`${expenseSecondaryButtonClass} min-h-11 flex-1`}>
          {t('editState.backToExpense')}
        </Link>
      </div>
    </section>
  )
}
