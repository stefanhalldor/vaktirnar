import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  formatRouteCoverageBoundaryLabel,
  RouteNavigationHandoff,
} from '@/components/weather/RouteNavigationHandoff'
import type { RouteWeatherCoverage } from '@/lib/iceland-routes/trustedRouteCoverage'

const ORIGIN = { lat: 64.146582123456, lon: -21.942635987654 }
const DESTINATION = { lat: 63.933008765432, lon: -20.997120123456 }
const LABELS = {
  assessmentTitle: 'Teskeið assesses the weather conditions for the route:',
  routeTitle: 'Route in Teskeið:',
  navigationTitle: 'Detailed directions:',
  boundaryFallback: 'Confirmed road point',
  settlementBoundary: 'Urban boundary',
  officialRoadBoundary: 'Confirmed road point',
  openDirections: 'Open directions in Google Maps',
}
const PLACE_LABELS = {
  originName: 'Melás 8',
  destinationName: 'Ásabraut 19',
  originAreaName: 'Garðabær',
  destinationAreaName: 'Akranes',
}

const START = {
  kind: 'settlement_gateway' as const,
  label: 'Garðabær',
  point: { lat: 64.10987654321, lon: -21.75012345678 },
  routeFraction: 0.1,
  distanceFromTripOriginM: 10_000,
  elapsedFromTripOriginS: 600,
}
const END = {
  kind: 'official_road_anchor' as const,
  label: 'Akranes',
  point: { lat: 63.95345678901, lon: -20.9987654321 },
  routeFraction: 0.9,
  distanceFromTripOriginM: 90_000,
  elapsedFromTripOriginS: 5_400,
  roadNumber: '1',
}

function expectSafeExternalLink(link: HTMLElement) {
  expect(link).toHaveAttribute('target', '_blank')
  expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  expect(link).toHaveAttribute('referrerpolicy', 'no-referrer')
}

function renderHandoff(
  coverage: RouteWeatherCoverage,
  origin = ORIGIN,
) {
  return render(
    <RouteNavigationHandoff
      coverage={coverage}
      origin={origin}
      destination={DESTINATION}
      {...PLACE_LABELS}
      labels={LABELS}
    />,
  )
}

describe('RouteNavigationHandoff', () => {
  it('renders nothing when route-weather coverage is full', () => {
    const coverage: RouteWeatherCoverage = {
      status: 'full',
      start: START,
      end: END,
      coverageDistanceM: 100_000,
      coverageDurationS: 6_000,
      distanceConfidence: 'reference_route',
    }
    const { container } = renderHandoff(coverage)

    expect(container).toBeEmptyDOMElement()
  })

  it('shows uninflected assessed and precise route labels with one secondary full-trip link', () => {
    const coverage: RouteWeatherCoverage = {
      status: 'partial',
      start: START,
      end: END,
      coverageDistanceM: 80_000,
      coverageDurationS: 4_800,
      unassessedAfterM: 10_000,
      distanceConfidence: 'reference_route',
    }
    renderHandoff(coverage)

    const region = screen.getByRole('region', { name: 'Detailed directions:' })
    expect(region).toHaveTextContent('Teskeið assesses the weather conditions for the route:')
    expect(region).toHaveTextContent('Garðabær')
    expect(region).toHaveTextContent('Akranes')
    expect(region).toHaveTextContent('Detailed directions:')
    expect(region).toHaveTextContent('Melás 8')
    expect(region).toHaveTextContent('Ásabraut 19')
    expect(region).not.toHaveTextContent('could not confirm')

    const link = screen.getByRole('link', { name: 'Open directions in Google Maps' })
    const url = new URL(link.getAttribute('href')!)
    expect(url.searchParams.get('origin')).toBe(`${ORIGIN.lat},${ORIGIN.lon}`)
    expect(url.searchParams.get('destination')).toBe(`${DESTINATION.lat},${DESTINATION.lon}`)
    expect(link).not.toHaveClass('bg-primary')
    expect(link).toHaveClass('border-border')
    expectSafeExternalLink(link)
  })

  it.each<RouteWeatherCoverage>([
    {
      status: 'same_urban_area',
      settlementId: 'hagstofa:0000',
      settlementName: 'Garðabær',
    },
    {
      status: 'unavailable',
      reason: 'road_graph_unavailable',
    },
  ])('uses a neutral route label rather than claiming completed weather coverage for $status', coverage => {
    renderHandoff(coverage)

    const region = screen.getByRole('region', { name: 'Detailed directions:' })
    expect(region).toHaveTextContent('Route in Teskeið:')
    expect(region).not.toHaveTextContent('Teskeið assesses the weather conditions for the route:')
    expect(region).toHaveTextContent('Melás 8')
    expect(region).toHaveTextContent('Ásabraut 19')
    expect(screen.getAllByRole('link', { name: 'Open directions in Google Maps' })).toHaveLength(1)
  })

  it('keeps boundary formatting available for route-map markers', () => {
    expect(formatRouteCoverageBoundaryLabel(START, LABELS)).toBe('Urban boundary: Garðabær')
    expect(formatRouteCoverageBoundaryLabel(END, LABELS)).toBe('Confirmed road point: 1')
  })

  it('fails closed without rendering a broken external link', () => {
    const coverage: RouteWeatherCoverage = {
      status: 'unavailable',
      reason: 'invalid_reference_route',
    }
    const { container } = renderHandoff(coverage, { lat: Number.NaN, lon: ORIGIN.lon })

    expect(container).toBeEmptyDOMElement()
  })
})
