'use client'

import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { useTranslations } from 'next-intl'

/**
 * Compact preview card for a provider station on the route-selection map.
 *
 * Provider-neutral shell: accepts only the display fields the shell itself needs
 * (name, distance from route) plus a provider label and children for all
 * provider-specific content (forecast rows, road conditions, Púls links, etc.).
 * Vegagerðin and future providers can use this shell without any Veðurstofan types.
 *
 * Usage (Veðurstofan):
 *   <ProviderStationPreviewCard stationName={s.stationName} distanceM={s.distanceM}
 *     providerLabel={tf('providerVedurstofanLabel')} onClose={...}>
 *     <VedurstofanForecastSection ... />
 *     <VedurstofanPulseInline stationId={s.stationId} returnTo={returnTo} />
 *   </ProviderStationPreviewCard>
 */
export function ProviderStationPreviewCard({
  stationName,
  distanceM,
  providerLabel,
  onClose,
  children,
}: {
  stationName: string
  distanceM: number
  providerLabel: string
  onClose: () => void
  children?: ReactNode
}) {
  const tf = useTranslations('teskeid.vedrid.ferdalagid')
  const distanceKm = (distanceM / 1000).toFixed(1)

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
            <span className="text-[11px] text-muted-foreground">
              {tf('stationDistanceFromRoute', { km: distanceKm })}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={tf('stationPreviewClose')}
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
