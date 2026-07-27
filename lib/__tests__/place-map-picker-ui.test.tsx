import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const { getLocationFromCoordinatesMock, mapInstances, markerInstances } = vi.hoisted(() => ({
  getLocationFromCoordinatesMock: vi.fn(),
  mapInstances: [] as Array<{
    handlers: Map<string, (event: unknown) => void>
    lastEaseTo?: { center: [number, number]; duration: number }
  }>,
  markerInstances: [] as Array<{
    element: HTMLElement
    removed: boolean
    lngLat: [number, number] | null
  }>,
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => ({
    mapPickerTitle: 'Choose a place on the map',
    mapPickerClose: 'Close map picker',
    mapPickerMapAriaLabel: 'Map for choosing a place in Iceland',
    mapPickerLoading: 'Loading map...',
    mapPickerUnavailable: 'Map unavailable',
    mapPickerResultsHint: `${values?.count ?? 0} results are on the map.`,
    mapPickerEmptyHint: 'Tap a place on the map to select it.',
    mapPickerSelectedPoint: 'Selected point on the map',
    mapPickerResolving: 'Finding a nearby place name...',
    mapPickerOutsideIceland: 'Choose a place within Iceland.',
    mapPickerPointError: 'Could not select this place.',
    mapPickerConfirm: 'Use this place',
    currentLocationNear: 'Near result',
    placeTypeSettlement: 'Settlement',
    placeTypeAddress: 'Address',
    dataAttributionLabel: 'Place-search data sources',
    hmsAttribution: 'Based on information from the HMS Address Register.',
    settlementAttributionHagstofa: 'Settlements: Statistics Iceland',
    settlementAttributionLmi: `IS 50V: National Land Survey of Iceland, retrieved ${values?.date ?? ''}`,
    postalLocalityAttribution: 'Byggt á gögnum frá Byggðastofnun.',
  })[key] ?? key,
}))

vi.mock('@/lib/places/currentLocation.client', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/places/currentLocation.client')>()
  return {
    ...actual,
    getLocationFromCoordinates: getLocationFromCoordinatesMock,
  }
})

vi.mock('maplibre-gl', () => {
  class MapMock {
    handlers = new Map<string, (event: unknown) => void>()
    lastEaseTo?: { center: [number, number]; duration: number }
    constructor() {
      mapInstances.push(this)
    }
    addControl() {}
    on(name: string, handler: (event: unknown) => void) {
      this.handlers.set(name, handler)
      return this
    }
    fitBounds() {}
    jumpTo() {}
    easeTo(options: { center: [number, number]; duration: number }) { this.lastEaseTo = options }
    resize() {}
    remove() {}
  }

  class MarkerMock {
    element: HTMLElement
    removed = false
    lngLat: [number, number] | null = null
    constructor(options: { element: HTMLElement }) {
      this.element = options.element
      markerInstances.push(this)
    }
    setLngLat(value: [number, number]) { this.lngLat = value; return this }
    addTo() { return this }
    remove() { this.removed = true }
  }

  class LngLatBoundsMock {
    extend() { return this }
  }

  return {
    Map: MapMock,
    Marker: MarkerMock,
    LngLatBounds: LngLatBoundsMock,
    AttributionControl: class {},
    NavigationControl: class {},
  }
})

import { PlaceMapPicker } from '@/components/weather/PlaceMapPicker'

beforeAll(() => {
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  })
})

beforeEach(() => {
  vi.clearAllMocks()
  mapInstances.length = 0
  markerInstances.length = 0
})

describe('PlaceMapPicker', () => {
  it('shows every same-name result and confirms the exact selected identity', async () => {
    const onSelect = vi.fn()
    render(
      <PlaceMapPicker
        places={[
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
        ]}
        onClose={vi.fn()}
        onSelect={onSelect}
      />,
    )

    await waitFor(() => expect(mapInstances).toHaveLength(1))
    expect(screen.getByText('850 Hella')).toBeInTheDocument()
    expect(screen.getByText('Settlement')).toBeInTheDocument()
    expect(screen.getByText('Address')).toBeInTheDocument()
    expect(markerInstances[0].lngLat).toEqual([-20.4001, 63.8357])
    expect(markerInstances[1].lngLat).toEqual([-18.0053, 66.5362])
    expect(markerInstances[0].element).toHaveAttribute(
      'aria-label',
      'Hella, Settlement, 850 Hella',
    )
    expect(markerInstances[1].element).toHaveAttribute(
      'aria-label',
      'Hella, Address, 611 Grímsey · Akureyrarbær',
    )
    expect(screen.getByRole('link', { name: 'Settlements: Statistics Iceland' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'IS 50V: National Land Survey of Iceland, retrieved 2026-07-27' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Based on information from the HMS Address Register.' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Byggt á gögnum frá Byggðastofnun.' })).toBeInTheDocument()

    const address = screen.getByText('611 Grímsey · Akureyrarbær')
    fireEvent.click(address.closest('button')!)
    expect(mapInstances[0].lastEaseTo?.center).toEqual([-18.0053, 66.5362])
    fireEvent.click(screen.getByRole('button', { name: 'Use this place' }))

    expect(onSelect).toHaveBeenCalledOnce()
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({
      id: 'hms:hella-grimsey',
      sourceId: 'hella-grimsey',
      placeType: 'address',
      postalLocality: 'Grímsey',
      lat: 66.5362,
      lon: -18.0053,
    }))
  })

  it('turns an explicit map click into a provider-neutral point before confirmation', async () => {
    const selectedPoint = {
      id: 'map:63.835700:-20.400100',
      source: 'map' as const,
      labelSource: 'hms' as const,
      name: 'Selected point on the map',
      formattedAddress: 'Near Hella',
      placeType: 'point' as const,
      postalCode: '850',
      postalLocality: 'Hella',
      lat: 63.8357004,
      lon: -20.4000996,
    }
    getLocationFromCoordinatesMock.mockResolvedValue(selectedPoint)
    const onSelect = vi.fn()
    render(<PlaceMapPicker places={[]} onClose={vi.fn()} onSelect={onSelect} />)

    await waitFor(() => expect(mapInstances).toHaveLength(1))
    await act(async () => {
      mapInstances[0].handlers.get('click')?.({
        lngLat: { lat: selectedPoint.lat, lng: selectedPoint.lon },
      })
      await Promise.resolve()
    })

    expect(getLocationFromCoordinatesMock).toHaveBeenCalledWith(
      selectedPoint.lat,
      selectedPoint.lon,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(screen.getByText('Near Hella')).toBeInTheDocument()
    expect(screen.getByRole('link', {
      name: 'Based on information from the HMS Address Register.',
    })).toBeInTheDocument()
    expect(screen.getByRole('link', {
      name: 'Byggt á gögnum frá Byggðastofnun.',
    })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Use this place' }))
    expect(onSelect).toHaveBeenCalledWith(selectedPoint)
  })
})
