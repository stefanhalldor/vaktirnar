'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { addExpenseShareCollaborator } from '@/lib/expenses/actions'
import type { ExpenseParticipantOption } from '@/lib/expenses/contracts'
import {
  ExpenseParticipantPicker,
  type ManualExpenseParticipant,
} from './ExpenseParticipantPicker'
import { useExpenseTranslations } from './i18n.client'
import { useExpenseMutationRequestIds } from './request-id'

export function ExpenseShareCollaboratorPicker({
  groupId,
  expenseId,
  shareMemberId,
  options,
  optionsError,
  disabled = false,
}: {
  groupId: string
  expenseId: string
  shareMemberId: string
  options: ExpenseParticipantOption[]
  optionsError: boolean
  disabled?: boolean
}) {
  const t = useExpenseTranslations()
  const router = useRouter()
  const requestIds = useExpenseMutationRequestIds()
  const alertRef = useRef<HTMLParagraphElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function add(member:
    | { type: 'relationship'; relationship_id: string }
    | { type: 'guest'; display_name: string }
    | { type: 'email'; display_name: string; recipient_email: string },
  ): boolean {
    const payload = {
      group_id: groupId,
      expense_id: expenseId,
      share_member_id: shareMemberId,
      member,
    }
    setError(null)
    setNotice(t('expenseForm.addingShareCollaborator'))
    startTransition(async () => {
      const result = await addExpenseShareCollaborator({
        ...payload,
        request_id: requestIds.forPayload(payload),
      })
      if (!result.ok) {
        setNotice(null)
        setError(t(`errors.${result.error}`))
        queueMicrotask(() => alertRef.current?.focus())
        return
      }
      requestIds.succeeded(payload)
      setNotice(t(
        result.data.invitationId
          ? result.data.delivery === 'sent' || result.data.delivery === 'already_sent'
            ? 'expenseForm.shareCollaboratorInvitationSent'
            : 'expenseForm.memberInvitationSavedDeliveryIssue'
          : 'expenseForm.shareCollaboratorAdded',
      ))
      router.refresh()
    })
    return true
  }

  function addKnown(option: ExpenseParticipantOption): boolean {
    return add({ type: 'relationship', relationship_id: option.relationshipId })
  }

  function addManual(participant: ManualExpenseParticipant): boolean {
    return participant.kind === 'email'
      ? add({
        type: 'email',
        display_name: t('expenseForm.invitedParticipant'),
        recipient_email: participant.recipientEmail,
      })
      : add({ type: 'guest', display_name: participant.displayName })
  }

  return (
    <div className="mt-2 space-y-2">
      {error ? (
        <p ref={alertRef} tabIndex={-1} role="alert" className="text-sm text-destructive">{error}</p>
      ) : null}
      {notice ? <p role="status" className="text-sm text-primary">{notice}</p> : null}
      <ExpenseParticipantPicker
        options={options}
        optionsError={optionsError}
        disabled={disabled || isPending}
        triggerLabel={t('expenseForm.addShareCollaborator')}
        dialogTitle={t('expenseForm.addShareCollaborator')}
        dialogDescription={t('expenseForm.addShareCollaboratorDescription')}
        onAddKnown={addKnown}
        onAddManual={addManual}
      />
    </div>
  )
}
