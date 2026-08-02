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

import {
  DriveRouteMap,
  driveRouteMapAnnotationDistanceLabel,
} from '@/components/weather/DriveRouteMap'

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

describe('DriveRouteMap section annotations', () => {
  it('keeps short non-zero sections visibly non-zero', () => {
    expect(driveRouteMapAnnotationDistanceLabel(0.04, 'is-IS')).toBe('0,04')
    expect(driveRouteMapAnnotationDistanceLabel(0.004, 'is-IS')).toBe('0,004')
    expect(driveRouteMapAnnotationDistanceLabel(6.7, 'is-IS')).toBe('6,7')
    expect(driveRouteMapAnnotationDistanceLabel(38.7, 'is-IS')).toBe('38,7')
  })

  it('keeps compact section distances inside distinct markers and focuses the exact section', async () => {
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
        annotationScale={1.5}
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
          },
          {
            id: 'short-gravel',
            kind: 'gravel',
            label: 'Malarvegur',
            point: shortSection[0],
            focusPoints: shortSection,
            distanceKm: 1.2,
          },
          {
            id: 'wind-coverage-gap',
            kind: 'weather_coverage_gap',
            label: 'Takmörkuð vindgögn',
            point: longSection[0],
            focusPoints: longSection,
            distanceKm: 63.4,
          },
        ]}
      />,
    )

    const longMarker = await screen.findByRole('button', { name: '8,3 km · Malarvegur' })
    const shortMarker = screen.getByRole('button', { name: '1,2 km · Malarvegur' })
    const windGapMarker = screen.getByRole('button', {
      name: '63,4 km · Takmörkuð vindgögn',
    })

    expect(longMarker.style.width).toBe('50px')
    expect(longMarker.style.height).toBe('50px')
    expect(longMarker.style.position).toBe('absolute')
    expect(shortMarker.style.position).toBe('absolute')
    expect(longMarker).toHaveTextContent('8,3')
    expect(shortMarker).toHaveTextContent('1,2')
    expect(windGapMarker).toHaveTextContent('63,4')
    expect(windGapMarker).toHaveAttribute('data-route-annotation-kind', 'weather_coverage_gap')
    const markerBadge = longMarker.firstElementChild as HTMLElement
    const markerDistance = markerBadge.lastElementChild as HTMLElement
    expect(markerBadge.style.transform).toBe('scale(var(--teskeid-map-annotation-scale, 1))')
    expect(markerDistance.style.font).toContain('11px')
    expect(screen.getByRole('group', { name: 'Leiðakort' }).style.getPropertyValue(
      '--teskeid-map-annotation-scale',
    )).toBe('1.5')
    expect(screen.queryByText('8,3 km · Malarvegur')).not.toBeInTheDocument()
    expect(screen.queryByText('1,2 km · Malarvegur')).not.toBeInTheDocument()

    fireEvent.focus(shortMarker)
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
