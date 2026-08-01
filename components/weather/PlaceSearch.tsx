'use client'

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type Ref,
} from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { LocateFixed, MapPinned, Search, X } from 'lucide-react'
import { PlaceMapPicker } from './PlaceMapPicker'
import { PlaceDataAttributions } from './PlaceDataAttributions'
import { PlaceResultIdentity } from './PlaceResultIdentity'
import type {
  PlaceRoutingReference,
  PlaceSource,
  PlaceType,
  SelectedLocation,
} from '@/lib/places/types'
import {
  CurrentLocationError,
  getCurrentLocation,
  type CurrentLocationErrorCode,
} from '@/lib/places/currentLocation.client'
import { getPlaceAccessibleLabel } from '@/lib/places/display'

/** Backwards-compatible public name used by existing weather consumers. */
export type PlaceResult = Omit<SelectedLocation, 'source'> & {
  /** UI compatibility while legacy curated/static locations are consolidated. */
  source: Exclude<PlaceSource, 'curated'>
  /** Transitional aliases for consumers that have not moved to routingRef yet. */
  googlePlaceId?: string
  placeId?: string
}

/** Minimal shape required by PlaceSearch; compatible with SavedWeatherPlace. */
export type SavedPlace = {
  id: string
  name: string
  formattedAddress?: string
  lat: number
  lon: number
  source?: PlaceSource
  labelSource?: PlaceSource
  sourceId?: string
  postalCode?: string
  municipality?: string
  municipalityCode?: string
  postalLocality?: string
  placeType?: PlaceType
  accuracyM?: number
  routingRef?: PlaceRoutingReference
  googlePlaceId?: string
  /** Transitional compatibility for pre-HMS saved values. */
  placeId?: string
}

export type PlaceExclusion = {
  id?: string
  source?: string
  sourceId?: string
  routingRef?: PlaceRoutingReference
  googlePlaceId?: string
  placeId?: string
  lat: number
  lon: number
}

export type SelectedPlaceDisplay = Pick<SelectedLocation, 'name'>
  & Partial<Omit<SelectedLocation, 'name'>>

export type PlaceSearchProps = {
  onPlaceSelected: (place: PlaceResult) => void
  onCancel?: () => void
  autoFocus?: boolean
  placeholder?: string
  ariaLabel?: string
  savedPlaces?: readonly SavedPlace[]
  onDeleteSavedPlace?: (id: string) => void
  /** Controlled query value. Omit to let PlaceSearch own the query. */
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  /** Places hidden from both live and saved results, e.g. the opposite route endpoint. */
  excludePlaces?: readonly PlaceExclusion[]
  allowCurrentLocation?: boolean
  /** Keep the explicit current-location action visible above the mobile breakpoint. */
  showCurrentLocationOnAllViewports?: boolean
  onResultsChange?: (results: PlaceResult[]) => void
  variant?: 'default' | 'compact'
  /** Optional focus handoff for route forms that keep both fields mounted. */
  inputRef?: Ref<HTMLInputElement>
  /** Canonical place already chosen by the parent. Shown as a visible confirmation card. */
  selectedPlace?: SelectedPlaceDisplay | null
  onClearSelectedPlace?: () => void
  allowMapSelection?: boolean
}

const EMPTY_PLACE_EXCLUSIONS: readonly PlaceExclusion[] = []

type SearchResponse = { results?: unknown }

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function routingReference(value: unknown): PlaceRoutingReference | undefined {
  if (!value || typeof value !== 'object') return undefined
  const candidate = value as Record<string, unknown>
  const placeId = stringValue(candidate.placeId)
  return candidate.provider === 'google' && placeId
    ? { provider: 'google', placeId }
    : undefined
}

function normalizedPlaceType(value: unknown): PlaceResult['placeType'] {
  return value === 'settlement' || value === 'address' || value === 'point'
    ? value
    : undefined
}

function optionalPlaceSource(value: unknown): PlaceSource | undefined {
  if (
    value === 'hms' ||
    value === 'device' ||
    value === 'map' ||
    value === 'saved' ||
    value === 'static' ||
    value === 'official' ||
    value === 'google' ||
    value === 'curated'
  ) {
    return value
  }
  return undefined
}

function normalizedSource(value: unknown): PlaceResult['source'] {
  const source = optionalPlaceSource(value)
  if (source && source !== 'curated') return source
  // `curated` is the old name for the provider-neutral local directory.
  // Unknown/missing provenance must never be promoted to a Google identity.
  return 'static'
}

function generatedPlaceId(
  source: string,
  sourceId: string | undefined,
  name: string,
  lat: number,
  lon: number,
): string {
  return sourceId
    ? `${source}:${sourceId}`
    : `${source}:${name}:${lat.toFixed(6)}:${lon.toFixed(6)}`
}

function parsePlace(raw: unknown): PlaceResult | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  const name = stringValue(value.name ?? value.displayName)
  const lat = finiteNumber(value.lat)
  const lon = finiteNumber(value.lon ?? value.lng)
  if (!name || lat === undefined || lon === undefined) return null

  const source = normalizedSource(value.source)
  const sourceId = stringValue(value.sourceId)
  const legacyGooglePlaceId = stringValue(value.googlePlaceId ?? value.placeId)
  const parsedRoutingRef = routingReference(value.routingRef)
    ?? (source === 'google' && legacyGooglePlaceId
      ? { provider: 'google', placeId: legacyGooglePlaceId }
      : undefined)
  return {
    id: stringValue(value.id) ?? generatedPlaceId(source, sourceId, name, lat, lon),
    name,
    formattedAddress: stringValue(value.formattedAddress ?? value.address) ?? name,
    lat,
    lon,
    source,
    labelSource: optionalPlaceSource(value.labelSource),
    sourceId,
    postalCode: stringValue(value.postalCode),
    postalLocality: stringValue(value.postalLocality),
    municipality: stringValue(value.municipality),
    municipalityCode: stringValue(value.municipalityCode),
    placeType: normalizedPlaceType(value.placeType),
    accuracyM: finiteNumber(value.accuracyM),
    routingRef: parsedRoutingRef,
    googlePlaceId: parsedRoutingRef?.placeId,
    placeId: parsedRoutingRef?.placeId,
  }
}

function parseSearchResults(payload: unknown): PlaceResult[] {
  const results = (payload as SearchResponse | null)?.results
  if (!Array.isArray(results)) return []
  const seen = new Set<string>()
  return results
    .map(parsePlace)
    .filter((place): place is PlaceResult => place !== null)
    .filter(place => {
      const identity = place.sourceId
        ? `${place.source}:${place.sourceId}`
        : place.id ?? `${place.source}:${coordinateKey(place)}`
      if (seen.has(identity)) return false
      seen.add(identity)
      return true
    })
}

function coordinateKey(place: Pick<PlaceResult, 'lat' | 'lon'>): string {
  return `${place.lat.toFixed(5)}:${place.lon.toFixed(5)}`
}

function samePlace(
  place: Pick<PlaceResult, 'id' | 'source' | 'sourceId' | 'routingRef' | 'googlePlaceId' | 'placeId' | 'lat' | 'lon'>,
  exclusion: PlaceExclusion,
): boolean {
  if (exclusion.id && place.id === exclusion.id) return true
  if (
    place.sourceId &&
    exclusion.sourceId &&
    place.source === exclusion.source &&
    place.sourceId === exclusion.sourceId
  ) {
    return true
  }
  if (
    place.routingRef?.provider === 'google' &&
    exclusion.routingRef?.provider === 'google' &&
    place.routingRef.placeId === exclusion.routingRef.placeId
  ) {
    return true
  }
  if (place.googlePlaceId && place.googlePlaceId === exclusion.googlePlaceId) return true
  if (place.placeId && place.placeId === exclusion.placeId) return true
  return coordinateKey(place) === coordinateKey(exclusion)
}

function savedPlaceResult(place: SavedPlace): PlaceResult {
  const source: PlaceResult['source'] = place.source === 'curated'
    ? 'static'
    : place.source ?? 'saved'
  const legacyGooglePlaceId = place.googlePlaceId ?? place.placeId
  const routingRef = place.routingRef
    ?? (source === 'google' && legacyGooglePlaceId
      ? { provider: 'google' as const, placeId: legacyGooglePlaceId }
      : undefined)
  return {
    id: place.id,
    name: place.name,
    formattedAddress: place.formattedAddress ?? place.name,
    lat: place.lat,
    lon: place.lon,
    source,
    labelSource: place.labelSource,
    sourceId: place.sourceId,
    postalCode: place.postalCode,
    postalLocality: place.postalLocality,
    municipality: place.municipality,
    municipalityCode: place.municipalityCode,
    placeType: place.placeType,
    accuracyM: place.accuracyM,
    routingRef,
    googlePlaceId: routingRef?.placeId,
    placeId: routingRef?.placeId,
  }
}

function currentLocationMessageKey(code: CurrentLocationErrorCode):
  | 'currentLocationPermissionDenied'
  | 'currentLocationUnavailable'
  | 'currentLocationTimeout'
  | 'currentLocationOutsideIceland'
  | 'currentLocationInsecureContext' {
  if (code === 'permission_denied') return 'currentLocationPermissionDenied'
  if (code === 'timeout') return 'currentLocationTimeout'
  if (code === 'outside_iceland') return 'currentLocationOutsideIceland'
  if (code === 'insecure_context') return 'currentLocationInsecureContext'
  return 'currentLocationUnavailable'
}

export function PlaceSearch({
  onPlaceSelected,
  onCancel,
  autoFocus = true,
  placeholder,
  ariaLabel,
  savedPlaces,
  onDeleteSavedPlace,
  value,
  defaultValue = '',
  onValueChange,
  excludePlaces = EMPTY_PLACE_EXCLUSIONS,
  allowCurrentLocation = false,
  showCurrentLocationOnAllViewports = false,
  onResultsChange,
  variant = 'default',
  inputRef,
  selectedPlace = null,
  onClearSelectedPlace,
  allowMapSelection = true,
}: PlaceSearchProps) {
  const t = useTranslations('teskeid.vedrid.placeSearch')
  const locale = useLocale()
  const generatedId = useId()
  const inputId = `place-search-${generatedId}`
  const listboxId = `${inputId}-results`
  const statusId = `${inputId}-status`
  const errorId = `${inputId}-error`
  const permissionHelpId = `${inputId}-location-permission-help`
  const [internalValue, setInternalValue] = useState(defaultValue)
  const query = value === undefined ? internalValue : value
  const [results, setResults] = useState<PlaceResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searchComplete, setSearchComplete] = useState(false)
  const [fetchError, setFetchError] = useState<'generic' | 'rate_limited' | null>(null)
  const [focused, setFocused] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [locationLoading, setLocationLoading] = useState(false)
  const [locationError, setLocationError] = useState<CurrentLocationErrorCode | null>(null)
  const [showEnglishPermissionHelp, setShowEnglishPermissionHelp] = useState(false)
  const [mapPickerOpen, setMapPickerOpen] = useState(false)
  const [mapPickerPlaces, setMapPickerPlaces] = useState<PlaceResult[]>([])
  const localInputRef = useRef<HTMLInputElement | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchAbortRef = useRef<AbortController | null>(null)
  const locationAbortRef = useRef<AbortController | null>(null)
  const requestIdRef = useRef(0)
  const lastNotifiedResultsRef = useRef<string | null>(null)

  const visibleResults = useMemo(
    () => results.filter(place => !excludePlaces.some(exclusion => samePlace(place, exclusion))),
    [excludePlaces, results],
  )
  const visibleSavedPlaces = useMemo(
    () => (savedPlaces ?? []).filter(place => {
      const result = savedPlaceResult(place)
      return !excludePlaces.some(exclusion => samePlace(result, exclusion))
    }),
    [excludePlaces, savedPlaces],
  )

  const trimmedQuery = selectedPlace ? '' : query.trim()
  const resultsOpen = focused && !dismissed && visibleResults.length > 0
  const noResults = searchComplete && !loading && !fetchError && visibleResults.length === 0
  const interfaceUsesEnglish = locale.toLowerCase().startsWith('en')
  const permissionHelpUsesEnglish = interfaceUsesEnglish || showEnglishPermissionHelp
  const settlementTypeLabel = t('placeTypeSettlement')
  const addressTypeLabel = t('placeTypeAddress')
  const accessiblePlaceLabel = (place: PlaceResult | SavedPlace) => getPlaceAccessibleLabel(
    place,
    place.placeType === 'settlement'
      ? settlementTypeLabel
      : place.placeType === 'address'
        ? addressTypeLabel
        : null,
  )
  const describedBy = [loading ? statusId : null, fetchError ? errorId : null]
    .filter(Boolean)
    .join(' ') || undefined

  const mergedInputRef = useCallback((node: HTMLInputElement | null) => {
    localInputRef.current = node
    if (typeof inputRef === 'function') {
      inputRef(node)
    } else if (inputRef) {
      ;(inputRef as { current: HTMLInputElement | null }).current = node
    }
  }, [inputRef])

  function updateQuery(next: string) {
    if (value === undefined) setInternalValue(next)
    onValueChange?.(next)
  }

  function selectPlace(place: PlaceResult) {
    searchAbortRef.current?.abort()
    requestIdRef.current += 1
    setResults([])
    setLoading(false)
    setSearchComplete(false)
    setFetchError(null)
    setDismissed(true)
    setActiveIndex(-1)
    updateQuery('')
    onPlaceSelected(place)
  }

  useEffect(() => {
    const signature = visibleResults
      .map(place => [
        place.id,
        place.source,
        place.labelSource,
        place.sourceId,
        place.name,
        place.formattedAddress,
        place.placeType,
        place.postalCode,
        place.postalLocality,
        place.municipality,
        place.municipalityCode,
        place.lat,
        place.lon,
      ].join(':'))
      .join('|')
    if (lastNotifiedResultsRef.current === signature) return
    lastNotifiedResultsRef.current = signature
    onResultsChange?.(visibleResults)
  }, [onResultsChange, visibleResults])

  useEffect(() => {
    if (activeIndex >= visibleResults.length) {
      setActiveIndex(visibleResults.length > 0 ? visibleResults.length - 1 : -1)
    }
  }, [activeIndex, visibleResults.length])

  useEffect(() => {
    if (!resultsOpen || activeIndex < 0) return
    document.getElementById(`${listboxId}-option-${activeIndex}`)?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, listboxId, resultsOpen])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    searchAbortRef.current?.abort()
    requestIdRef.current += 1
    const requestId = requestIdRef.current
    setResults([])
    setActiveIndex(-1)
    setSearchComplete(false)
    setFetchError(null)

    if (trimmedQuery.length < 2) {
      setLoading(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController()
      searchAbortRef.current = controller
      setLoading(true)
      try {
        const response = await fetch('/api/place/search', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: trimmedQuery }),
          signal: controller.signal,
        })
        if (controller.signal.aborted || requestId !== requestIdRef.current) return
        if (!response.ok) {
          throw new Error(response.status === 429 ? 'rate_limited' : 'place_search_failed')
        }
        const payload = await response.json().catch(() => null)
        if (controller.signal.aborted || requestId !== requestIdRef.current) return
        setResults(parseSearchResults(payload))
        setSearchComplete(true)
      } catch (error) {
        if (controller.signal.aborted || requestId !== requestIdRef.current) return
        setResults([])
        setFetchError(
          error instanceof Error && error.message === 'rate_limited'
            ? 'rate_limited'
            : 'generic',
        )
        setSearchComplete(true)
      } finally {
        if (!controller.signal.aborted && requestId === requestIdRef.current) {
          setLoading(false)
        }
      }
    }, 250)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [trimmedQuery])

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    searchAbortRef.current?.abort()
    locationAbortRef.current?.abort()
  }, [])

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      if (resultsOpen) event.preventDefault()
      setDismissed(true)
      setActiveIndex(-1)
      return
    }
    if (visibleResults.length === 0) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setDismissed(false)
      setActiveIndex(current => current < visibleResults.length - 1 ? current + 1 : 0)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setDismissed(false)
      setActiveIndex(current => current > 0 ? current - 1 : visibleResults.length - 1)
    } else if (event.key === 'Home' && resultsOpen) {
      event.preventDefault()
      setActiveIndex(0)
    } else if (event.key === 'End' && resultsOpen) {
      event.preventDefault()
      setActiveIndex(visibleResults.length - 1)
    } else if (event.key === 'Enter' && resultsOpen && activeIndex >= 0) {
      event.preventDefault()
      selectPlace(visibleResults[activeIndex])
    }
  }

  async function handleCurrentLocation() {
    if (locationLoading) return
    locationAbortRef.current?.abort()
    const controller = new AbortController()
    locationAbortRef.current = controller
    setLocationLoading(true)
    setLocationError(null)

    try {
      const place = await getCurrentLocation({
        fallbackName: t('currentLocationName'),
        formatNearbyLabel: placeName => t('currentLocationNear', { place: placeName }),
        signal: controller.signal,
      })
      if (!controller.signal.aborted) selectPlace(place)
    } catch (error) {
      if (controller.signal.aborted) return
      setLocationError(
        error instanceof CurrentLocationError ? error.code : 'position_unavailable',
      )
    } finally {
      if (!controller.signal.aborted) setLocationLoading(false)
    }
  }

  function openMapPicker() {
    setMapPickerPlaces(visibleResults)
    setMapPickerOpen(true)
  }

  function clearSelectedPlace() {
    onClearSelectedPlace?.()
    window.setTimeout(() => localInputRef.current?.focus(), 0)
  }

  const compact = variant === 'compact'

  if (selectedPlace) {
    const accuracy = selectedPlace.accuracyM === undefined
      ? null
      : t('currentLocationAccuracy', { meters: Math.round(selectedPlace.accuracyM) })
    return (
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex min-h-14 items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
          <MapPinned size={17} className="mt-0.5 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {t('selectedLocationLabel')}
            </p>
            <PlaceResultIdentity place={selectedPlace} />
            {accuracy && <p className="text-xs text-muted-foreground">{accuracy}</p>}
          </div>
          {onClearSelectedPlace && (
            <button
              type="button"
              onClick={clearSelectedPlace}
              className="min-h-10 shrink-0 rounded-md px-2 text-xs font-medium text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t('changeSelectedPlace')}
            </button>
          )}
        </div>
        <PlaceDataAttributions places={[selectedPlace]} className="px-1" />
      </div>
    )
  }

  return (
    <div
      className={`flex flex-col ${compact ? 'gap-1.5' : 'gap-2'}`}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setFocused(false)
          setActiveIndex(-1)
        }
      }}
    >
      <div className="relative">
        <Search
          size={14}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          ref={mergedInputRef}
          id={inputId}
          type="text"
          value={query}
          onChange={(event) => {
            updateQuery(event.target.value)
            setDismissed(false)
            setLocationError(null)
          }}
          onFocus={() => setDismissed(false)}
          onKeyDown={handleInputKeyDown}
          placeholder={placeholder ?? t('placeholder')}
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-label={ariaLabel ?? t('ariaLabel')}
          aria-autocomplete="list"
          aria-expanded={resultsOpen}
          aria-controls={resultsOpen ? listboxId : undefined}
          aria-activedescendant={
            resultsOpen && activeIndex >= 0
              ? `${listboxId}-option-${activeIndex}`
              : undefined
          }
          aria-busy={loading}
          aria-invalid={fetchError ? true : undefined}
          aria-describedby={describedBy}
          className={`h-10 w-full border bg-card pl-8 pr-4 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:ring-2 focus:ring-ring ${compact ? 'rounded-md' : 'rounded-xl'}`}
        />
      </div>

      {allowCurrentLocation && (
        <button
          type="button"
          onClick={() => void handleCurrentLocation()}
          disabled={locationLoading}
          aria-busy={locationLoading}
          aria-describedby={locationError ? errorId : undefined}
          className={`inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-lg px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60 ${showCurrentLocationOnAllViewports ? '' : 'sm:hidden'} ${compact ? 'text-xs' : ''}`}
        >
          {locationLoading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />
          ) : (
            <LocateFixed size={16} aria-hidden />
          )}
          {locationLoading
            ? t('currentLocationLoading')
            : locationError === 'permission_denied'
              ? t('currentLocationRetry')
              : t('useCurrentLocation')}
        </button>
      )}

      {allowMapSelection && (
        <button
          type="button"
          onClick={openMapPicker}
          className={`inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-lg px-3 py-2 font-medium text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${compact ? 'text-xs' : 'text-sm'}`}
        >
          <MapPinned size={16} aria-hidden />
          {visibleResults.length > 0
            ? t('chooseFromMapResults', { count: visibleResults.length })
            : t('chooseFromMap')}
        </button>
      )}

      {loading && (
        <p id={statusId} role="status" aria-live="polite" className="px-1 text-xs text-muted-foreground">
          {t('loading')}
        </p>
      )}

      {(fetchError || locationError) && (
        <>
          <p id={errorId} role="alert" className="px-1 text-xs text-destructive">
            {locationError
              ? t(currentLocationMessageKey(locationError))
              : fetchError === 'rate_limited'
                ? t('rateLimited')
                : t('errorAllProviders')}
          </p>
          {locationError === 'permission_denied' && (
            <details
              id={permissionHelpId}
              className="overflow-hidden rounded-lg border border-border bg-muted/30 text-muted-foreground"
            >
              <summary className="min-h-10 cursor-pointer px-3 py-2 text-xs font-medium leading-6 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                {t('currentLocationPermissionHelpTitle')}
              </summary>
              <div className="flex flex-col gap-2 border-t border-border px-3 py-2 text-xs leading-relaxed">
                {!interfaceUsesEnglish && (
                  <button
                    type="button"
                    onClick={() => setShowEnglishPermissionHelp(current => !current)}
                    className="min-h-10 self-start rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {showEnglishPermissionHelp
                      ? t('currentLocationPermissionShowIcelandic')
                      : t('currentLocationPermissionShowEnglish')}
                  </button>
                )}
                <div
                  lang={permissionHelpUsesEnglish ? 'en' : 'is'}
                  className="flex flex-col gap-2"
                >
                  <p>
                    {t(permissionHelpUsesEnglish
                      ? 'currentLocationPermissionIosHelpEnglish'
                      : 'currentLocationPermissionIosHelp')}
                  </p>
                  <p>
                    {t(permissionHelpUsesEnglish
                      ? 'currentLocationPermissionBrowserHelpEnglish'
                      : 'currentLocationPermissionBrowserHelp')}
                  </p>
                </div>
              </div>
            </details>
          )}
        </>
      )}

      {noResults && (
        <p role="status" aria-live="polite" className="px-1 text-xs text-muted-foreground">
          {t('noResults')}
        </p>
      )}

      {!trimmedQuery && visibleSavedPlaces.length > 0 && (
        <div className="flex flex-col gap-1">
          <p id={`${inputId}-saved-label`} className="px-1 text-xs text-muted-foreground">
            {t('savedPlacesTitle')}
          </p>
          <ul
            aria-labelledby={`${inputId}-saved-label`}
            className={`flex flex-col overflow-hidden border border-border bg-card ${compact ? 'rounded-md' : 'rounded-xl'}`}
          >
            {visibleSavedPlaces.map(place => (
              <li key={place.id} className="flex min-h-10 items-stretch">
                <button
                  type="button"
                  onClick={() => selectPlace(savedPlaceResult(place))}
                  aria-label={accessiblePlaceLabel(place)}
                  className="min-w-0 flex-1 px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <PlaceResultIdentity place={place} />
                </button>
                {onDeleteSavedPlace && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      onDeleteSavedPlace(place.id)
                    }}
                    className="flex min-h-10 min-w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={t('savedPlaceDelete')}
                  >
                    <X size={14} aria-hidden />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {resultsOpen && (
        <div className="flex min-w-0 flex-col gap-1">
          <ul
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel ?? t('ariaLabel')}
            className={`max-h-64 overflow-y-auto overscroll-contain border border-border bg-card shadow-sm ${compact ? 'rounded-md' : 'rounded-xl'}`}
          >
            {visibleResults.map((place, index) => {
              const selected = index === activeIndex
              return (
                <li
                  id={`${listboxId}-option-${index}`}
                  key={place.id ?? `${place.source}:${coordinateKey(place)}`}
                  role="option"
                  aria-selected={selected}
                  aria-label={accessiblePlaceLabel(place)}
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => selectPlace(place)}
                  onMouseMove={() => setActiveIndex(index)}
                  className={`min-h-10 cursor-pointer px-3 py-2 text-left text-sm transition-colors ${selected ? 'bg-muted text-foreground' : 'text-foreground hover:bg-muted'}`}
                >
                  <PlaceResultIdentity place={place} />
                </li>
              )
            })}
          </ul>
          <PlaceDataAttributions places={visibleResults} className="px-1" />
        </div>
      )}

      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="min-h-10 self-start rounded px-1 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t('cancel')}
        </button>
      )}

      {mapPickerOpen && (
        <PlaceMapPicker
          places={mapPickerPlaces}
          onClose={() => setMapPickerOpen(false)}
          onSelect={place => {
            setMapPickerOpen(false)
            selectPlace(place)
          }}
        />
      )}
    </div>
  )
}
