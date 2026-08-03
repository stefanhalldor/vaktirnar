'use client'

import { useMemo, useState } from 'react'
import type { SelectedProviderMarker } from '@/lib/weather/types'
import { haversineDistanceM } from '@/lib/weather/nearestStations'
import { PlaceSearch, type PlaceResult } from './PlaceSearch'
import { ProviderStationContextMap, type StationContextMarker } from './ProviderStationContextMap'
import type { WeatherChaseItem } from './WeatherChasePanel'

export type WeatherChasePlaceFlowLabels = {
  chooseTitle: string
  chooseHint: string
  searchPlaceholder: string
  confirmTitle: string
  selectedPointLabel: string
  nearbyTitle: string
  distanceLabel: string
  noVedurstofanLabel: string
  backLabel: string
  cancelLabel: string
  saveLabel: string
  mapLoadingLabel: string
  mapErrorLabel: string
  metnoProviderLabel: string
  addNearbyPrompt: (place: string) => string
  addNearbyCancelLabel: string
  addNearbyConfirmLabel: string
}

export type NearbyWeatherChaseItem = WeatherChaseItem & { distanceM: number }

export function nearestWeatherChaseContextItems(
  place: Pick<PlaceResult, 'lat' | 'lon'>,
  items: readonly WeatherChaseItem[],
  providerId: 'vedurstofan' | 'metno',
  limit = 3,
): NearbyWeatherChaseItem[] {
  return items
    .filter(item => (
      item.providerId === providerId
      && !item.id.startsWith('metno:custom:')
      && typeof item.lat === 'number'
      && Number.isFinite(item.lat)
      && typeof item.lon === 'number'
      && Number.isFinite(item.lon)
      && (providerId !== 'vedurstofan' || item.rows.length > 0)
    ))
    .map(item => ({
      ...item,
      distanceM: haversineDistanceM(place, { lat: item.lat as number, lon: item.lon as number }),
    }))
    .sort((a, b) => a.distanceM - b.distanceM || a.label.localeCompare(b.label, 'is'))
    .slice(0, limit)
}

function distanceText(distanceM: number, locale: string): string {
  if (distanceM < 1_000) return `${Math.round(distanceM)} m`
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(distanceM / 1_000)} km`
}

export function WeatherChasePlaceFlow({
  items,
  labels,
  locale,
  onCancel,
  onSave,
  onAddNearbyItem,
}: {
  items: readonly WeatherChaseItem[]
  labels: WeatherChasePlaceFlowLabels
  locale: string
  onCancel: () => void
  onSave: (place: PlaceResult) => void
  onAddNearbyItem: (item: WeatherChaseItem) => void
}) {
  const [selectedPlace, setSelectedPlace] = useState<PlaceResult | null>(null)
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null)
  const nearbyVedurstofan = useMemo(
    () => selectedPlace ? nearestWeatherChaseContextItems(selectedPlace, items, 'vedurstofan', items.length) : [],
    [items, selectedPlace],
  )
  const nearbyMetno = useMemo(
    () => selectedPlace ? nearestWeatherChaseContextItems(selectedPlace, items, 'metno', items.length) : [],
    [items, selectedPlace],
  )
  const nearby = [...nearbyVedurstofan, ...nearbyMetno]
    .sort((a, b) => a.distanceM - b.distanceM || a.label.localeCompare(b.label, 'is'))
    .slice(0, 10)

  if (!selectedPlace) {
    return (
      <section className="space-y-3 border-y border-border py-3">
        <div>
          <h4 className="text-sm font-semibold text-foreground">{labels.chooseTitle}</h4>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{labels.chooseHint}</p>
        </div>
        <PlaceSearch
          autoFocus={false}
          placeholder={labels.searchPlaceholder}
          onPlaceSelected={setSelectedPlace}
          allowMapSelection
        />
        <button
          type="button"
          onClick={onCancel}
          className="min-h-10 rounded-lg px-2 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {labels.cancelLabel}
        </button>
      </section>
    )
  }

  const primary: StationContextMarker = {
    providerId: 'metno',
    providerLabel: labels.metnoProviderLabel,
    id: `selected:${selectedPlace.lat}:${selectedPlace.lon}`,
    label: selectedPlace.name,
    lat: selectedPlace.lat,
    lon: selectedPlace.lon,
    tone: 'ok',
  }
  const related: StationContextMarker[] = nearby.map((item, index) => ({
    providerId: item.providerId,
    providerLabel: item.providerLabel,
    id: item.id,
    label: item.label,
    lat: item.lat as number,
    lon: item.lon as number,
    tone: item.providerId === 'vedurstofan' ? 'warning' : 'muted',
    meta: distanceText(item.distanceM, locale),
    markerLabel: String(index + 1),
  }))
  const selectedStation = nearby.find(item => item.id === selectedStationId)
  const selectedMarker: SelectedProviderMarker | null = selectedStation
    ? { layerId: `${selectedStation.providerId}-nearby`, markerId: selectedStation.id }
    : null

  const selectMarker = (selected: SelectedProviderMarker | null) => {
    setSelectedStationId(selected?.markerId ?? null)
  }

  return (
    <section className="space-y-3 border-y border-border py-3">
      <div>
        <h4 className="text-sm font-semibold text-foreground">{labels.confirmTitle}</h4>
        <p className="mt-1 text-sm font-medium text-foreground">{selectedPlace.name}</p>
        <p className="text-xs text-muted-foreground">{labels.selectedPointLabel}</p>
      </div>
      <ProviderStationContextMap
        primary={primary}
        related={related}
        loadingLabel={labels.mapLoadingLabel}
        errorLabel={labels.mapErrorLabel}
        className="h-[220px] w-full sm:h-[260px]"
        selected={selectedMarker}
        onSelect={selectMarker}
      />
      <button
        type="button"
        onClick={() => onSave(selectedPlace)}
        className="min-h-11 w-full rounded-lg bg-green-700 px-3 py-2 text-sm font-semibold text-white hover:bg-green-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
      >
        {labels.saveLabel}
      </button>
      {selectedStation && (
        <div role="dialog" aria-modal="false" aria-labelledby="add-nearby-station-title" className="rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p id="add-nearby-station-title" className="text-sm font-semibold text-foreground">
            {labels.addNearbyPrompt(selectedStation.label)}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setSelectedStationId(null)}
              className="min-h-11 rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {labels.addNearbyCancelLabel}
            </button>
            <button
              type="button"
              onClick={() => onAddNearbyItem(selectedStation)}
              className="min-h-11 rounded-lg bg-green-700 px-3 py-2 text-sm font-semibold text-white hover:bg-green-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
            >
              {labels.addNearbyConfirmLabel}
            </button>
          </div>
        </div>
      )}
      <div data-testid="nearby-weather-points" className="divide-y divide-border border-y border-border">
        <p className="py-2 text-xs font-semibold text-muted-foreground">{labels.nearbyTitle}</p>
        {nearby.map((item, index) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={selectedStationId === item.id}
            onClick={() => setSelectedStationId(item.id)}
            className="grid min-h-12 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-2.5 text-left text-sm hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring aria-pressed:bg-muted"
          >
            <span className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${item.providerId === 'vedurstofan' ? 'bg-amber-600' : 'bg-gray-500'}`}>
              {index + 1}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-medium text-foreground">{item.label}</span>
              <span className="block text-xs text-muted-foreground">{item.providerLabel}</span>
            </span>
            <span className="self-center text-xs text-muted-foreground">
              {labels.distanceLabel} {distanceText(item.distanceM, locale)}
            </span>
          </button>
        ))}
        {nearbyVedurstofan.length === 0 && (
          <p className="py-2.5 text-xs text-muted-foreground">{labels.noVedurstofanLabel}</p>
        )}
      </div>
      <div>
        <button
          type="button"
          onClick={() => setSelectedPlace(null)}
          className="min-h-11 w-full rounded-lg border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {labels.backLabel}
        </button>
      </div>
    </section>
  )
}
