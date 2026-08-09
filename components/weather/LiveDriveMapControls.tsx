'use client'

import type { ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

export function LiveDriveMapControls({
  collapsed,
  onCollapsedChange,
  expandLabel,
  collapseLabel,
  currentLabel,
  currentColor,
  currentActive,
  onSelectCurrent,
  planLabel,
  onPlan,
  children,
  footer,
  collapsedAlert,
}: {
  collapsed: boolean
  onCollapsedChange: (collapsed: boolean) => void
  expandLabel: string
  collapseLabel: string
  currentLabel: string
  currentColor: string
  currentActive: boolean
  onSelectCurrent: () => void
  planLabel: string
  onPlan: () => void
  children: ReactNode
  footer?: ReactNode
  collapsedAlert?: ReactNode
}) {
  return (
    <div className="relative px-3 pb-2 pt-2">
      {collapsed && collapsedAlert && (
        <div
          role="alert"
          className="pointer-events-none absolute bottom-full left-3 right-3 mb-2 rounded-lg border border-amber-300 bg-amber-50/95 px-3 py-2 text-xs leading-snug text-amber-950 shadow-md backdrop-blur-sm dark:border-amber-700 dark:bg-amber-950/90 dark:text-amber-100"
        >
          {collapsedAlert}
        </div>
      )}
      {collapsed ? (
        <button
          type="button"
          aria-expanded="false"
          aria-controls="road-map-live-drive-settings"
          onClick={() => onCollapsedChange(false)}
          className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-1 text-left text-xs font-semibold text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span>{expandLabel}</span>
          <ChevronUp className="h-4 w-4 shrink-0" aria-hidden="true" />
        </button>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <button
                type="button"
                aria-pressed={currentActive}
                onClick={onSelectCurrent}
                className={`min-h-10 rounded-lg border px-3 py-1.5 text-left text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                  currentActive
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-background/85 text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="flex items-center gap-1.5 font-semibold">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: currentColor }}
                    aria-hidden="true"
                  />
                  {currentLabel}
                </span>
              </button>
              <button
                type="button"
                onClick={onPlan}
                className="min-h-10 rounded-full border border-border bg-background/85 px-3 py-1.5 text-left text-[11px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <span className="font-semibold">{planLabel}</span>
              </button>
            </div>
            <button
              type="button"
              aria-expanded="true"
              aria-controls="road-map-live-drive-settings"
              aria-label={collapseLabel}
              title={collapseLabel}
              onClick={() => onCollapsedChange(true)}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-background/85 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div
            id="road-map-live-drive-settings"
            className="max-h-[36dvh] space-y-1.5 overflow-y-auto overscroll-contain pr-0.5"
          >
            {children}
          </div>
        </div>
      )}
      {footer}
    </div>
  )
}
