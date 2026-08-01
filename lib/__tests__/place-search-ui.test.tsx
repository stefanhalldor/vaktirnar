import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { OFFICIAL_PLACE_DIRECTORY_RETRIEVED_DATE } from '@/lib/places/officialPlaceAttribution.generated'

const { fetchMock, getCurrentLocationMock, localeMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  getCurrentLocationMock: vi.fn(),
  localeMock: vi.fn(() => 'is'),
}))

vi.mock('next-intl', () => ({
  useLocale: localeMock,
  useTranslations: () => (
    key: string,
    values?: Record<string, string | number>,
  ) => {
    const translations: Record<string, string> = {
      ariaLabel: 'Search for a place',
      placeholder: 'Search for a place in Iceland...',
      loading: 'Searching...',
      errorAllProviders: 'Search is unavailable right now.',
      noResults: 'No place found.',
      rateLimited: 'Too many searches right now.',
      useCurrentLocation: 'Use current location',
      chooseFromMap: 'Choose on map',
      chooseFromMapResults: `Choose on map (${values?.count ?? 0})`,
      selectedLocationLabel: 'Selected place',
      changeSelectedPlace: 'Change',
      currentLocationLoading: 'Finding your location...',
      currentLocationName: 'Current location',
      currentLocationNear: `Near ${values?.place ?? ''}`,
      currentLocationAccuracy: `Accuracy about ±${values?.meters ?? 0} m`,
      currentLocationPermissionDenied: 'The browser or device blocked location access.',
      currentLocationPermissionHelpTitle: 'How do I enable location?',
      currentLocationPermissionIosHelp: 'Opnaðu staðsetningarstillingar á iPhone eða iPad.',
      currentLocationPermissionBrowserHelp: 'Leyfðu teskeid.is í vafranum og reyndu aftur.',
      currentLocationPermissionIosHelpEnglish: 'Open iPhone or iPad location settings.',
      currentLocationPermissionBrowserHelpEnglish: 'Allow teskeid.is in the browser and try again.',
      currentLocationPermissionShowEnglish: 'English instructions',
      currentLocationPermissionShowIcelandic: 'Íslenskar leiðbeiningar',
      currentLocationRetry: 'Try again',
      currentLocationUnavailable: 'Your device could not find its location.',
      currentLocationTimeout: 'Finding your location took too long.',
      currentLocationOutsideIceland: 'Your location appears to be outside Iceland.',
      currentLocationInsecureContext: 'Location requires a secure connection.',
      placeTypeSettlement: 'Settlement',
      placeTypeAddress: 'Address',
      dataAttributionLabel: 'Place-search data sources',
      hmsAttribution: 'Based on information from the HMS Address Register.',
      settlementAttributionHagstofa: 'Settlements: Statistics Iceland',
      settlementAttributionLmi: `IS 50V: National Land Survey of Iceland, retrieved ${values?.date ?? ''}`,
      postalLocalityAttribution: 'Byggt á gögnum frá Byggðastofnun.',
    }
    return translations[key] ?? key
  },
}))

vi.mock('@/components/weather/PlaceMapPicker', () => ({
  PlaceMapPicker: ({
    places,
    onSelect,
    onClose,
  }: {
    places: Array<{ id: string; name: string; formattedAddress?: string }>
    onSelect: (place: unknown) => void
    onClose: () => void
  }) => (
    <div role="dialog" aria-label="Map picker test double">
      {places.map((place, index) => (
        <button key={place.id} type="button" onClick={() => onSelect(place)}>
          {index + 1}. {place.name}, {place.formattedAddress}
        </button>
      ))}
      <button type="button" onClick={onClose}>Close map picker</button>
    </div>
  ),
}))

vi.mock('@/lib/places/currentLocation.client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/places/currentLocation.client')>()
  return {
    ...actual,
    getCurrentLocation: getCurrentLocationMock,
  }
})

import { PlaceSearch } from '@/components/weather/PlaceSearch'
import { CurrentLocationError } from '@/lib/places/currentLocation.client'

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function searchResponse(results: unknown[], status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue({ results }),
  } as unknown as Response
}

async function advanceSearchDebounce() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(250)
  })
}

beforeAll(() => {
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  })
})

beforeEach(() => {
  vi.clearAllMocks()
  localeMock.mockReturnValue('is')
  vi.useFakeTimers()
  vi.stubGlobal('fetch', fetchMock)
})

describe('PlaceSearch', () => {
  it('shows a confirmed current location with nearby label and accuracy until changed', () => {
    const onClearSelectedPlace = vi.fn()
    render(
      <PlaceSearch
        autoFocus={false}
        selectedPlace={{
          id: 'device:64.146600:-21.942600',
          source: 'device',
          labelSource: 'hms',
          name: 'Current location',
          formattedAddress: 'Near Laugavegur 1',
          placeType: 'point',
          postalCode: '101',
          postalLocality: 'Reykjavík',
          lat: 64.1466,
          lon: -21.9426,
          accuracyM: 12.4,
        }}
        onClearSelectedPlace={onClearSelectedPlace}
        onPlaceSelected={vi.fn()}
      />,
    )

    expect(screen.getByText('Selected place')).toBeInTheDocument()
    expect(screen.getByText('Current location')).toBeInTheDocument()
    expect(screen.getByText('Near Laugavegur 1')).toBeInTheDocument()
    expect(screen.getByText('Accuracy about ±12 m')).toBeInTheDocument()
    expect(screen.getByRole('link', {
      name: 'Based on information from the HMS Address Register.',
    })).toBeInTheDocument()
    expect(screen.getByRole('link', {
      name: 'Byggt á gögnum frá Byggðastofnun.',
    })).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Change' }))
    expect(onClearSelectedPlace).toHaveBeenCalledOnce()
  })

  it('passes every same-name search result to the map picker and keeps exact selection identity', async () => {
    const onPlaceSelected = vi.fn()
    fetchMock.mockResolvedValue(searchResponse([
      {
          id: 'official:hagstofa:1120',
          source: 'official',
          sourceId: 'hagstofa:1120',
          name: 'Hella',
          formattedAddress: '850 Hella',
          placeType: 'settlement',
          postalCode: '850',
          postalLocality: 'Hella',
          lat: 63.8357,
          lon: -20.4001,
        },
        {
          id: 'hms:hella-grimsey',
          source: 'hms',
          sourceId: 'hella-grimsey',
          name: 'Hella',
          formattedAddress: 'Hella, 611 Grímsey',
          placeType: 'address',
          postalCode: '611',
          postalLocality: 'Grímsey',
          municipality: 'Akureyrarbær',
          lat: 66.5362,
          lon: -18.0053,
      },
    ]))

    render(<PlaceSearch autoFocus={false} onPlaceSelected={onPlaceSelected} />)
    const input = screen.getByRole('combobox', { name: 'Search for a place' })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Hella' } })
    await advanceSearchDebounce()

    expect(screen.getByRole('option', { name: 'Hella, Settlement, 850 Hella' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Hella, Address, 611 Grímsey · Akureyrarbær' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Settlements: Statistics Iceland' })).toBeInTheDocument()
    expect(screen.getByRole('link', {
      name: `IS 50V: National Land Survey of Iceland, retrieved ${OFFICIAL_PLACE_DIRECTORY_RETRIEVED_DATE}`,
    })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Based on information from the HMS Address Register.' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Byggt á gögnum frá Byggðastofnun.' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Choose on map (2)' }))

    expect(screen.getByRole('button', { name: /Hella, 850 Hella/ })).toBeInTheDocument()
    const exactResult = screen.getByRole('button', { name: /Hella, Hella, 611 Grímsey/ })
    fireEvent.click(exactResult)

    expect(onPlaceSelected).toHaveBeenCalledOnce()
    expect(onPlaceSelected).toHaveBeenCalledWith(expect.objectContaining({
      id: 'hms:hella-grimsey',
      source: 'hms',
      sourceId: 'hella-grimsey',
      placeType: 'address',
      postalLocality: 'Grímsey',
      formattedAddress: 'Hella, 611 Grímsey',
      lat: 66.5362,
      lon: -18.0053,
    }))
  })

  it('debounces POST searches and ignores a stale response after the query changes', async () => {
    const firstResponse = deferred<Response>()
    fetchMock
      .mockReturnValueOnce(firstResponse.promise)
      .mockResolvedValueOnce(searchResponse([
        {
          id: 'hms:second',
          source: 'hms',
          sourceId: 'second',
          name: 'Akureyri',
          formattedAddress: '600 Akureyri',
          lat: 65.6826,
          lon: -18.0907,
        },
      ]))

    render(<PlaceSearch autoFocus={false} onPlaceSelected={vi.fn()} />)
    const input = screen.getByRole('combobox', { name: 'Search for a place' })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Ak' } })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(249)
    })
    expect(fetchMock).not.toHaveBeenCalled()

    await advanceSearchDebounce()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/place/search', expect.objectContaining({
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'Ak' }),
      signal: expect.any(AbortSignal),
    }))

    const firstSignal = fetchMock.mock.calls[0]?.[1]?.signal as AbortSignal
    fireEvent.change(input, { target: { value: 'Aku' } })
    expect(firstSignal.aborted).toBe(true)
    await advanceSearchDebounce()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/place/search', expect.objectContaining({
      body: JSON.stringify({ query: 'Aku' }),
    }))
    expect(screen.getByRole('option', { name: /Akureyri/ })).toBeInTheDocument()

    await act(async () => {
      firstResponse.resolve(searchResponse([
        {
          id: 'hms:stale',
          source: 'hms',
          sourceId: 'stale',
          name: 'Stale result',
          formattedAddress: 'Must not be shown',
          lat: 64.1,
          lon: -21.9,
        },
      ]))
      await Promise.resolve()
    })

    expect(screen.queryByText('Stale result')).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Akureyri/ })).toBeInTheDocument()
  })

  it('exposes combobox/listbox semantics and closes the result list with Escape', async () => {
    fetchMock.mockResolvedValue(searchResponse([
      {
        id: 'static:reykjavik',
        source: 'static',
        sourceId: 'reykjavik',
        name: 'Reykjavík',
        formattedAddress: 'Reykjavík',
        lat: 64.1466,
        lon: -21.9426,
      },
    ]))

    render(<PlaceSearch autoFocus={false} onPlaceSelected={vi.fn()} />)
    const input = screen.getByRole('combobox', { name: 'Search for a place' })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Reykjavík' } })
    await advanceSearchDebounce()

    const listbox = screen.getByRole('listbox', { name: 'Search for a place' })
    const option = screen.getByRole('option', { name: 'Reykjavík' })
    expect(input).toHaveAttribute('aria-expanded', 'true')
    expect(input).toHaveAttribute('aria-controls', listbox.id)
    expect(option).toHaveAttribute('aria-selected', 'false')

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input).toHaveAttribute('aria-activedescendant', option.id)
    expect(option).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(input, { key: 'Escape' })
    expect(input).toHaveAttribute('aria-expanded', 'false')
    expect(input).not.toHaveAttribute('aria-controls')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('selects the active result with ArrowDown and Enter without treating an HMS id as Google identity', async () => {
    const onPlaceSelected = vi.fn()
    fetchMock.mockResolvedValue(searchResponse([
      {
        id: 'static:akureyri',
        source: 'static',
        sourceId: 'akureyri',
        name: 'Akureyri',
        formattedAddress: '600 Akureyri',
        lat: 65.6826,
        lon: -18.0907,
      },
      {
        id: 'hms:1001234',
        source: 'hms',
        sourceId: '1001234',
        placeId: '1001234',
        name: 'Akurgerði 4',
        formattedAddress: 'Akurgerði 4, 600 Akureyri',
        lat: 65.681,
        lon: -18.091,
      },
    ]))

    render(<PlaceSearch autoFocus={false} onPlaceSelected={onPlaceSelected} />)
    const input = screen.getByRole('combobox', { name: 'Search for a place' })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Akur' } })
    await advanceSearchDebounce()

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    const activeId = input.getAttribute('aria-activedescendant')
    expect(activeId).toBe(screen.getByRole('option', { name: /Akurgerði 4/ }).id)

    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onPlaceSelected).toHaveBeenCalledOnce()
    expect(onPlaceSelected).toHaveBeenCalledWith(expect.objectContaining({
      id: 'hms:1001234',
      source: 'hms',
      sourceId: '1001234',
      name: 'Akurgerði 4',
    }))
    const selected = onPlaceSelected.mock.calls[0]?.[0]
    expect(selected.routingRef).toBeUndefined()
    expect(selected.googlePlaceId).toBeUndefined()
    expect(selected.placeId).toBeUndefined()
    expect(input).toHaveValue('')
  })

  it('attributes HMS only while visible search results use the HMS directory', async () => {
    fetchMock.mockResolvedValueOnce(searchResponse([
      {
        id: 'hms:1001234',
        source: 'hms',
        sourceId: '1001234',
        name: 'Melás 8',
        formattedAddress: 'Melás 8, 301 Akranes',
        lat: 64.45,
        lon: -21.85,
      },
    ]))

    render(<PlaceSearch autoFocus={false} onPlaceSelected={vi.fn()} />)
    const input = screen.getByRole('combobox', { name: 'Search for a place' })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Melás' } })
    await advanceSearchDebounce()

    const attribution = screen.getByRole('link', {
      name: 'Based on information from the HMS Address Register.',
    })
    expect(attribution).toHaveAttribute(
      'href',
      'https://gatt.natt.is/geonetwork/srv/api/records/%7BA879D973-CA98-49D7-AA50-7BC35047E461%7D',
    )
    expect(attribution).toHaveAttribute('target', '_blank')

    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('link', {
      name: 'Based on information from the HMS Address Register.',
    })).not.toBeInTheDocument()

    fetchMock.mockResolvedValueOnce(searchResponse([
      {
        id: 'static:melas',
        source: 'static',
        sourceId: 'melas',
        name: 'Melás',
        formattedAddress: 'Melás',
        lat: 64.45,
        lon: -21.85,
      },
    ]))
    fireEvent.change(input, { target: { value: 'Melás 8' } })
    await advanceSearchDebounce()

    expect(screen.queryByRole('link', {
      name: 'Based on information from the HMS Address Register.',
    })).not.toBeInTheDocument()
  })

  it('shows the localized rate-limit message for a 429 response', async () => {
    fetchMock.mockResolvedValue(searchResponse([], 429))

    render(<PlaceSearch autoFocus={false} onPlaceSelected={vi.fn()} />)
    const input = screen.getByRole('combobox', { name: 'Search for a place' })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Hella' } })
    await advanceSearchDebounce()

    expect(screen.getByRole('alert')).toHaveTextContent('Too many searches right now.')
    expect(input).toHaveAttribute('aria-invalid', 'true')
  })

  it('requests device location only after the explicit button click and preserves device provenance', async () => {
    const locationResponse = deferred<{
      id: string
      source: 'device'
      name: string
      formattedAddress: string
      lat: number
      lon: number
      accuracyM: number
    }>()
    const onPlaceSelected = vi.fn()
    getCurrentLocationMock.mockReturnValue(locationResponse.promise)

    render(
      <PlaceSearch
        autoFocus={false}
        allowCurrentLocation
        onPlaceSelected={onPlaceSelected}
      />,
    )

    expect(getCurrentLocationMock).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()

    const locationButton = screen.getByRole('button', { name: 'Use current location' })
    expect(locationButton).toHaveClass('sm:hidden')
    fireEvent.click(locationButton)

    expect(getCurrentLocationMock).toHaveBeenCalledOnce()
    expect(getCurrentLocationMock).toHaveBeenCalledWith(expect.objectContaining({
      fallbackName: 'Current location',
      formatNearbyLabel: expect.any(Function),
      signal: expect.any(AbortSignal),
    }))
    expect(screen.getByRole('button', { name: 'Finding your location...' })).toBeDisabled()

    await act(async () => {
      locationResponse.resolve({
        id: 'device:64.146600:-21.942600',
        source: 'device',
        name: 'Current location',
        formattedAddress: 'Near Laugavegur 1',
        lat: 64.1466,
        lon: -21.9426,
        accuracyM: 12,
      })
      await Promise.resolve()
    })

    expect(onPlaceSelected).toHaveBeenCalledWith(expect.objectContaining({
      id: 'device:64.146600:-21.942600',
      source: 'device',
      lat: 64.1466,
      lon: -21.9426,
      accuracyM: 12,
    }))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('can keep the explicit current-location action visible on wider planning layouts', () => {
    render(
      <PlaceSearch
        autoFocus={false}
        allowCurrentLocation
        showCurrentLocationOnAllViewports
        onPlaceSelected={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Use current location' })).not.toHaveClass('sm:hidden')
    expect(getCurrentLocationMock).not.toHaveBeenCalled()
  })

  it('toggles recovery guidance between Icelandic and English and retries after denial', async () => {
    const onPlaceSelected = vi.fn()
    getCurrentLocationMock
      .mockRejectedValueOnce(new CurrentLocationError('permission_denied'))
      .mockResolvedValueOnce({
        id: 'device:64.146600:-21.942600',
        source: 'device',
        name: 'Current location',
        formattedAddress: 'Current location',
        lat: 64.1466,
        lon: -21.9426,
        accuracyM: 12,
      })

    render(
      <PlaceSearch
        autoFocus={false}
        allowCurrentLocation
        onPlaceSelected={onPlaceSelected}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Use current location' }))
    await act(async () => { await Promise.resolve() })

    expect(screen.getByRole('alert')).toHaveTextContent(
      'The browser or device blocked location access.',
    )
    const helpSummary = screen.getByText('How do I enable location?')
    expect(helpSummary.closest('details')).not.toHaveAttribute('open')
    expect(screen.getByText('Opnaðu staðsetningarstillingar á iPhone eða iPad.')).toBeInTheDocument()
    expect(screen.getByText('Leyfðu teskeid.is í vafranum og reyndu aftur.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'English instructions' }))

    expect(screen.getByText('Open iPhone or iPad location settings.')).toBeInTheDocument()
    expect(screen.getByText('Allow teskeid.is in the browser and try again.')).toBeInTheDocument()
    expect(screen.queryByText('Opnaðu staðsetningarstillingar á iPhone eða iPad.')).not.toBeInTheDocument()
    expect(screen.getByText('Open iPhone or iPad location settings.').closest('[lang]')).toHaveAttribute('lang', 'en')

    fireEvent.click(screen.getByRole('button', { name: 'Íslenskar leiðbeiningar' }))

    expect(screen.getByText('Opnaðu staðsetningarstillingar á iPhone eða iPad.')).toBeInTheDocument()
    expect(screen.queryByText('Open iPhone or iPad location settings.')).not.toBeInTheDocument()
    expect(screen.getByText('Opnaðu staðsetningarstillingar á iPhone eða iPad.').closest('[lang]')).toHaveAttribute('lang', 'is')

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await act(async () => { await Promise.resolve() })

    expect(getCurrentLocationMock).toHaveBeenCalledTimes(2)
    expect(onPlaceSelected).toHaveBeenCalledWith(expect.objectContaining({
      source: 'device',
      lat: 64.1466,
      lon: -21.9426,
    }))
  })

  it('uses English help without a redundant language toggle in an English interface', async () => {
    localeMock.mockReturnValue('en')
    getCurrentLocationMock.mockRejectedValueOnce(
      new CurrentLocationError('permission_denied'),
    )

    render(
      <PlaceSearch
        autoFocus={false}
        allowCurrentLocation
        onPlaceSelected={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Use current location' }))
    await act(async () => { await Promise.resolve() })

    expect(screen.queryByRole('button', { name: 'English instructions' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Íslenskar leiðbeiningar' })).not.toBeInTheDocument()
    expect(screen.getByText('Open iPhone or iPad location settings.')).toBeInTheDocument()
    expect(screen.getByText('Open iPhone or iPad location settings.').closest('[lang]')).toHaveAttribute('lang', 'en')
  })
})
