'use client'

import { useRef, useState, useTransition } from 'react'
import { X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import {
  IdentityLinkInvitationControl,
  type IdentityLinkInvitationCancelResult,
  type IdentityLinkInvitationDeliveryResult,
  type IdentityLinkInvitationFeedback,
} from '@/components/teskeid/IdentityLinkInvitationControl'
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
import { expenseDangerButtonClass } from './ui'

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
  const [activeLinkMemberId, setActiveLinkMemberId] = useState<string | null>(null)
  const [identityPending, setIdentityPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function showError(code: string) {
    setError(t(`errors.${code}`))
    queueMicrotask(() => alertRef.current?.focus())
  }

  function handleIdentityFeedback(feedback: IdentityLinkInvitationFeedback | null) {
    setError(feedback?.kind === 'error' ? feedback.message : null)
    setNotice(feedback?.kind === 'status' ? feedback.message : null)
    if (feedback?.kind === 'error') {
      queueMicrotask(() => alertRef.current?.focus())
    }
  }

  async function invite(
    member: ExpenseMemberView,
    recipientEmail: string,
  ): Promise<IdentityLinkInvitationDeliveryResult> {
    const payload = {
      group_id: groupId,
      member_id: member.id,
      recipient_email: recipientEmail.trim(),
    }
    const result = await linkExpenseGuestMember({
      ...payload,
      request_id: requestIds.forPayload(payload),
    })
    if (!result.ok) {
      return { ok: false, safeErrorMessage: t(`errors.${result.error}`) }
    }
    requestIds.succeeded(payload)
    return { ok: true, delivery: result.data.delivery }
  }

  async function resend(invitationId: string): Promise<IdentityLinkInvitationDeliveryResult> {
    const result = await resendExpenseMemberInvitation({ invitation_id: invitationId })
    return result.ok
      ? { ok: true, delivery: result.data.delivery }
      : { ok: false, safeErrorMessage: t(`errors.${result.error}`) }
  }

  async function cancelInvitation(
    invitationId: string,
  ): Promise<IdentityLinkInvitationCancelResult> {
    const payload = { invitation_id: invitationId }
    const result = await cancelExpenseMemberInvitation({
      ...payload,
      request_id: requestIds.forPayload(payload),
    })
    if (!result.ok) {
      return { ok: false, safeErrorMessage: t(`errors.${result.error}`) }
    }
    requestIds.succeeded(payload)
    return { ok: true }
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

  const controlsPending = isPending || identityPending

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
              <div className="flex min-h-12 flex-wrap items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{member.displayName}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t(statusKey)} · {t(member.isRegistered ? 'group.registered' : 'group.guest')}
                    {invitation ? ` · ${t(`expenseForm.memberInvitationDelivery.${invitation.delivery}`)}` : ''}
                  </span>
                </span>
                {canLink ? (
                  <IdentityLinkInvitationControl
                    state={invitation ? 'pending' : 'eligible'}
                    partyLabel={member.displayName}
                    presentation="compact"
                    disabled={controlsPending}
                    resetKey={activeLinkMemberId !== null && activeLinkMemberId !== member.id
                      ? activeLinkMemberId
                      : undefined}
                    copy={{
                      triggerLabel: t('expenseForm.linkGuest'),
                      emailLabel: t('expenseForm.linkGuestEmail', { name: member.displayName }),
                      emailPlaceholder: t('expenseForm.linkGuestEmailPlaceholder'),
                      submitLabel: t('expenseForm.sendMemberInvitation'),
                      submittingLabel: t('expenseForm.sendingMemberInvitation'),
                      entryCancelLabel: t('common.cancel'),
                      resendLabel: t('expenseForm.resendMemberInvitation'),
                      resendPendingLabel: t('expenseForm.sendingMemberInvitation'),
                      cancelInvitationLabel: t('expenseForm.cancelMemberInvitation'),
                      cancellingLabel: t('expenseForm.cancellingMemberInvitation'),
                      cancelInvitationConfirm: t('expenseForm.cancelMemberInvitationConfirm'),
                      cancelledNotice: t('expenseForm.memberInvitationCancelled'),
                      sentNotice: t('expenseForm.memberInvitationSent'),
                      deliveryIssueNotice: t('expenseForm.memberInvitationSavedDeliveryIssue'),
                      genericError: t('errors.save_failed'),
                    }}
                    onInvite={invitation ? undefined : (email) => invite(member, email)}
                    onResend={invitation ? () => resend(invitation.id) : undefined}
                    onCancel={invitation ? () => cancelInvitation(invitation.id) : undefined}
                    onFeedback={handleIdentityFeedback}
                    onPendingChange={setIdentityPending}
                    onEntryOpenChange={(open) => {
                      setActiveLinkMemberId((current) => open
                        ? member.id
                        : current === member.id ? null : current)
                    }}
                    onCompleted={() => router.refresh()}
                  />
                ) : null}
                {canRemove ? (
                  <button
                    type="button"
                    aria-label={t('group.removeMember', { name: member.displayName })}
                    className={`${expenseDangerButtonClass} size-11 shrink-0 px-0`}
                    disabled={controlsPending}
                    onClick={() => remove(member)}
                  >
                    <X aria-hidden size={17} />
                    <span className="sr-only">
                      {pendingKey === `remove:${member.id}` ? t('group.removingMember') : t('group.removeMember', { name: member.displayName })}
                    </span>
                  </button>
                ) : null}
              </div>
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
            disabled={controlsPending}
            onAddKnown={addKnown}
            onAddManual={addManual}
          />
        </div>
      ) : null}
    </section>
  )
}
