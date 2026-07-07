'use client'

import { useState, useCallback, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { loadPlacesLibrary } from '@/lib/weather/googleMaps.client'
import { Search } from 'lucide-react'

export type PlaceResult = {
  name: string
  formattedAddress: string
  lat: number
  lon: number
}

type PlaceSearchProps = {
  onPlaceSelected: (place: PlaceResult) => void
  onCancel?: () => void
  autoFocus?: boolean
  placeholder?: string
}

export function PlaceSearch({ onPlaceSelected, onCancel, autoFocus = true, placeholder }: PlaceSearchProps) {
  const t = useTranslations('teskeid.vedrid.placeSearch')
  const [input, setInput] = useState('')
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState(false)

  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null)
  const requestIdRef = useRef(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = useCallback(async (value: string) => {
    if (value.length < 2) {
      setSuggestions([])
      setFetchError(false)
      return
    }

    const requestId = ++requestIdRef.current
    setLoading(true)
    setFetchError(false)

    try {
      const { AutocompleteSuggestion, AutocompleteSessionToken } = await loadPlacesLibrary()

      // Reuse session token across keystrokes — reset only after selection
      if (!sessionTokenRef.current) {
        sessionTokenRef.current = new AutocompleteSessionToken()
      }

      const { suggestions: results } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: value,
        sessionToken: sessionTokenRef.current,
        includedRegionCodes: ['is'],
        language: 'is',
      })

      // Stale guard — discard response if a newer request has started
      if (requestId !== requestIdRef.current) return

      setSuggestions(results)
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
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!value.trim()) {
      setSuggestions([])
      return
    }
    debounceRef.current = setTimeout(() => search(value), 300)
  }

  async function handleSelect(suggestion: google.maps.places.AutocompleteSuggestion) {
    const place = suggestion.placePrediction!.toPlace()
    // sessionToken is included automatically in the first fetchFields call — do NOT pass it explicitly
    await place.fetchFields({
      fields: ['displayName', 'formattedAddress', 'location'],
    })

    // Session ends after fetchFields — reset token for next independent search
    sessionTokenRef.current = null
    setSuggestions([])
    setInput('')

    onPlaceSelected({
      name: place.displayName ?? '',
      formattedAddress: place.formattedAddress ?? '',
      lat: place.location!.lat(),
      lon: place.location!.lng(),
    })
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
        <p className="text-xs text-destructive px-1">{t('error')}</p>
      )}

      {suggestions.length > 0 && (
        <ul
          role="listbox"
          className="flex flex-col rounded-xl border border-border bg-card overflow-hidden"
        >
          {suggestions.map((s, i) => {
            const text = s.placePrediction?.text.text ?? ''
            return (
              <li key={i} role="option" aria-selected={false}>
                <button
                  type="button"
                  onClick={() => handleSelect(s)}
                  className="w-full text-left px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                >
                  {text}
                </button>
              </li>
            )
          })}
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
