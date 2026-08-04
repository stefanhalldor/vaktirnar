'use client'

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
        <button
          type="button"
          onClick={onDecline}
          disabled={isPending}
          className="min-h-11 flex-1 rounded-xl border border-border bg-card px-3 text-sm text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {declineLabel}
        </button>
        <button
          type="button"
          onClick={onAccept}
          disabled={isPending}
          className="min-h-11 flex-1 rounded-xl bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {acceptLabel}
        </button>
      </div>
    </div>
  )
}
