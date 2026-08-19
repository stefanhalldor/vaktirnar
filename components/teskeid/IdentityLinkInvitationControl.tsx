'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Mail, RotateCcw, X } from 'lucide-react'
import { IdentityInvitationEmailForm } from './IdentityInvitationEmailForm'
import { TeskeidActionButton } from './TeskeidActionButton'

export type IdentityLinkInvitationState = 'hidden' | 'eligible' | 'pending' | 'linked'
export type IdentityLinkInvitationDelivery = 'sent' | 'already_sent' | 'failed' | 'uncertain'
export type IdentityLinkInvitationAction = 'invite' | 'resend' | 'cancel'

const CONTROLLED_REFRESH_LOCK_MS = 10_000

export type IdentityLinkInvitationFeedback = {
  kind: 'error' | 'status'
  message: string
}

export type IdentityLinkInvitationDeliveryResult =
  | { ok: true; delivery: IdentityLinkInvitationDelivery }
  | { ok: false; safeErrorMessage: string }

export type IdentityLinkInvitationCancelResult =
  | { ok: true }
  | { ok: false; safeErrorMessage: string }

export type IdentityLinkInvitationCopy = {
  triggerLabel: string
  emailLabel: string
  emailPlaceholder?: string
  submitLabel: string
  submittingLabel: string
  entryCancelLabel: string
  resendLabel: string
  resendPendingLabel?: string
  cancelInvitationLabel: string
  cancellingLabel?: string
  cancelInvitationConfirm?: string
  cancelledNotice: string
  sentNotice: string
  deliveryIssueNotice: string
  genericError: string
  linkedLabel?: string
}

export type IdentityLinkInvitationControlProps = {
  state: IdentityLinkInvitationState
  partyLabel: string
  copy: IdentityLinkInvitationCopy
  presentation?: 'compact' | 'stacked'
  disabled?: boolean
  resetKey?: string | number
  onInvite?: (email: string) => Promise<IdentityLinkInvitationDeliveryResult>
  onResend?: () => Promise<IdentityLinkInvitationDeliveryResult>
  onCancel?: () => Promise<IdentityLinkInvitationCancelResult>
  onCompleted?: (action: IdentityLinkInvitationAction) => void
  onPendingChange?: (pending: boolean) => void
  onEntryOpenChange?: (open: boolean) => void
  /** When provided, the adapter owns feedback placement (but never its contents). */
  onFeedback?: (feedback: IdentityLinkInvitationFeedback | null) => void
  /** Optional domain-neutral content shown above the shared email step. */
  entryContent?: ReactNode
  entrySubmitDisabled?: boolean
}

/**
 * Domain-neutral consent invitation UI for linking an existing named party.
 *
 * Domain adapters retain every authoritative identifier and server action in
 * their callback closures. This control receives only render-safe labels and
 * already translated, allowlisted feedback.
 */
export function IdentityLinkInvitationControl({
  state,
  partyLabel,
  copy,
  presentation = 'stacked',
  disabled = false,
  resetKey,
  onInvite,
  onResend,
  onCancel,
  onCompleted,
  onPendingChange,
  onEntryOpenChange,
  onFeedback,
  entryContent,
  entrySubmitDisabled = false,
}: IdentityLinkInvitationControlProps) {
  const [showEmail, setShowEmail] = useState(false)
  const [recipientEmail, setRecipientEmail] = useState('')
  const [pendingAction, setPendingAction] = useState<IdentityLinkInvitationAction | null>(null)
  const [awaitingControlledRefresh, setAwaitingControlledRefresh] = useState<
    'invite' | 'cancel' | null
  >(null)
  const [feedback, setFeedback] = useState<IdentityLinkInvitationFeedback | null>(null)
  const inFlightRef = useRef(false)
  const awaitingControlledRefreshRef = useRef<'invite' | 'cancel' | null>(null)
  const controlledRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const alertRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    if (!onFeedback && feedback?.kind === 'error') {
      alertRef.current?.focus()
    }
  }, [feedback, onFeedback])

  useEffect(() => {
    awaitingControlledRefreshRef.current = null
    if (controlledRefreshTimeoutRef.current !== null) {
      clearTimeout(controlledRefreshTimeoutRef.current)
      controlledRefreshTimeoutRef.current = null
    }
    setAwaitingControlledRefresh(null)
    if (state !== 'eligible' || resetKey !== undefined) {
      setShowEmail(false)
      setRecipientEmail('')
    }
  }, [resetKey, state])

  useEffect(() => () => {
    if (controlledRefreshTimeoutRef.current !== null) {
      clearTimeout(controlledRefreshTimeoutRef.current)
    }
  }, [])

  function publishFeedback(next: IdentityLinkInvitationFeedback | null) {
    if (onFeedback) onFeedback(next)
    else setFeedback(next)
  }

  function changeEmailEntry(open: boolean, clearFeedback = true) {
    setShowEmail(open)
    if (!open) setRecipientEmail('')
    if (clearFeedback) publishFeedback(null)
    onEntryOpenChange?.(open)
  }

  function lockUntilControlledRefresh(action: 'invite' | 'cancel') {
    awaitingControlledRefreshRef.current = action
    setAwaitingControlledRefresh(action)
    if (controlledRefreshTimeoutRef.current !== null) {
      clearTimeout(controlledRefreshTimeoutRef.current)
    }
    controlledRefreshTimeoutRef.current = setTimeout(() => {
      awaitingControlledRefreshRef.current = null
      controlledRefreshTimeoutRef.current = null
      setAwaitingControlledRefresh(null)
    }, CONTROLLED_REFRESH_LOCK_MS)
  }

  async function runAction<T extends IdentityLinkInvitationDeliveryResult | IdentityLinkInvitationCancelResult>(
    action: IdentityLinkInvitationAction,
    mutation: () => Promise<T>,
  ): Promise<T | null> {
    if (disabled || inFlightRef.current || awaitingControlledRefreshRef.current !== null) return null
    inFlightRef.current = true
    setPendingAction(action)
    publishFeedback(null)
    onPendingChange?.(true)
    try {
      return await mutation()
    } catch {
      publishFeedback({ kind: 'error', message: copy.genericError })
      return null
    } finally {
      inFlightRef.current = false
      setPendingAction(null)
      onPendingChange?.(false)
    }
  }

  function deliveryNotice(delivery: IdentityLinkInvitationDelivery): string {
    return delivery === 'sent' || delivery === 'already_sent'
      ? copy.sentNotice
      : copy.deliveryIssueNotice
  }

  async function invite() {
    if (!onInvite) return
    const result = await runAction('invite', () => onInvite(recipientEmail.trim()))
    if (!result) return
    if (!result.ok) {
      publishFeedback({ kind: 'error', message: result.safeErrorMessage })
      return
    }
    lockUntilControlledRefresh('invite')
    publishFeedback({ kind: 'status', message: deliveryNotice(result.delivery) })
    changeEmailEntry(false, false)
    onCompleted?.('invite')
  }

  async function resend() {
    if (!onResend) return
    const result = await runAction('resend', onResend)
    if (!result) return
    if (!result.ok) {
      publishFeedback({ kind: 'error', message: result.safeErrorMessage })
      return
    }
    publishFeedback({ kind: 'status', message: deliveryNotice(result.delivery) })
    onCompleted?.('resend')
  }

  async function cancelInvitation() {
    if (!onCancel) return
    if (copy.cancelInvitationConfirm && !window.confirm(copy.cancelInvitationConfirm)) return
    const result = await runAction('cancel', onCancel)
    if (!result) return
    if (!result.ok) {
      publishFeedback({ kind: 'error', message: result.safeErrorMessage })
      return
    }
    lockUntilControlledRefresh('cancel')
    publishFeedback({ kind: 'status', message: copy.cancelledNotice })
    onCompleted?.('cancel')
  }

  if (state === 'hidden') return null
  if (state === 'linked') {
    return copy.linkedLabel ? (
      <p className="text-xs text-muted-foreground">{copy.linkedLabel}</p>
    ) : null
  }

  const isBusy = disabled || pendingAction !== null || awaitingControlledRefresh !== null
  const compact = presentation === 'compact'

  return (
    <div
      role="group"
      aria-label={partyLabel}
      aria-busy={pendingAction !== null || awaitingControlledRefresh !== null || undefined}
      className={showEmail
        ? 'order-last min-w-0 w-full basis-full space-y-2'
        : 'min-w-0 space-y-2'}
    >
      {!onFeedback && feedback?.kind === 'error' ? (
        <p ref={alertRef} tabIndex={-1} role="alert" className="text-sm text-destructive">
          {feedback.message}
        </p>
      ) : null}
      {!onFeedback && feedback?.kind === 'status' ? (
        <p role="status" className="text-sm text-primary">{feedback.message}</p>
      ) : null}

      {state === 'eligible' ? showEmail ? (
        <fieldset disabled={isBusy} className="m-0 min-w-0 border-0 p-0">
          {entryContent ? <div className="mb-3">{entryContent}</div> : null}
          <IdentityInvitationEmailForm
            value={recipientEmail}
            label={copy.emailLabel}
            placeholder={copy.emailPlaceholder}
            submitLabel={copy.submitLabel}
            pendingLabel={copy.submittingLabel}
            cancelLabel={copy.entryCancelLabel}
            isPending={pendingAction === 'invite'}
            submitDisabled={entrySubmitDisabled}
            onChange={setRecipientEmail}
            onSubmit={invite}
            onCancel={() => changeEmailEntry(false)}
          />
        </fieldset>
      ) : (
        <TeskeidActionButton
          type="button"
          variant="secondary"
          className={compact ? 'shrink-0 gap-1.5 px-3' : 'w-full'}
          disabled={isBusy || !onInvite}
          onClick={() => changeEmailEntry(true)}
        >
          {compact ? <Mail aria-hidden size={16} /> : null}
          {copy.triggerLabel}
        </TeskeidActionButton>
      ) : (
        <div className={compact ? 'flex shrink-0 justify-end gap-1' : 'grid gap-2 sm:grid-cols-2'}>
          {onResend ? (
            <TeskeidActionButton
              type="button"
              variant="secondary"
              className={compact ? 'size-11 px-0' : undefined}
              aria-label={compact ? copy.resendLabel : undefined}
              disabled={isBusy}
              pending={pendingAction === 'resend'}
              onClick={resend}
            >
              {compact ? <RotateCcw aria-hidden size={16} /> : (
                pendingAction === 'resend'
                  ? copy.resendPendingLabel ?? copy.submittingLabel
                  : copy.resendLabel
              )}
            </TeskeidActionButton>
          ) : null}
          {onCancel ? (
            <TeskeidActionButton
              type="button"
              variant="danger"
              className={compact ? 'size-11 px-0' : undefined}
              aria-label={compact ? copy.cancelInvitationLabel : undefined}
              disabled={isBusy}
              pending={pendingAction === 'cancel'}
              onClick={cancelInvitation}
            >
              {compact ? <X aria-hidden size={16} /> : (
                pendingAction === 'cancel'
                  ? copy.cancellingLabel ?? copy.cancelInvitationLabel
                  : copy.cancelInvitationLabel
              )}
            </TeskeidActionButton>
          ) : null}
        </div>
      )}
    </div>
  )
}
