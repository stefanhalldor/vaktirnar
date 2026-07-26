import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { driveRouteMapSpy } = vi.hoisted(() => ({ driveRouteMapSpy: vi.fn() }))

vi.mock('@/components/weather/DriveRouteMap', () => ({
  DriveRouteMap: (props: unknown) => {
    driveRouteMapSpy(props)
    return <div data-testid="drive-route-map" />
  },
}))

import {
  RouteComparisonMiniMap,
  routeComparisonColor,
  selectBestWeatherRouteIds,
} from '@/components/weather/RouteComparisonMiniMap'

const POINTS = [
  { lat: 64.1, lon: -21.9 },
  { lat: 65.6, lon: -18.1 },
]

beforeEach(() => {
  driveRouteMapSpy.mockClear()
})

describe('RouteComparisonMiniMap', () => {
  it('stays hidden until at least two drawable routes exist', () => {
    const { container } = render(
      <RouteComparisonMiniMap
        ariaLabel="Leiðasamanburður"
        routes={[{ id: 'google', label: 'Google-leið', provider: 'google', points: POINTS, selected: true }]}
      />,
    )

    expect(container).toBeEmptyDOMElement()
    expect(driveRouteMapSpy).not.toHaveBeenCalled()
  })

  it('renders both providers through the shared map core with distinct side-by-side lines', () => {
    render(
      <RouteComparisonMiniMap
        ariaLabel="Leiðasamanburður"
        routes={[
          { id: 'google', label: 'Google-leið', provider: 'google', points: POINTS, selected: true },
          { id: 'teskeid', label: 'Teskeiðarleið', provider: 'teskeid', points: POINTS, selected: false },
        ]}
      />,
    )

    expect(screen.getByTestId('drive-route-map')).toBeInTheDocument()
    expect(screen.getByText('Google-leið')).toBeInTheDocument()
    expect(screen.getByText('Teskeiðarleið')).toBeInTheDocument()
    expect(driveRouteMapSpy).toHaveBeenCalledWith(expect.objectContaining({
      ariaLabel: 'Leiðasamanburður',
      interactive: false,
      routes: [
        expect.objectContaining({ id: 'google', color: '#2563eb', offset: -1.5, width: 5 }),
        expect.objectContaining({ id: 'teskeid', color: '#ea580c', offset: 1.5, width: 4 }),
      ],
    }))
  })

  it('uses a high-contrast color sequence for adjacent alternatives', () => {
    expect(Array.from({ length: 6 }, (_, index) => routeComparisonColor(index))).toEqual([
      '#2563eb',
      '#ea580c',
      '#0f766e',
      '#c026d3',
      '#4d7c0f',
      '#be123c',
    ])
  })
})

describe('selectBestWeatherRouteIds', () => {
  it('selects only the first minimum-score route when tied routes use different stations', () => {
    expect([...selectBestWeatherRouteIds([
      { routeId: 'route-1', score: 0, stationIds: ['A', 'B'] },
      { routeId: 'route-2', score: 0, stationIds: ['A', 'C'] },
    ])]).toEqual(['route-1'])
  })

  it('shares the badge when tied routes use the exact same station set', () => {
    expect([...selectBestWeatherRouteIds([
      { routeId: 'route-1', score: 0, stationIds: ['A', 'B'] },
      { routeId: 'route-2', score: 0, stationIds: ['B', 'A', 'A'] },
    ])]).toEqual(['route-1', 'route-2'])
  })

  it('does not share the badge with an identical station set when the score is worse', () => {
    expect([...selectBestWeatherRouteIds([
      { routeId: 'route-1', score: 0, stationIds: ['A', 'B'] },
      { routeId: 'route-2', score: 1, stationIds: ['A', 'B'] },
    ])]).toEqual(['route-1'])
  })
})
