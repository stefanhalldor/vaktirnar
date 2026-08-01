'use client'

import { LocateFixed, Minus, Plus } from 'lucide-react'

export type LiveLocationUiStatus = 'idle' | 'waiting' | 'active' | 'error'

export function LiveLocationControls({
  status,
  statusLabel,
  actionLabel,
  actionPressed = false,
  onAction,
  zoom,
  zoomMin,
  zoomMax,
  zoomGroupLabel,
  zoomOutLabel,
  zoomInLabel,
  zoomValueLabel,
  onZoomChange,
}: {
  status: LiveLocationUiStatus
  statusLabel: string | null
  actionLabel?: string
  actionPressed?: boolean
  onAction?: () => void
  zoom: number
  zoomMin: number
  zoomMax: number
  zoomGroupLabel: string
  zoomOutLabel: string
  zoomInLabel: string
  zoomValueLabel: string
  onZoomChange: (delta: -1 | 1) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {actionLabel && onAction && (
        <button
          type="button"
          aria-pressed={actionPressed}
          onClick={onAction}
          className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            actionPressed
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border bg-background/85 text-foreground'
          }`}
        >
          <LocateFixed className="h-3.5 w-3.5" aria-hidden="true" />
          {actionLabel}
        </button>
      )}

      {status === 'active' && (
        <div
          role="group"
          aria-label={zoomGroupLabel}
          className="inline-flex h-10 items-center overflow-hidden rounded-full border border-border bg-background/85"
        >
          <button
            type="button"
            aria-label={zoomOutLabel}
            disabled={zoom <= zoomMin}
            onClick={() => onZoomChange(-1)}
            className="inline-flex h-10 w-10 items-center justify-center text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <Minus className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <span
            aria-live="polite"
            aria-label={zoomValueLabel}
            className="min-w-9 border-x border-border px-1 text-center text-[10px] font-semibold tabular-nums text-foreground"
          >
            {zoom}×
          </span>
          <button
            type="button"
            aria-label={zoomInLabel}
            disabled={zoom >= zoomMax}
            onClick={() => onZoomChange(1)}
            className="inline-flex h-10 w-10 items-center justify-center text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {statusLabel && (
        <span
          role={status === 'error' ? 'alert' : 'status'}
          aria-live="polite"
          className={`max-w-full text-[10px] leading-snug ${
            status === 'error' ? 'text-destructive' : 'text-muted-foreground'
          }`}
        >
          {statusLabel}
        </span>
      )}
    </div>
  )
}
