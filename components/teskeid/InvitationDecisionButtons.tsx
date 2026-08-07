'use client'

import { TeskeidActionButton } from './TeskeidActionButton'

type InvitationDecisionButtonsProps = {
  acceptLabel: string
  declineLabel: string
  isPending: boolean
  error?: string | null
  onAccept: () => void
  onDecline: () => void
}

/** Shared, domain-neutral controls for an explicit invitation decision. */
export function InvitationDecisionButtons({
  acceptLabel,
  declineLabel,
  isPending,
  error,
  onAccept,
  onDecline,
}: InvitationDecisionButtonsProps) {
  return (
    <div className="flex flex-col gap-3" aria-busy={isPending}>
      {error ? (
        <p role="alert" tabIndex={-1} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex gap-3">
        <TeskeidActionButton
          type="button"
          variant="secondary"
          onClick={onDecline}
          disabled={isPending}
          className="flex-1"
        >
          {declineLabel}
        </TeskeidActionButton>
        <TeskeidActionButton
          type="button"
          variant="primary"
          onClick={onAccept}
          disabled={isPending}
          className="flex-1"
        >
          {acceptLabel}
        </TeskeidActionButton>
      </div>
    </div>
  )
}
