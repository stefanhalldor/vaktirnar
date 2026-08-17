'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { TeskeidActionButton } from '@/components/teskeid/TeskeidActionButton'
import { bindExpenseMemberEventIdentity } from '@/lib/expenses/actions'
import type {
  ExpenseEventIdentityCandidatesView,
  ExpenseMemberView,
} from '@/lib/expenses/contracts'
import { useExpenseTranslations } from './i18n.client'
import { useExpenseMutationRequestIds } from './request-id'

export function ExpenseEventIdentityPicker({
  expenseId,
  financialVersion,
  member,
  source,
}: {
  expenseId: string
  financialVersion: number
  member: ExpenseMemberView
  source: ExpenseEventIdentityCandidatesView | null
}) {
  const t = useExpenseTranslations()
  const router = useRouter()
  const requestIds = useExpenseMutationRequestIds()
  const alertRef = useRef<HTMLParagraphElement>(null)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingParticipantId, setPendingParticipantId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  if (member.status !== 'active'
    || member.isSelf
    || member.isRegistered
    || !source
    || source.candidates.length === 0) return null

  function bind(eventParticipantId: string) {
    const payload = {
      expense_id: expenseId,
      member_id: member.id,
      event_participant_id: eventParticipantId,
      expected_financial_version: financialVersion,
    }
    setError(null)
    setPendingParticipantId(eventParticipantId)
    startTransition(async () => {
      const result = await bindExpenseMemberEventIdentity({
        ...payload,
        request_id: requestIds.forPayload(payload),
      })
      if (!result.ok) {
        setError(t(`errors.${result.error}`))
        setPendingParticipantId(null)
        queueMicrotask(() => alertRef.current?.focus())
        return
      }
      requestIds.succeeded(payload)
      setPendingParticipantId(null)
      setOpen(false)
      router.refresh()
    })
  }

  return open ? (
    <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-3">
      <div>
        <p className="text-sm font-semibold">{t('identity.eventPickerTitle')}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {t('identity.eventPickerDescription', { event: source.eventName })}
        </p>
      </div>
      {error ? (
        <p ref={alertRef} tabIndex={-1} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="max-h-60 divide-y divide-border overflow-y-auto border-y border-border">
        {source.candidates.map((candidate) => (
          <button
            key={candidate.eventParticipantId}
            type="button"
            disabled={isPending}
            onClick={() => bind(candidate.eventParticipantId)}
            className="flex min-h-12 w-full items-center py-2 text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            <span className="min-w-0 break-words">
              {candidate.displayName ?? t('identity.unknownUser')}
            </span>
            {pendingParticipantId === candidate.eventParticipantId ? (
              <span className="ml-auto pl-3 text-xs text-muted-foreground">
                {t('identity.binding')}
              </span>
            ) : null}
          </button>
        ))}
      </div>
      <TeskeidActionButton
        type="button"
        variant="secondary"
        className="w-full"
        disabled={isPending}
        onClick={() => setOpen(false)}
      >
        {t('common.cancel')}
      </TeskeidActionButton>
    </div>
  ) : (
    <TeskeidActionButton
      type="button"
      variant="secondary"
      className="w-full"
      onClick={() => setOpen(true)}
    >
      {t('identity.linkTeskeidUser')}
    </TeskeidActionButton>
  )
}
