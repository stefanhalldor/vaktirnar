'use client'

import type { ReactNode } from 'react'
import { X } from 'lucide-react'

/**
 * Compact preview card for a provider station — usable in both route-selection
 * and overview-map contexts.
 *
 * Provider-neutral shell: accepts only the display fields the shell needs
 * (name, provider label, optional context line) plus children for all
 * provider-specific content (forecast rows, road conditions, Púls links, etc.).
 *
 * `contextLine` is an optional ReactNode rendered below the provider badge.
 * Route wizard passes the "X km frá veginum" distance string here.
 * Overview map omits it entirely (no active route distance).
 *
 * Usage (route wizard):
 *   <ProviderStationPreviewCard stationName={s.stationName}
 *     contextLine={tf('stationDistanceFromRoute', { km: ... })}
 *     providerLabel={tf('providerVedurstofanLabel')} onClose={...}>
 *     <VedurstofanForecastSection ... />
 *     <VedurstofanPulseInline stationId={s.stationId} returnTo={returnTo} />
 *   </ProviderStationPreviewCard>
 *
 * Usage (overview map):
 *   <ProviderStationPreviewCard stationName={s.stationName}
 *     providerLabel="Veðurstofan" onClose={...}>
 *     ...
 *   </ProviderStationPreviewCard>
 */
export function ProviderStationPreviewCard({
  stationName,
  contextLine,
  providerLabel,
  closeLabel,
  onClose,
  children,
}: {
  stationName: string
  /** Optional context text rendered below the provider badge (e.g. distance from route). */
  contextLine?: ReactNode
  providerLabel: string
  /** Accessible label for the close button. Must be translated by the caller. */
  closeLabel: string
  onClose: () => void
  children?: ReactNode
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{stationName}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center rounded-full bg-muted border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {providerLabel}
            </span>
            {contextLine && (
              <span className="text-[11px] text-muted-foreground">{contextLine}</span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="shrink-0 h-10 w-10 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
        >
          <X size={14} aria-hidden />
        </button>
      </div>

      {/* Provider-specific content: forecast rows, road conditions, Púls links, etc. */}
      {children}
    </div>
  )
}
