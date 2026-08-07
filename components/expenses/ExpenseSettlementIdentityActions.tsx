'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { IdentityInvitationEmailForm } from '@/components/teskeid/IdentityInvitationEmailForm'
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
  const [showEmail, setShowEmail] = useState(false)
  const [showRename, setShowRename] = useState(false)
  const [recipientEmail, setRecipientEmail] = useState('')
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

  function invite() {
    const payload = {
      group_id: groupId,
      member_id: member.id,
      recipient_email: recipientEmail.trim(),
    }
    setError(null)
    setNotice(null)
    setPendingAction('invite')
    startTransition(async () => {
      const result = await linkExpenseGuestMember({
        ...payload,
        request_id: requestIds.forPayload(payload),
      })
      if (!result.ok) return fail(result.error)
      requestIds.succeeded(payload)
      setNotice(t(
        result.data.delivery === 'sent' || result.data.delivery === 'already_sent'
          ? 'expenseForm.memberInvitationSent'
          : 'expenseForm.memberInvitationSavedDeliveryIssue',
      ))
      setShowEmail(false)
      setRecipientEmail('')
      setPendingAction(null)
      router.refresh()
    })
  }

  function resend() {
    if (!invitation) return
    setError(null)
    setNotice(null)
    setPendingAction('resend')
    startTransition(async () => {
      const result = await resendExpenseMemberInvitation({ invitation_id: invitation.id })
      if (!result.ok) return fail(result.error)
      setNotice(t(
        result.data.delivery === 'sent' || result.data.delivery === 'already_sent'
          ? 'expenseForm.memberInvitationSent'
          : 'expenseForm.memberInvitationSavedDeliveryIssue',
      ))
      setPendingAction(null)
      router.refresh()
    })
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

  function cancel() {
    if (!invitation || !window.confirm(t('expenseForm.cancelMemberInvitationConfirm'))) return
    const payload = { invitation_id: invitation.id }
    setError(null)
    setNotice(null)
    setPendingAction('cancel')
    startTransition(async () => {
      const result = await cancelExpenseMemberInvitation({
        ...payload,
        request_id: requestIds.forPayload(payload),
      })
      if (!result.ok) return fail(result.error)
      requestIds.succeeded(payload)
      setNotice(t('expenseForm.memberInvitationCancelled'))
      setPendingAction(null)
      router.refresh()
    })
  }

  if (!canLink && !canRename) return null

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
              disabled={isPending}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <TeskeidActionButton
              type="button"
              variant="secondary"
              disabled={isPending}
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
              disabled={!displayName.trim() || displayName.trim() === member.displayName}
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
          disabled={isPending}
          onClick={() => {
            setShowEmail(false)
            setShowRename(true)
          }}
        >
          {t('expenseForm.renameGuest')}
        </TeskeidActionButton>
      ) : null}

      {canLink && invitation ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <TeskeidActionButton
            type="button"
            variant="secondary"
            disabled={isPending}
            onClick={resend}
          >
            {pendingAction === 'resend'
              ? t('expenseForm.sendingMemberInvitation')
              : t('expenseForm.resendMemberInvitation')}
          </TeskeidActionButton>
          <TeskeidActionButton
            type="button"
            variant="danger"
            disabled={isPending}
            onClick={cancel}
          >
            {pendingAction === 'cancel'
              ? t('expenseForm.cancellingMemberInvitation')
              : t('expenseForm.cancelMemberInvitation')}
          </TeskeidActionButton>
        </div>
      ) : canLink && showEmail ? (
        <IdentityInvitationEmailForm
          value={recipientEmail}
          label={t('expenseForm.linkGuestEmail', { name: member.displayName })}
          placeholder={t('expenseForm.linkGuestEmailPlaceholder')}
          submitLabel={t('expenseForm.sendMemberInvitation')}
          pendingLabel={t('expenseForm.sendingMemberInvitation')}
          cancelLabel={t('common.cancel')}
          isPending={isPending && pendingAction === 'invite'}
          onChange={setRecipientEmail}
          onSubmit={invite}
          onCancel={() => {
            setShowEmail(false)
            setRecipientEmail('')
          }}
        />
      ) : canLink ? (
        <TeskeidActionButton
          type="button"
          variant="secondary"
          className="w-full"
          onClick={() => {
            setShowRename(false)
            setShowEmail(true)
          }}
        >
          {t('expenseForm.linkToTeskeidUser')}
        </TeskeidActionButton>
      ) : null}
    </section>
  )
}
