'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { TeskeidActionButton } from '@/components/teskeid/TeskeidActionButton'
import { TeskeidActionSheet } from '@/components/teskeid/TeskeidActionSheet'
import { disputeExpenseClaim } from '@/lib/expenses/actions'
import { useExpenseTranslations } from './i18n.client'
import { useExpenseMutationRequestIds } from './request-id'

export function ExpenseClaimDisputeControl({
  expenseId,
  memberId,
  financialVersion,
  disputed,
}: {
  expenseId: string
  memberId: string
  financialVersion: number
  disputed: boolean
}) {
  const t = useExpenseTranslations()
  const router = useRouter()
  const requestIds = useExpenseMutationRequestIds()
  const alertRef = useRef<HTMLParagraphElement>(null)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  if (disputed) {
    return (
      <div role="status" className="border-y border-amber-300 bg-amber-50 px-3 py-4 text-sm text-amber-950">
        <p className="font-semibold">{t('claim.disputedTitle')}</p>
        <p className="mt-1 leading-6">{t('claim.disputedBody')}</p>
      </div>
    )
  }

  function dispute() {
    const payload = {
      expense_id: expenseId,
      member_id: memberId,
      expected_financial_version: financialVersion,
    }
    setError(null)
    startTransition(async () => {
      const result = await disputeExpenseClaim({
        ...payload,
        request_id: requestIds.forPayload(payload),
      })
      if (!result.ok) {
        setError(t(`errors.${result.error}`))
        queueMicrotask(() => alertRef.current?.focus())
        return
      }
      requestIds.succeeded(payload)
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <TeskeidActionSheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isPending) setOpen(nextOpen)
      }}
      trigger={(
        <TeskeidActionButton type="button" variant="secondary" className="w-full">
          {t('claim.trigger')}
        </TeskeidActionButton>
      )}
      title={t('claim.confirmTitle')}
      description={t('claim.confirmBody')}
      closeLabel={t('common.close')}
    >
      {error ? (
        <p ref={alertRef} tabIndex={-1} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <TeskeidActionButton
        type="button"
        variant="danger"
        className="w-full"
        pending={isPending}
        onClick={dispute}
      >
        {isPending ? t('claim.saving') : t('claim.confirmAction')}
      </TeskeidActionButton>
      <TeskeidActionButton
        type="button"
        variant="secondary"
        className="w-full"
        disabled={isPending}
        onClick={() => setOpen(false)}
      >
        {t('common.cancel')}
      </TeskeidActionButton>
    </TeskeidActionSheet>
  )
}
