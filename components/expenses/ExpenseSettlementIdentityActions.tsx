'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  IdentityLinkInvitationControl,
  type IdentityLinkInvitationCancelResult,
  type IdentityLinkInvitationDeliveryResult,
  type IdentityLinkInvitationFeedback,
} from '@/components/teskeid/IdentityLinkInvitationControl'
import { TeskeidActionButton } from '@/components/teskeid/TeskeidActionButton'
import {
  cancelExpenseMemberInvitation,
  linkExpenseGuestMember,
  renameExpenseGuestMember,
  resendExpenseMemberInvitation,
} from '@/lib/expenses/actions'
import type { ExpenseMemberView } from '@/lib/expenses/contracts'
import { useExpenseTranslations } from './i18n.client'
import { useExpenseMutationRequestIds } from './request-id'
import { expenseInputClass } from './ui'

export function ExpenseSettlementIdentityActions({
  groupId,
  member,
  canLinkGuests,
  canRenameGuest = false,
  showIdentityHeading = false,
}: {
  groupId: string
  member: ExpenseMemberView
  canLinkGuests: boolean
  canRenameGuest?: boolean
  showIdentityHeading?: boolean
}) {
  const t = useExpenseTranslations()
  const router = useRouter()
  const requestIds = useExpenseMutationRequestIds()
  const alertRef = useRef<HTMLParagraphElement>(null)
  const [showRename, setShowRename] = useState(false)
  const [identityResetKey, setIdentityResetKey] = useState(0)
  const [identityPending, setIdentityPending] = useState(false)
  const [displayName, setDisplayName] = useState(member.displayName)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const invitation = member.identityInvitation ?? null
  const canLink = canLinkGuests
    && member.status === 'active'
    && !member.isSelf
    && !member.isRegistered
  const canRename = canRenameGuest
    && member.status === 'active'
    && !member.isSelf
    && !member.isRegistered
  const identityLabel = invitation?.recipientLabel ?? member.displayName
  const identityStatus = invitation
    ? t('expenseForm.invitationPending')
    : member.isRegistered
      ? t('expenseForm.registeredMarker')
      : t('expenseForm.guestMarker')
  const identityHeading = invitation
    ? `${identityLabel} · ${identityStatus}`
    : member.isRegistered
      ? `${identityLabel} ${identityStatus}`
      : `${identityLabel} (${identityStatus})`

  function fail(code: string) {
    setError(t(`errors.${code}`))
    setPendingAction(null)
    queueMicrotask(() => alertRef.current?.focus())
  }

  function handleIdentityFeedback(feedback: IdentityLinkInvitationFeedback | null) {
    setError(feedback?.kind === 'error' ? feedback.message : null)
    setNotice(feedback?.kind === 'status' ? feedback.message : null)
    if (feedback?.kind === 'error') {
      queueMicrotask(() => alertRef.current?.focus())
    }
  }

  async function invite(recipientEmail: string): Promise<IdentityLinkInvitationDeliveryResult> {
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

  function saveName() {
    const payload = {
      group_id: groupId,
      member_id: member.id,
      display_name: displayName.trim(),
    }
    setError(null)
    setNotice(null)
    setPendingAction('rename')
    startTransition(async () => {
      const result = await renameExpenseGuestMember({
        ...payload,
        request_id: requestIds.forPayload(payload),
      })
      if (!result.ok) return fail(result.error)
      requestIds.succeeded(payload)
      setDisplayName(result.data.displayName)
      setNotice(t('expenseForm.guestNameUpdated'))
      setShowRename(false)
      setPendingAction(null)
      router.refresh()
    })
  }

  async function cancel(invitationId: string): Promise<IdentityLinkInvitationCancelResult> {
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

  if (!canLink && !canRename) return null

  const controlsPending = isPending || identityPending

  return (
    <section className={showIdentityHeading
      ? 'space-y-3 rounded-xl border border-border bg-muted/30 p-3'
      : 'space-y-2'}>
      {showIdentityHeading ? (
        <h3 className="break-words text-sm font-semibold">{identityHeading}</h3>
      ) : null}
      {error ? (
        <p ref={alertRef} tabIndex={-1} role="alert" className="text-sm text-destructive">{error}</p>
      ) : null}
      {notice ? <p role="status" className="text-sm text-primary">{notice}</p> : null}

      {canRename ? showRename ? (
        <form
          className="space-y-3"
          aria-busy={isPending && pendingAction === 'rename'}
          onSubmit={(event) => {
            event.preventDefault()
            saveName()
          }}
        >
          <label className="block">
            <span className="mb-1 block text-sm font-medium">
              {t('expenseForm.guestDisplayName')}
            </span>
            <input
              className={expenseInputClass}
              value={displayName}
              maxLength={120}
              disabled={controlsPending}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <TeskeidActionButton
              type="button"
              variant="secondary"
              disabled={controlsPending}
              onClick={() => {
                setDisplayName(member.displayName)
                setShowRename(false)
              }}
            >
              {t('common.cancel')}
            </TeskeidActionButton>
            <TeskeidActionButton
              type="submit"
              variant="primary"
              pending={isPending && pendingAction === 'rename'}
              disabled={controlsPending
                || !displayName.trim()
                || displayName.trim() === member.displayName}
            >
              {pendingAction === 'rename'
                ? t('expenseForm.savingGuestName')
                : t('common.save')}
            </TeskeidActionButton>
          </div>
        </form>
      ) : (
        <TeskeidActionButton
          type="button"
          variant="secondary"
          className="w-full"
          disabled={controlsPending}
          onClick={() => {
            setIdentityResetKey((current) => current + 1)
            setShowRename(true)
          }}
        >
          {t('expenseForm.renameGuest')}
        </TeskeidActionButton>
      ) : null}

      {canLink ? (
        <IdentityLinkInvitationControl
          state={invitation ? 'pending' : 'eligible'}
          partyLabel={member.displayName}
          presentation="stacked"
          disabled={controlsPending}
          resetKey={identityResetKey}
          copy={{
            triggerLabel: t('expenseForm.linkToTeskeidUser'),
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
          onInvite={invitation ? undefined : invite}
          onResend={invitation ? () => resend(invitation.id) : undefined}
          onCancel={invitation ? () => cancel(invitation.id) : undefined}
          onFeedback={handleIdentityFeedback}
          onPendingChange={setIdentityPending}
          onEntryOpenChange={(open) => {
            if (open) setShowRename(false)
          }}
          onCompleted={() => router.refresh()}
        />
      ) : null}
    </section>
  )
}
