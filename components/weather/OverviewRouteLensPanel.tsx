'use client'

import { useState } from 'react'
import { resolveOverviewRouteLensCacheOnly } from '@/lib/iceland-routes/lensResolver'
import type { OverviewRouteLensResult } from '@/lib/iceland-routes/lensTypes'
import { PlaceSearch, type PlaceResult } from '@/components/weather/PlaceSearch'

interface OverviewRouteLensPanelLabels {
  fromLabel: string
  fromPlaceholder: string
  toLabel: string
  toPlaceholder: string
  provisionalBadge: string
  cacheMissText: string
  clearLabel: string
  ariaLabel: string
}

interface OverviewRouteLensPanelProps {
  result: OverviewRouteLensResult
  onResultChange: (result: OverviewRouteLensResult) => void
  /** Called whenever the selected from/to places change. Null means the field was cleared. */
  onPlacesChange?: (from: PlaceResult | null, to: PlaceResult | null) => void
  labels: OverviewRouteLensPanelLabels
}

type ActiveField = 'from' | 'to' | null

export function OverviewRouteLensPanel({
  result,
  onResultChange,
  onPlacesChange,
  labels,
}: OverviewRouteLensPanelProps) {
  const [fromPlace, setFromPlace] = useState<PlaceResult | null>(null)
  const [toPlace, setToPlace] = useState<PlaceResult | null>(null)
  // null on initial load — no autoFocus on first paint (prevents mobile keyboard pop)
  const [activeField, setActiveField] = useState<ActiveField>(null)

  function handleFromSelect(place: PlaceResult) {
    setFromPlace(place)
    // Auto-advance to Til if it isn't filled yet
    setActiveField(toPlace ? null : 'to')
    onPlacesChange?.(place, toPlace)
    if (toPlace) {
      onResultChange(
        resolveOverviewRouteLensCacheOnly({ from: place.name, to: toPlace.name }),
      )
    }
  }

  function handleToSelect(place: PlaceResult) {
    setToPlace(place)
    setActiveField(null)
    onPlacesChange?.(fromPlace, place)
    if (fromPlace) {
      onResultChange(
        resolveOverviewRouteLensCacheOnly({ from: fromPlace.name, to: place.name }),
      )
    }
  }

  function handleEditFrom() {
    setFromPlace(null)
    setToPlace(null)
    setActiveField('from')
    onPlacesChange?.(null, null)
    onResultChange({ status: 'idle' })
  }

  function handleEditTo() {
    setToPlace(null)
    setActiveField('to')
    onPlacesChange?.(fromPlace, null)
    onResultChange({ status: 'idle' })
  }

  function clear() {
    setFromPlace(null)
    setToPlace(null)
    setActiveField('from')
    onPlacesChange?.(null, null)
    onResultChange({ status: 'idle' })
  }

  const hasAnySelection = fromPlace !== null || toPlace !== null

  return (
    <div className="flex flex-col gap-3" aria-label={labels.ariaLabel}>

      {/* Frá — always visible */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">{labels.fromLabel}</label>
        {fromPlace && activeField !== 'from' ? (
          <button
            type="button"
            onClick={handleEditFrom}
            className="text-left text-base border border-border rounded-lg px-3 py-2 bg-background hover:border-foreground/50 transition-colors w-full truncate min-h-[44px]"
          >
            {fromPlace.name}
          </button>
        ) : (
          <PlaceSearch
            onPlaceSelected={handleFromSelect}
            placeholder={labels.fromPlaceholder}
            autoFocus={activeField === 'from' && fromPlace === null}
          />
        )}
      </div>

      {/* Til — always visible */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">{labels.toLabel}</label>
        {toPlace && activeField !== 'to' ? (
          <button
            type="button"
            onClick={handleEditTo}
            className="text-left text-base border border-border rounded-lg px-3 py-2 bg-background hover:border-foreground/50 transition-colors w-full truncate min-h-[44px]"
          >
            {toPlace.name}
          </button>
        ) : (
          <PlaceSearch
            onPlaceSelected={handleToSelect}
            placeholder={labels.toPlaceholder}
            autoFocus={activeField === 'to'}
          />
        )}
      </div>

      {/* Clear — shown once at least one place is selected */}
      {hasAnySelection && (
        <button
          type="button"
          onClick={clear}
          aria-label={labels.clearLabel}
          className="self-start text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {labels.clearLabel} ×
        </button>
      )}

      {/* Resolved: "Bráðabirgðaniðurstöður" badge + route family label */}
      {result.status === 'resolved' && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded whitespace-nowrap">
            {labels.provisionalBadge}
          </span>
          <span className="text-xs text-muted-foreground">
            {result.routeFamily.label}
          </span>
        </div>
      )}

      {/* Cache miss: explain (bottom Ferðalagið CTA handles navigation) */}
      {result.status === 'cache_miss' && (
        <p className="text-xs text-muted-foreground">{labels.cacheMissText}</p>
      )}

    </div>
  )
}
