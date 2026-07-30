import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const { mapInstances, markerElements } = vi.hoisted(() => ({
  mapInstances: [] as Array<{
    fitBounds: ReturnType<typeof vi.fn>
  }>,
  markerElements: [] as HTMLElement[],
}))

vi.mock('maplibre-gl', () => {
  class MapMock {
    fitBounds = vi.fn()
    constructor() {
      mapInstances.push(this)
    }
    addControl() {}
    addSource() {}
    addLayer() {}
    getCanvas() { return { style: { cursor: '' } } }
    getLayer() { return undefined }
    getSource() { return undefined }
    isStyleLoaded() { return true }
    setPaintProperty() {}
    on(name: string, layerOrHandler: string | (() => void), maybeHandler?: () => void) {
      const handler = typeof layerOrHandler === 'function' ? layerOrHandler : maybeHandler
      if (name === 'load' && handler) queueMicrotask(handler)
      return this
    }
    once(name: string, handler: () => void) {
      if (name === 'load') queueMicrotask(handler)
      return this
    }
    resize() {}
    remove() {}
  }

  class MarkerMock {
    element: HTMLElement
    constructor(options: { element: HTMLElement }) {
      this.element = options.element
      markerElements.push(options.element)
    }
    setLngLat() { return this }
    addTo() {
      document.body.appendChild(this.element)
      return this
    }
    remove() { this.element.remove() }
  }

  class LngLatBoundsMock {
    coordinates: Array<[number, number]> = []
    extend(coordinate: [number, number]) {
      this.coordinates.push(coordinate)
      return this
    }
  }

  return {
    Map: MapMock,
    Marker: MarkerMock,
    LngLatBounds: LngLatBoundsMock,
    AttributionControl: class {},
  }
})

import { DriveRouteMap } from '@/components/weather/DriveRouteMap'

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    disconnect() {}
  })
  document.documentElement.lang = 'is'
})

afterAll(() => {
  vi.unstubAllGlobals()
  document.documentElement.removeAttribute('lang')
})

beforeEach(() => {
  mapInstances.length = 0
  markerElements.length = 0
})

describe('DriveRouteMap gravel annotations', () => {
  it('keeps a non-colour marker and one compact callout visible, then focuses the exact section', async () => {
    const longSection = [
      { lat: 64.1, lon: -21.9 },
      { lat: 64.12, lon: -21.75 },
      { lat: 64.13, lon: -21.6 },
    ]
    const shortSection = [
      { lat: 65.1, lon: -20.2 },
      { lat: 65.11, lon: -20.16 },
    ]
    const { unmount } = render(
      <DriveRouteMap
        ariaLabel="Leiðakort"
        routes={[{
          id: 'route',
          color: '#14532d',
          points: [longSection[0], shortSection[shortSection.length - 1]],
        }]}
        annotations={[
          {
            id: 'long-gravel',
            kind: 'gravel',
            label: 'Malarvegur',
            point: longSection[1],
            focusPoints: longSection,
            distanceKm: 8.3,
            showLabel: true,
          },
          {
            id: 'short-gravel',
            kind: 'gravel',
            label: 'Malarvegur',
            point: shortSection[0],
            focusPoints: shortSection,
            distanceKm: 1.2,
          },
        ]}
      />,
    )

    const longMarker = await screen.findByRole('button', { name: '8,3 km · Malarvegur' })
    const shortMarker = screen.getByRole('button', { name: '1,2 km · Malarvegur' })
    const longCallout = screen.getByText('8,3 km · Malarvegur')
    const shortCallout = screen.getByText('1,2 km · Malarvegur')

    expect(longMarker.style.width).toBe('40px')
    expect(longMarker.style.height).toBe('40px')
    expect(longMarker.querySelectorAll('span').length).toBeGreaterThanOrEqual(5)
    expect(longCallout).toHaveStyle({ display: 'block' })
    expect(shortCallout).toHaveStyle({ display: 'none' })

    fireEvent.focus(shortMarker)
    expect(shortCallout).toHaveStyle({ display: 'block' })
    expect(longCallout).toHaveStyle({ display: 'none' })
    await waitFor(() => {
      expect(mapInstances[0].fitBounds).toHaveBeenLastCalledWith(
        expect.objectContaining({ coordinates: shortSection.map(point => [point.lon, point.lat]) }),
        { padding: 48, duration: 280, maxZoom: 13 },
      )
    })

    unmount()
    expect(markerElements.every(element => !element.isConnected)).toBe(true)
  })
})
