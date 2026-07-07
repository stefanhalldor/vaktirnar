'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { loadPlacesLibrary } from '@/lib/weather/googleMaps.client'
import { Search, X } from 'lucide-react'

export type PlaceResult = {
  name: string
  formattedAddress: string
  lat: number
  lon: number
}

/** Minimal shape required by PlaceSearch; compatible with SavedWeatherPlace. */
export type SavedPlace = {
  id: string
  name: string
  formattedAddress?: string
  lat: number
  lon: number
}

type PlaceSearchProps = {
  onPlaceSelected: (place: PlaceResult) => void
  onCancel?: () => void
  autoFocus?: boolean
  placeholder?: string
  savedPlaces?: SavedPlace[]
  onDeleteSavedPlace?: (id: string) => void
}

type SearchSuggestion =
  | { source: 'google'; label: string; raw: google.maps.places.AutocompleteSuggestion }
  | { source: 'server'; label: string; place: PlaceResult }

type ServerSearchOutcome =
  | { ok: true; results: SearchSuggestion[] }
  | { ok: false; results: [] }

// How long to wait for Google Places before falling back to server search.
const GOOGLE_TIMEOUT_MS = 4_000

export function PlaceSearch({ onPlaceSelected, onCancel, autoFocus = true, placeholder, savedPlaces, onDeleteSavedPlace }: PlaceSearchProps) {
  const t = useTranslations('teskeid.vedrid.placeSearch')
  const [input, setInput] = useState('')
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState(false)
  const [noResults, setNoResults] = useState(false)

  // Once Google fails in this component instance, stick to the server fallback.
  const googleUnavailableRef = useRef(false)
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null)
  const requestIdRef = useRef(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef(input)
  inputRef.current = input

  // Clear debounce timer on unmount to avoid state updates after unmount.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  async function searchViaGoogle(value: string): Promise<SearchSuggestion[]> {
    const { AutocompleteSuggestion, AutocompleteSessionToken } = await loadPlacesLibrary()
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = new AutocompleteSessionToken()
    }
    const { suggestions: results } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input: value,
      sessionToken: sessionTokenRef.current,
      includedRegionCodes: ['is'],
      language: 'is',
    })
    return results.map(raw => ({
      source: 'google' as const,
      label: raw.placePrediction?.text.text ?? '',
      raw,
    }))
  }

  async function searchViaServer(value: string): Promise<ServerSearchOutcome> {
    try {
      const res = await fetch(`/api/place/search?q=${encodeURIComponent(value)}`)
      if (!res.ok) return { ok: false, results: [] }
      const data = (await res.json()) as { results: PlaceResult[] }
      return {
        ok: true,
        results: (data.results ?? []).map(place => ({
          source: 'server' as const,
          label: place.formattedAddress || place.name,
          place,
        })),
      }
    } catch {
      return { ok: false, results: [] }
    }
  }

  const search = useCallback(async (value: string) => {
    if (value.length < 2) {
      setSuggestions([])
      setFetchError(false)
      setNoResults(false)
      return
    }

    const requestId = ++requestIdRef.current
    setLoading(true)
    setFetchError(false)
    setNoResults(false)

    try {
      if (!googleUnavailableRef.current) {
        try {
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), GOOGLE_TIMEOUT_MS),
          )
          const results = await Promise.race([searchViaGoogle(value), timeoutPromise])
          if (requestId !== requestIdRef.current) return
          setSuggestions(results)
          setLoading(false)
          return
        } catch {
          googleUnavailableRef.current = true
        }
      }

      // Server fallback
      const outcome = await searchViaServer(value)
      if (requestId !== requestIdRef.current) return
      setSuggestions(outcome.results)
      if (!outcome.ok) {
        setFetchError(true)
      } else if (outcome.results.length === 0) {
        setNoResults(true)
      }
    } catch {
      if (requestId === requestIdRef.current) {
        setSuggestions([])
        setFetchError(true)
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false)
    }
  }, [])

  function handleInputChange(value: string) {
    setInput(value)
    setNoResults(false)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!value.trim()) {
      setSuggestions([])
      return
    }
    debounceRef.current = setTimeout(() => search(value), 300)
  }

  async function handleSelect(suggestion: SearchSuggestion) {
    if (suggestion.source === 'server') {
      setSuggestions([])
      setInput('')
      onPlaceSelected(suggestion.place)
      return
    }

    // Google path: fetch coordinates via fetchFields. Don't clear input until success
    // so that if fetchFields fails the user still sees what they typed.
    try {
      const place = suggestion.raw.placePrediction!.toPlace()
      await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location'] })
      sessionTokenRef.current = null
      setSuggestions([])
      setInput('')
      onPlaceSelected({
        name: place.displayName ?? '',
        formattedAddress: place.formattedAddress ?? '',
        lat: place.location!.lat(),
        lon: place.location!.lng(),
      })
    } catch {
      // Google fetchFields failed — mark Google as unavailable and try server fallback.
      googleUnavailableRef.current = true
      const fallbackQuery = inputRef.current || suggestion.label
      if (fallbackQuery.length >= 2) {
        const outcome = await searchViaServer(fallbackQuery)
        setSuggestions(outcome.results)
        if (!outcome.ok) { setNoResults(false); setFetchError(true) }
        else if (outcome.results.length === 0) { setFetchError(false); setNoResults(true) }
      } else {
        setSuggestions([])
        setFetchError(true)
      }
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          aria-hidden
        />
        <input
          type="text"
          value={input}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder={placeholder ?? t('placeholder')}
          autoFocus={autoFocus}
          className="w-full rounded-xl border border-border bg-card pl-8 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          style={{ fontSize: '16px' }}
          aria-label={t('ariaLabel')}
        />
      </div>

      {loading && (
        <p className="text-xs text-muted-foreground px-1">{t('loading')}</p>
      )}

      {fetchError && (
        <p className="text-xs text-destructive px-1">{t('errorAllProviders')}</p>
      )}

      {noResults && !fetchError && (
        <p className="text-xs text-muted-foreground px-1">{t('noResults')}</p>
      )}

      {!input.trim() && savedPlaces && savedPlaces.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-muted-foreground px-1">{t('savedPlacesTitle')}</p>
          <ul
            role="listbox"
            className="flex flex-col rounded-xl border border-border bg-card overflow-hidden"
          >
            {savedPlaces.map((p) => (
              <li key={p.id} role="option" aria-selected={false}>
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() => onPlaceSelected({ name: p.name, formattedAddress: p.formattedAddress ?? '', lat: p.lat, lon: p.lon })}
                    className="flex-1 text-left px-4 py-2.5 hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                  >
                    <span className="block text-sm text-foreground truncate">{p.name}</span>
                    {p.formattedAddress && p.formattedAddress !== p.name && (
                      <span className="block text-xs text-muted-foreground truncate">{p.formattedAddress}</span>
                    )}
                  </button>
                  {onDeleteSavedPlace && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onDeleteSavedPlace(p.id) }}
                      className="px-3 py-2.5 text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={t('savedPlaceDelete')}
                    >
                      <X size={13} aria-hidden />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {suggestions.length > 0 && (
        <ul
          role="listbox"
          className="flex flex-col rounded-xl border border-border bg-card overflow-hidden"
        >
          {suggestions.map((s, i) => (
            <li key={i} role="option" aria-selected={false}>
              <button
                type="button"
                onClick={() => handleSelect(s)}
                className="w-full text-left px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded self-start"
        >
          {t('cancel')}
        </button>
      )}
    </div>
  )
}
