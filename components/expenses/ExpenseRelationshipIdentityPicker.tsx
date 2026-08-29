'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { TeskeidActionButton } from '@/components/teskeid/TeskeidActionButton'
import { bindExpenseMemberRelationshipIdentity } from '@/lib/expenses/actions'
import { useExpenseTranslations } from './i18n.client'
import { useExpenseMutationRequestIds } from './request-id'

export function ExpenseRelationshipIdentityPicker({ expenseId, memberId, financialVersion, candidates }: {
  expenseId: string
  memberId: string
  financialVersion: number
  candidates: Array<{ relationshipId: string; displayName: string }>
}) {
  const t = useExpenseTranslations()
  const router = useRouter()
  const requestIds = useExpenseMutationRequestIds()
  const alertRef = useRef<HTMLParagraphElement>(null)
  const pendingRef = useRef(false)
  const [open, setOpen] = useState(false)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  if (candidates.length === 0) return null
  const bind = (relationshipId: string) => {
    if (pendingRef.current) return
    pendingRef.current = true
    const payload = { expense_id: expenseId, member_id: memberId, relationship_id: relationshipId, expected_financial_version: financialVersion }
    setError(null); setPendingId(relationshipId)
    startTransition(async () => {
      const result = await bindExpenseMemberRelationshipIdentity({ ...payload, request_id: requestIds.forPayload(payload) })
      if (!result.ok) { pendingRef.current = false; setError(t(`errors.${result.error}`)); setPendingId(null); queueMicrotask(() => alertRef.current?.focus()); return }
      requestIds.succeeded(payload); pendingRef.current = false; setOpen(false); setPendingId(null); router.refresh()
    })
  }
  return open ? <div className="mt-2 space-y-2 border-y border-border py-2">
    <p className="text-xs leading-5 text-muted-foreground">{t('identity.relationshipPickerDescription')}</p>
    {error ? <p ref={alertRef} tabIndex={-1} role="alert" className="text-sm text-destructive">{error}</p> : null}
    {candidates.map((candidate) => <button key={candidate.relationshipId} type="button" disabled={isPending || pendingId !== null}
      onClick={() => bind(candidate.relationshipId)} className="flex min-h-11 w-full items-center text-left text-sm font-medium focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60">
      <span className="min-w-0 break-words">{candidate.displayName}</span>
      {pendingId === candidate.relationshipId ? <span className="ml-auto pl-2 text-xs">{t('identity.binding')}</span> : null}
    </button>)}
    <TeskeidActionButton type="button" variant="secondary" className="w-full" disabled={isPending} onClick={() => setOpen(false)}>{t('common.cancel')}</TeskeidActionButton>
  </div> : <TeskeidActionButton type="button" variant="secondary" className="mt-2 w-full" onClick={() => setOpen(true)}>{t('identity.linkTeskeidUser')}</TeskeidActionButton>
}
