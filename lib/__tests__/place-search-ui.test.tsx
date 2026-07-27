import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const { fetchMock, getCurrentLocationMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  getCurrentLocationMock: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (
    key: string,
    values?: Record<string, string>,
  ) => {
    const translations: Record<string, string> = {
      ariaLabel: 'Search for a place',
      placeholder: 'Search for a place in Iceland...',
      loading: 'Searching...',
      errorAllProviders: 'Search is unavailable right now.',
      noResults: 'No place found.',
      rateLimited: 'Too many searches right now.',
      useCurrentLocation: 'Use current location',
      currentLocationLoading: 'Finding your location...',
      currentLocationName: 'Current location',
      currentLocationNear: `Near ${values?.place ?? ''}`,
      currentLocationPermissionDenied: 'The browser or device blocked location access.',
      currentLocationPermissionHelpTitle: 'How do I enable location?',
      currentLocationPermissionIosHelp: 'Open iPhone or iPad location settings.',
      currentLocationPermissionBrowserHelp: 'Allow teskeid.is in the browser and try again.',
      currentLocationRetry: 'Try again',
      currentLocationUnavailable: 'Your device could not find its location.',
      currentLocationTimeout: 'Finding your location took too long.',
      currentLocationOutsideIceland: 'Your location appears to be outside Iceland.',
      currentLocationInsecureContext: 'Location requires a secure connection.',
      hmsAttribution: 'Based on information from the HMS Address Register.',
    }
    return translations[key] ?? key
  },
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
  vi.useFakeTimers()
  vi.stubGlobal('fetch', fetchMock)
})

describe('PlaceSearch', () => {
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

  it('shows collapsed recovery guidance and retries after a stored permission denial', async () => {
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
    expect(screen.getByText('Open iPhone or iPad location settings.')).toBeInTheDocument()
    expect(screen.getByText('Allow teskeid.is in the browser and try again.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await act(async () => { await Promise.resolve() })

    expect(getCurrentLocationMock).toHaveBeenCalledTimes(2)
    expect(onPlaceSelected).toHaveBeenCalledWith(expect.objectContaining({
      source: 'device',
      lat: 64.1466,
      lon: -21.9426,
    }))
  })
})
