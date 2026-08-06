'use client'

import { useRef, useState, useTransition } from 'react'
import { Mail, RotateCcw, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { IdentityInvitationEmailForm } from '@/components/teskeid/IdentityInvitationEmailForm'
import {
  addExpenseGroupMember,
  cancelExpenseMemberInvitation,
  linkExpenseGuestMember,
  removeExpenseGroupMember,
  resendExpenseMemberInvitation,
} from '@/lib/expenses/actions'
import type { ExpenseMemberView, ExpenseParticipantOption } from '@/lib/expenses/contracts'
import { useExpenseTranslations } from './i18n.client'
import {
  ExpenseParticipantPicker,
  type ManualExpenseParticipant,
} from './ExpenseParticipantPicker'
import { useExpenseMutationRequestIds } from './request-id'
import {
  expenseDangerButtonClass,
  expenseSecondaryButtonClass,
} from './ui'

export function ExpenseMemberManager({
  groupId,
  members,
  options,
  optionsError,
  canManage,
  canLinkGuests = false,
}: {
  groupId: string
  members: ExpenseMemberView[]
  options: ExpenseParticipantOption[]
  optionsError: boolean
  canManage: boolean
  canLinkGuests?: boolean
}) {
  const t = useExpenseTranslations()
  const router = useRouter()
  const requestIds = useExpenseMutationRequestIds()
  const alertRef = useRef<HTMLParagraphElement>(null)
  const [linkingMemberId, setLinkingMemberId] = useState<string | null>(null)
  const [recipientEmail, setRecipientEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function showError(code: string) {
    setError(t(`errors.${code}`))
    queueMicrotask(() => alertRef.current?.focus())
  }

  function invite(member: ExpenseMemberView) {
    const payload = {
      group_id: groupId,
      member_id: member.id,
      recipient_email: recipientEmail.trim(),
    }
    setError(null)
    setNotice(null)
    setPendingKey(`invite:${member.id}`)
    startTransition(async () => {
      const result = await linkExpenseGuestMember({
        ...payload,
        request_id: requestIds.forPayload(payload),
      })
      if (!result.ok) {
        showError(result.error)
        setPendingKey(null)
        return
      }
      requestIds.succeeded(payload)
      setNotice(t(
        result.data.delivery === 'sent' || result.data.delivery === 'already_sent'
          ? 'expenseForm.memberInvitationSent'
          : 'expenseForm.memberInvitationSavedDeliveryIssue',
      ))
      setLinkingMemberId(null)
      setRecipientEmail('')
      setPendingKey(null)
      router.refresh()
    })
  }

  function resend(invitationId: string) {
    setError(null)
    setNotice(null)
    setPendingKey(`resend:${invitationId}`)
    startTransition(async () => {
      const result = await resendExpenseMemberInvitation({ invitation_id: invitationId })
      if (!result.ok) {
        showError(result.error)
      } else {
        setNotice(t(
          result.data.delivery === 'sent' || result.data.delivery === 'already_sent'
            ? 'expenseForm.memberInvitationSent'
            : 'expenseForm.memberInvitationSavedDeliveryIssue',
        ))
      }
      setPendingKey(null)
      router.refresh()
    })
  }

  function cancelInvitation(invitationId: string) {
    if (!window.confirm(t('expenseForm.cancelMemberInvitationConfirm'))) return
    const payload = { invitation_id: invitationId }
    setError(null)
    setNotice(null)
    setPendingKey(`cancel-invitation:${invitationId}`)
    startTransition(async () => {
      const result = await cancelExpenseMemberInvitation({
        ...payload,
        request_id: requestIds.forPayload(payload),
      })
      if (!result.ok) {
        showError(result.error)
        setPendingKey(null)
        return
      }
      requestIds.succeeded(payload)
      setNotice(t('expenseForm.memberInvitationCancelled'))
      setPendingKey(null)
      router.refresh()
    })
  }

  function add(member:
    | { type: 'relationship'; relationship_id: string }
    | { type: 'guest'; display_name: string }
    | { type: 'email'; display_name: string; recipient_email: string },
  ): boolean {
    const payload = { group_id: groupId, member }
    setError(null)
    setPendingKey('add:participant')
    startTransition(async () => {
      const result = await addExpenseGroupMember({
        ...payload,
        request_id: requestIds.forPayload(payload),
      })
      if (!result.ok) {
        showError(result.error)
        setPendingKey(null)
        return
      }
      requestIds.succeeded(payload)
      if ('recipient_email' in member || member.type === 'relationship') {
        setNotice(t(
          result.data?.delivery === 'sent' || result.data?.delivery === 'already_sent'
            ? 'expenseForm.memberInvitationSent'
            : 'expenseForm.memberInvitationSavedDeliveryIssue',
        ))
      }
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

  function remove(member: ExpenseMemberView) {
    if (!window.confirm(t('group.removeMemberConfirm', { name: member.displayName }))) return
    setError(null)
    setPendingKey(`remove:${member.id}`)
    const payload = { group_id: groupId, member_id: member.id }
    startTransition(async () => {
      const result = await removeExpenseGroupMember({
        ...payload,
        request_id: requestIds.forPayload(payload),
      })
      if (!result.ok) {
        showError(result.error)
        setPendingKey(null)
        return
      }
      requestIds.succeeded(payload)
      router.refresh()
    })
  }

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold">{t('group.members')}</h2>
      {error ? <p ref={alertRef} tabIndex={-1} role="alert" className="mb-3 text-sm text-destructive">{error}</p> : null}
      {notice ? <p role="status" className="mb-3 text-sm text-primary">{notice}</p> : null}
      <div className="divide-y divide-border border-y border-border">
        {members.map((member) => {
          const statusKey = `group.member${member.status[0]!.toUpperCase()}${member.status.slice(1)}`
          const canRemove = canManage && !member.isSelf && ['active', 'invited'].includes(member.status)
          const canLink = canLinkGuests
            && member.status === 'active'
            && !member.isSelf
            && !member.isRegistered
          const invitation = member.identityInvitation ?? null
          return (
            <div key={member.id} className="py-2 text-sm">
              <div className="flex min-h-12 items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{member.displayName}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t(statusKey)} · {t(member.isRegistered ? 'group.registered' : 'group.guest')}
                    {invitation ? ` · ${t(`expenseForm.memberInvitationDelivery.${invitation.delivery}`)}` : ''}
                  </span>
                </span>
                {canLink && !invitation ? (
                  <button
                    type="button"
                    className={`${expenseSecondaryButtonClass} min-h-11 shrink-0 px-3`}
                    disabled={isPending}
                    onClick={() => {
                      setLinkingMemberId(member.id)
                      setRecipientEmail('')
                    }}
                  >
                    <Mail aria-hidden size={16} className="mr-1.5" />
                    {t('expenseForm.linkGuest')}
                  </button>
                ) : null}
                {canLink && invitation ? (
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      aria-label={t('expenseForm.resendMemberInvitation')}
                      className={`${expenseSecondaryButtonClass} size-11 px-0`}
                      disabled={isPending}
                      onClick={() => resend(invitation.id)}
                    >
                      <RotateCcw aria-hidden size={16} />
                    </button>
                    <button
                      type="button"
                      aria-label={t('expenseForm.cancelMemberInvitation')}
                      className={`${expenseDangerButtonClass} size-11 px-0`}
                      disabled={isPending}
                      onClick={() => cancelInvitation(invitation.id)}
                    >
                      <X aria-hidden size={16} />
                    </button>
                  </div>
                ) : null}
                {canRemove ? (
                  <button
                    type="button"
                    aria-label={t('group.removeMember', { name: member.displayName })}
                    className={`${expenseDangerButtonClass} size-11 shrink-0 px-0`}
                    disabled={isPending}
                    onClick={() => remove(member)}
                  >
                    <X aria-hidden size={17} />
                    <span className="sr-only">
                      {pendingKey === `remove:${member.id}` ? t('group.removingMember') : t('group.removeMember', { name: member.displayName })}
                    </span>
                  </button>
                ) : null}
              </div>
              {canLink && !invitation && linkingMemberId === member.id ? (
                <div className="pb-3 pt-1">
                  <IdentityInvitationEmailForm
                    value={recipientEmail}
                    label={t('expenseForm.linkGuestEmail', { name: member.displayName })}
                    placeholder={t('expenseForm.linkGuestEmailPlaceholder')}
                    submitLabel={t('expenseForm.sendMemberInvitation')}
                    pendingLabel={t('expenseForm.sendingMemberInvitation')}
                    cancelLabel={t('common.cancel')}
                    isPending={isPending && pendingKey === `invite:${member.id}`}
                    onChange={setRecipientEmail}
                    onSubmit={() => invite(member)}
                    onCancel={() => {
                      setLinkingMemberId(null)
                      setRecipientEmail('')
                    }}
                  />
                </div>
              ) : null}
            </div>
          )
        })}
      </div>

      {canManage ? (
        <div className="mt-4 space-y-3">
          <p className="text-xs leading-5 text-muted-foreground">{t('group.addMemberHint')}</p>
          <ExpenseParticipantPicker
            options={options}
            excludedRelationshipIds={[]}
            optionsError={optionsError}
            disabled={isPending}
            onAddKnown={addKnown}
            onAddManual={addManual}
          />
        </div>
      ) : null}
    </section>
  )
}
