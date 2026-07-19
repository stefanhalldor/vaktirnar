'use client'

import { useState, useEffect } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RouteMemoryPlace {
  key: string
  label: string
}

export interface RouteMemoryPickerLabels {
  titleLabel: string
  fromLabel: string
  toLabel: string
  clearLabel: string
  loadingText: string
  emptyText: string
  hintText: string
  ariaLabel: string
}

interface RouteMemoryPickerProps {
  onPlacesChange: (from: RouteMemoryPlace | null, to: RouteMemoryPlace | null) => void
  labels: RouteMemoryPickerLabels
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Route-memory-driven from/to picker for the /vedrid overview map.
 *
 * Replaces the Google PlaceSearch-based OverviewRouteLensPanel.
 * Shows cities that exist in route-memory as either a from- or to-place
 * (bidirectional: "Reykjavík → Akureyri" means both cities appear in step 1).
 * No Google API calls.
 *
 * Flow:
 *  1. Fetch /route-memory/places — union of all known cities (from + to).
 *  2. User picks first city.
 *  3. Fetch /route-memory/destinations?from= — counterparts in both directions.
 *  4. User picks second city → calls onPlacesChange with RouteMemoryPlace objects.
 *     Lookup endpoint handles reverse-direction matching automatically.
 *
 * If route-memory is empty, shows emptyText pointing to Ferðalagið.
 */
export function RouteMemoryPicker({ onPlacesChange, labels }: RouteMemoryPickerProps) {
  const [allPlaces, setAllPlaces] = useState<RouteMemoryPlace[] | null>(null)
  const [destinations, setDestinations] = useState<RouteMemoryPlace[] | null>(null)
  const [selectedFrom, setSelectedFrom] = useState<RouteMemoryPlace | null>(null)
  const [selectedTo, setSelectedTo] = useState<RouteMemoryPlace | null>(null)

  // Fetch all known places on mount, and refetch on window focus / tab visibility change.
  // This ensures a newly computed /ferdalagid route appears without a full page reload.
  useEffect(() => {
    function fetchPlaces() {
      fetch('/api/teskeid/weather/route-memory/places')
        .then(r => r.ok ? r.json() : { places: [] })
        .then((d: { places?: RouteMemoryPlace[] }) => setAllPlaces(d.places ?? []))
        .catch(() => setAllPlaces([]))
    }
    fetchPlaces()
    function handleRefetch() {
      if (document.visibilityState === 'hidden') return
      fetchPlaces()
    }
    window.addEventListener('focus', handleRefetch)
    document.addEventListener('visibilitychange', handleRefetch)
    return () => {
      window.removeEventListener('focus', handleRefetch)
      document.removeEventListener('visibilitychange', handleRefetch)
    }
  }, [])

  // Fetch counterpart destinations when a place is selected, and refetch on window focus / visibility change.
  useEffect(() => {
    if (!selectedFrom) {
      setDestinations(null)
      return
    }
    function fetchDestinations() {
      fetch(`/api/teskeid/weather/route-memory/destinations?from=${encodeURIComponent(selectedFrom!.key)}`)
        .then(r => r.ok ? r.json() : { destinations: [] })
        .then((d: { destinations?: RouteMemoryPlace[] }) => setDestinations(d.destinations ?? []))
        .catch(() => setDestinations([]))
    }
    fetchDestinations()
    function handleRefetch() {
      if (document.visibilityState === 'hidden') return
      fetchDestinations()
    }
    window.addEventListener('focus', handleRefetch)
    document.addEventListener('visibilitychange', handleRefetch)
    return () => {
      window.removeEventListener('focus', handleRefetch)
      document.removeEventListener('visibilitychange', handleRefetch)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFrom?.key])

  function handleFromSelect(place: RouteMemoryPlace) {
    setSelectedFrom(place)
    setSelectedTo(null)
    onPlacesChange(place, null)
  }

  function handleToSelect(place: RouteMemoryPlace) {
    if (!selectedFrom) return
    setSelectedTo(place)
    onPlacesChange(selectedFrom, place)
  }

  function handleClear() {
    setSelectedFrom(null)
    setSelectedTo(null)
    setDestinations(null)
    onPlacesChange(null, null)
  }

  // Loading
  if (allPlaces === null) {
    return (
      <div aria-label={labels.ariaLabel} className="flex flex-col gap-2">
        <span className="text-xs font-medium">{labels.titleLabel}</span>
        <p className="text-xs text-muted-foreground">{labels.loadingText}</p>
      </div>
    )
  }

  // Empty — no route-memory yet
  if (allPlaces.length === 0) {
    return (
      <div aria-label={labels.ariaLabel} className="flex flex-col gap-2">
        <span className="text-xs font-medium">{labels.titleLabel}</span>
        <p className="text-xs text-muted-foreground">{labels.emptyText}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3" aria-label={labels.ariaLabel}>

      <span className="text-xs font-medium">{labels.titleLabel}</span>

      {/* Step 1 — pick first place */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-muted-foreground">{labels.fromLabel}</span>
        {selectedFrom ? (
          <button
            type="button"
            onClick={handleClear}
            className="text-left text-base border border-border rounded-lg px-3 py-2 bg-background hover:border-foreground/50 transition-colors w-full truncate min-h-[44px]"
          >
            {selectedFrom.label}
          </button>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {allPlaces.map(place => (
              <button
                key={place.key}
                type="button"
                onClick={() => handleFromSelect(place)}
                className="px-3 py-1.5 text-sm rounded-full border border-border bg-background hover:border-foreground/50 hover:bg-foreground/5 active:bg-foreground/10 transition-colors min-h-[36px]"
              >
                {place.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Step 2 — pick counterpart place */}
      {selectedFrom && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">{labels.toLabel}</span>
          {selectedTo ? (
            <button
              type="button"
              onClick={() => {
                setSelectedTo(null)
                onPlacesChange(selectedFrom, null)
              }}
              className="text-left text-base border border-border rounded-lg px-3 py-2 bg-background hover:border-foreground/50 transition-colors w-full truncate min-h-[44px]"
            >
              {selectedTo.label}
            </button>
          ) : destinations === null ? (
            <p className="text-xs text-muted-foreground">{labels.loadingText}</p>
          ) : destinations.length === 0 ? (
            <p className="text-xs text-muted-foreground">{labels.emptyText}</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                {destinations.map(place => (
                  <button
                    key={place.key}
                    type="button"
                    onClick={() => handleToSelect(place)}
                    className="px-3 py-1.5 text-sm rounded-full border border-border bg-background hover:border-foreground/50 hover:bg-foreground/5 active:bg-foreground/10 transition-colors min-h-[36px]"
                  >
                    {place.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{labels.hintText}</p>
            </>
          )}
        </div>
      )}

      {/* Clear */}
      {(selectedFrom || selectedTo) && (
        <button
          type="button"
          onClick={handleClear}
          className="self-start text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {labels.clearLabel} ×
        </button>
      )}

    </div>
  )
}

