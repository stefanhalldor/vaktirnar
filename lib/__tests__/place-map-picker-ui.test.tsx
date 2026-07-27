import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const { getLocationFromCoordinatesMock, mapInstances, markerInstances } = vi.hoisted(() => ({
  getLocationFromCoordinatesMock: vi.fn(),
  mapInstances: [] as Array<{ handlers: Map<string, (event: unknown) => void> }>,
  markerInstances: [] as Array<{ element: HTMLElement; removed: boolean }>,
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, number>) => ({
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
    easeTo() {}
    resize() {}
    remove() {}
  }

  class MarkerMock {
    element: HTMLElement
    removed = false
    constructor(options: { element: HTMLElement }) {
      this.element = options.element
      markerInstances.push(this)
    }
    setLngLat() { return this }
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
            id: 'hms:hella-dalvik',
            source: 'hms',
            sourceId: 'hella-dalvik',
            name: 'Hella',
            formattedAddress: 'Hella, 621 Dalvíkurbyggð',
            lat: 65.91,
            lon: -18.31,
          },
          {
            id: 'hms:hella-sudurnes',
            source: 'hms',
            sourceId: 'hella-sudurnes',
            name: 'Hella',
            formattedAddress: 'Hella, 250 Suðurnesjabær',
            lat: 63.99,
            lon: -22.56,
          },
        ]}
        onClose={vi.fn()}
        onSelect={onSelect}
      />,
    )

    await waitFor(() => expect(mapInstances).toHaveLength(1))
    expect(screen.getByText('Hella, 621 Dalvíkurbyggð')).toBeInTheDocument()
    const address = screen.getByText('Hella, 250 Suðurnesjabær')
    fireEvent.click(address.closest('button')!)
    fireEvent.click(screen.getByRole('button', { name: 'Use this place' }))

    expect(onSelect).toHaveBeenCalledOnce()
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({
      id: 'hms:hella-sudurnes',
      sourceId: 'hella-sudurnes',
      lat: 63.99,
      lon: -22.56,
    }))
  })

  it('turns an explicit map click into a provider-neutral point before confirmation', async () => {
    const selectedPoint = {
      id: 'map:63.835700:-20.400100',
      source: 'map' as const,
      name: 'Selected point on the map',
      formattedAddress: 'Near Hella',
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
    fireEvent.click(screen.getByRole('button', { name: 'Use this place' }))
    expect(onSelect).toHaveBeenCalledWith(selectedPoint)
  })
})
