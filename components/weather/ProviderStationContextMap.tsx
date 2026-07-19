'use client'

import { IcelandOverviewMap } from '@/components/weather/IcelandOverviewMap'
import type { ProviderMapLayer, ProviderMapMarkerTone } from '@/lib/weather/types'

// ── Public contract ─────────────────────────────────────────────────────────

export type StationContextMarker = {
  /** Stable provider identifier, used to group map layers. */
  providerId: string
  /** Human-readable provider name shown in the legend (e.g. 'Vegagerðin'). */
  providerLabel: string
  id: string
  label: string
  lat: number
  lon: number
  tone: ProviderMapMarkerTone
  /** Optional short descriptor appended to name in legend, e.g. distance '18.3 km'. */
  meta?: string
}

interface ProviderStationContextMapProps {
  /** Primary/selected station — shown prominently in map and legend. */
  primary: StationContextMarker
  /** Related context stations (e.g. nearby forecast stations from another provider). */
  related?: StationContextMarker[]
  loadingLabel: string
  errorLabel: string
  /** Tailwind classes for the map container div. */
  className?: string
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Reusable provider-neutral station context map.
 *
 * Wraps IcelandOverviewMap in read-only mode. Station names are available
 * via marker title (hover/accessibility) but not shown as an overlay.
 *
 * Map layers are grouped by providerId: primary gets its own layer
 * (`${providerId}-selected`); related stations are grouped per provider
 * (`${providerId}-nearby`).
 */
export function ProviderStationContextMap({
  primary,
  related = [],
  loadingLabel,
  errorLabel,
  className = 'h-[160px] sm:h-[200px] w-full',
}: ProviderStationContextMapProps) {
  // Group related markers by providerId to build per-provider map layers.
  const relatedGroups = new Map<string, StationContextMarker[]>()
  for (const s of related) {
    const existing = relatedGroups.get(s.providerId) ?? []
    relatedGroups.set(s.providerId, [...existing, s])
  }

  const layers: ProviderMapLayer[] = [
    {
      layerId: `${primary.providerId}-selected`,
      providerLabel: primary.providerLabel,
      markers: [{
        id: primary.id,
        lat: primary.lat,
        lon: primary.lon,
        label: primary.label,
        tone: primary.tone,
        visible: true,
      }],
    },
    ...[...relatedGroups.entries()].map(([providerId, stations]) => ({
      layerId: `${providerId}-nearby`,
      providerLabel: stations[0].providerLabel,
      markers: stations.map(s => ({
        id: s.id,
        lat: s.lat,
        lon: s.lon,
        label: s.label,
        tone: s.tone,
        visible: true,
      })),
    })),
  ]

  return (
    <IcelandOverviewMap
      layers={layers}
      selected={null}
      onSelect={() => {}}
      loadingLabel={loadingLabel}
      errorLabel={errorLabel}
      className={className}
    />
  )
}
