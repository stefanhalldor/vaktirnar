'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  IdentityLinkInvitationControl,
  type IdentityLinkInvitationCopy,
  type IdentityLinkInvitationDeliveryResult,
} from '@/components/teskeid/IdentityLinkInvitationControl'
import { TeskeidActionButton } from '@/components/teskeid/TeskeidActionButton'
import { createRequestId } from '@/components/expenses/ui'
import {
  cancelEventGuestAttendanceInvitation,
  inviteEventGuestAttendance,
} from '@/lib/events/actions'
import type {
  EventActionErrorCode,
  EventGuestAttendanceView,
  EventGuestSourceKind,
} from '@/lib/events/contracts'

const TERMINAL_STATUSES = new Set([
  'declined',
  'cancelled',
  'expired',
  'left',
  'revoked',
])

function feedbackError(
  translate: ReturnType<typeof useTranslations<'teskeid.events'>>,
  error: EventActionErrorCode,
): string {
  return translate(`errors.${error}`)
}

export function EventGuestAttendanceControl({
  eventId,
  eventGuestId,
  rosterRevision,
  partyLabel,
  sourceKind,
  isTeskeidUser,
  attendance,
  disabled,
  onPendingChange,
}: {
  eventId: string
  eventGuestId: string
  rosterRevision: number
  partyLabel: string
  sourceKind: EventGuestSourceKind
  isTeskeidUser: boolean
  attendance: EventGuestAttendanceView
  disabled: boolean
  onPendingChange: (pending: boolean) => void
}) {
  const t = useTranslations('teskeid.events')
  const router = useRouter()
  const requestIdsRef = useRef(new Map<string, string>())
  const alertRef = useRef<HTMLParagraphElement>(null)
  const inFlightRef = useRef(false)
  const [directPending, setDirectPending] = useState(false)
  const [directFeedback, setDirectFeedback] = useState<{
    kind: 'error' | 'status'
    message: string
  } | null>(null)

  useEffect(() => {
    if (directFeedback?.kind === 'error') alertRef.current?.focus()
  }, [directFeedback])

  function requestIdFor(key: string): string {
    const existing = requestIdsRef.current.get(key)
    if (existing) return existing
    const requestId = createRequestId()
    requestIdsRef.current.set(key, requestId)
    return requestId
  }

  function refreshAfterMutation(key: string) {
    requestIdsRef.current.delete(key)
    router.refresh()
  }

  const copy: IdentityLinkInvitationCopy = {
    triggerLabel: t('identityInvitation.linkAndInviteTriggerLabel'),
    emailLabel: t('identityInvitation.emailLabel'),
    emailPlaceholder: t('identityInvitation.emailPlaceholder'),
    submitLabel: t('identityInvitation.submitLabel'),
    submittingLabel: t('identityInvitation.submittingLabel'),
    entryCancelLabel: t('identityInvitation.entryCancelLabel'),
    resendLabel: t('identityInvitation.resendLabel'),
    resendPendingLabel: t('identityInvitation.resendPendingLabel'),
    cancelInvitationLabel: t('identityInvitation.cancelInvitationLabel'),
    cancellingLabel: t('identityInvitation.cancellingLabel'),
    cancelInvitationConfirm: t('identityInvitation.cancelInvitationConfirm'),
    cancelledNotice: t('identityInvitation.cancelledNotice'),
    sentNotice: t('identityInvitation.sentNotice'),
    deliveryIssueNotice: t('identityInvitation.deliveryIssueNotice'),
    genericError: t('identityInvitation.genericError'),
    linkedLabel: t('identityInvitation.acceptedAccessLabel'),
  }

  async function invite(recipientEmail: string | null): Promise<IdentityLinkInvitationDeliveryResult> {
    const key = `invite:${recipientEmail ?? 'derived'}`
    const result = await inviteEventGuestAttendance({
      event_id: eventId,
      event_guest_id: eventGuestId,
      expected_roster_revision: rosterRevision,
      request_id: requestIdFor(key),
      recipient_email: recipientEmail,
    })
    if (!result.ok) {
      if (result.error === 'conflict') router.refresh()
      return { ok: false, safeErrorMessage: feedbackError(t, result.error) }
    }
    if (result.data.delivery === 'uncertain') router.refresh()
    else refreshAfterMutation(key)
    return { ok: true, delivery: result.data.delivery }
  }

  async function cancel() {
    if (!attendance.invitationId) {
      return { ok: false as const, safeErrorMessage: t('identityInvitation.genericError') }
    }
    const key = `cancel:${attendance.invitationId}`
    const result = await cancelEventGuestAttendanceInvitation({
      event_id: eventId,
      event_guest_id: eventGuestId,
      invitation_id: attendance.invitationId,
      expected_roster_revision: rosterRevision,
      request_id: requestIdFor(key),
    })
    if (!result.ok) {
      if (result.error === 'conflict') router.refresh()
      return { ok: false as const, safeErrorMessage: feedbackError(t, result.error) }
    }
    refreshAfterMutation(key)
    return { ok: true as const }
  }

  const sharedResetKey = [
    attendance.status,
    attendance.invitationId ?? 'none',
    attendance.deliveryStatus ?? 'none',
  ].join(':')

  if (attendance.status === 'pending') {
    return (
      <div className="space-y-2">
        <p role="status" className="break-words text-xs text-muted-foreground">
          {t('identityInvitation.pendingRecipient', { label: attendance.recipientLabel ?? '' })}
        </p>
        <IdentityLinkInvitationControl
          state="pending"
          partyLabel={partyLabel}
          copy={copy}
          presentation="stacked"
          disabled={disabled}
          resetKey={sharedResetKey}
          onCancel={cancel}
          onPendingChange={onPendingChange}
        />
      </div>
    )
  }

  if (attendance.status === 'accepted') {
    return (
      <IdentityLinkInvitationControl
        state="linked"
        partyLabel={partyLabel}
        copy={copy}
        presentation="stacked"
        disabled={disabled}
        resetKey={sharedResetKey}
      />
    )
  }

  const isEligibleState = attendance.status === 'not_invited'
    || TERMINAL_STATUSES.has(attendance.status)
  if (!isEligibleState) return null

  if (sourceKind === 'relationship' && !isTeskeidUser) {
    return (
      <p className="text-xs leading-5 text-muted-foreground">
        {t('identityInvitation.unavailableRelationship')}
      </p>
    )
  }

  if (sourceKind === 'manual_name' && !isTeskeidUser) {
    return (
      <div className="space-y-2">
        {attendance.status !== 'not_invited' ? (
          <p className="text-xs text-muted-foreground">
            {t(`attendance.${attendance.status}`)}
          </p>
        ) : null}
        <IdentityLinkInvitationControl
          state="eligible"
          partyLabel={partyLabel}
          copy={copy}
          presentation="stacked"
          disabled={disabled}
          resetKey={sharedResetKey}
          onInvite={(email) => invite(email)}
          onPendingChange={onPendingChange}
        />
      </div>
    )
  }

  async function inviteUsingPersistedIdentity() {
    if (disabled || inFlightRef.current) return
    inFlightRef.current = true
    setDirectPending(true)
    setDirectFeedback(null)
    onPendingChange(true)
    try {
      const result = await invite(null)
      setDirectFeedback(result.ok
        ? {
            kind: 'status',
            message: t('identityInvitation.sentNotice'),
          }
        : { kind: 'error', message: result.safeErrorMessage })
    } catch {
      setDirectFeedback({ kind: 'error', message: t('identityInvitation.genericError') })
    } finally {
      inFlightRef.current = false
      setDirectPending(false)
      onPendingChange(false)
    }
  }

  return (
    <div className="space-y-2">
      {attendance.status !== 'not_invited' ? (
        <p className="text-xs text-muted-foreground">{t(`attendance.${attendance.status}`)}</p>
      ) : null}
      {directFeedback?.kind === 'error' ? (
        <p ref={alertRef} tabIndex={-1} role="alert" className="text-sm text-destructive">
          {directFeedback.message}
        </p>
      ) : null}
      {directFeedback?.kind === 'status' ? (
        <p role="status" className="text-sm text-primary">{directFeedback.message}</p>
      ) : null}
      <TeskeidActionButton
        type="button"
        variant="secondary"
        className="w-full"
        pending={directPending}
        disabled={disabled || directPending}
        onClick={inviteUsingPersistedIdentity}
      >
        {directPending
          ? t('identityInvitation.submittingLabel')
          : t('identityInvitation.accessInviteTriggerLabel')}
      </TeskeidActionButton>
    </div>
  )
}
