import { ExternalLink } from 'lucide-react'

export function VegagerdinStaleNotice({
  message,
  isVeryStale,
  timeDetails,
  statusLabel,
  linkLabel,
  linkAriaLabel,
}: {
  message: string
  isVeryStale: boolean
  timeDetails: string
  statusLabel: string
  linkLabel: string
  linkAriaLabel: string
}) {
  return (
    <div
      className={`pointer-events-none rounded-lg border bg-amber-50/95 px-3 py-2 text-xs leading-snug text-amber-950 shadow-md backdrop-blur-sm dark:bg-amber-950/90 dark:text-amber-100 ${
        isVeryStale
          ? 'border-amber-500 dark:border-amber-500'
          : 'border-amber-300 dark:border-amber-700'
      }`}
    >
      {isVeryStale ? (
        <p role="alert" className="font-medium">
          {message}
        </p>
      ) : (
        <>
          <span role="status" className="sr-only">{statusLabel}</span>
          <p aria-hidden="true">{message}</p>
        </>
      )}

      <span role="status" className="sr-only">{timeDetails}</span>

      {isVeryStale && (
        <>
          <p
            aria-hidden="true"
            className="mt-1 text-[11px] text-amber-900 dark:text-amber-200"
          >
            {timeDetails}
          </p>
          <a
            href="https://umferdin.is/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label={linkAriaLabel}
            className="pointer-events-auto mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-amber-700/30 bg-background px-3 py-2 font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {linkLabel}
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        </>
      )}
    </div>
  )
}
