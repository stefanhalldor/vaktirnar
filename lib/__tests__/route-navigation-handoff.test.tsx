import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { RouteNavigationHandoff } from '@/components/weather/RouteNavigationHandoff'
import type { RouteWeatherCoverage } from '@/lib/iceland-routes/trustedRouteCoverage'

const ORIGIN = { lat: 64.146582123456, lon: -21.942635987654 }
const DESTINATION = { lat: 63.933008765432, lon: -20.997120123456 }
const LABELS = {
  partialTitle: 'Weather coverage boundary',
  sameUrbanTitle: 'This trip is within one town.',
  unavailableTitle: 'A trusted road section could not be confirmed.',
  coverageStart: 'From',
  coverageEnd: 'To',
  boundaryFallback: 'Confirmed road point',
  settlementBoundary: 'Urban boundary',
  officialRoadBoundary: 'Confirmed road point',
  beforeCoverageAction: 'Open first segment in Google Maps',
  afterCoverageAction: 'Continue the last segment in Google Maps',
  fullTripAction: 'Open the whole trip in Google Maps',
}

const START = {
  kind: 'settlement_gateway' as const,
  label: 'Reykjavík gateway',
  point: { lat: 64.10987654321, lon: -21.75012345678 },
  routeFraction: 0.1,
  distanceFromTripOriginM: 10_000,
  elapsedFromTripOriginS: 600,
}
const END = {
  kind: 'official_road_anchor' as const,
  label: 'Road 1 at Hella',
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
    const { container } = render(
      <RouteNavigationHandoff
        coverage={coverage}
        origin={ORIGIN}
        destination={DESTINATION}
        labels={LABELS}
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('shows exact coverage boundaries and hands the last mile to Google Maps', () => {
    const coverage: RouteWeatherCoverage = {
      status: 'partial',
      start: START,
      end: END,
      coverageDistanceM: 80_000,
      coverageDurationS: 4_800,
      unassessedAfterM: 10_000,
      distanceConfidence: 'reference_route',
    }
    render(
      <RouteNavigationHandoff
        coverage={coverage}
        origin={ORIGIN}
        destination={DESTINATION}
        labels={LABELS}
      />,
    )

    expect(screen.getByRole('region', { name: 'Weather coverage boundary' })).toBeInTheDocument()
    expect(screen.getByText('Urban boundary: Reykjavík gateway')).toBeInTheDocument()
    expect(screen.getByText('Confirmed road point: 1')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Continue the last segment in Google Maps' })
    const url = new URL(link.getAttribute('href')!)
    expect(url.searchParams.get('origin')).toBe(`${END.point.lat},${END.point.lon}`)
    expect(url.searchParams.get('destination')).toBe(`${DESTINATION.lat},${DESTINATION.lon}`)
    expectSafeExternalLink(link)
  })

  it('offers separate exact-coordinate links when both route ends are unassessed', () => {
    const coverage: RouteWeatherCoverage = {
      status: 'partial',
      start: START,
      end: END,
      coverageDistanceM: 80_000,
      coverageDurationS: 4_800,
      unassessedBeforeM: 10_000,
      unassessedAfterM: 10_000,
      distanceConfidence: 'reference_route',
    }
    render(
      <RouteNavigationHandoff
        coverage={coverage}
        origin={ORIGIN}
        destination={DESTINATION}
        labels={LABELS}
      />,
    )

    const first = screen.getByRole('link', { name: 'Open first segment in Google Maps' })
    const last = screen.getByRole('link', { name: 'Continue the last segment in Google Maps' })
    const firstUrl = new URL(first.getAttribute('href')!)
    const lastUrl = new URL(last.getAttribute('href')!)
    expect(firstUrl.searchParams.get('origin')).toBe(`${ORIGIN.lat},${ORIGIN.lon}`)
    expect(firstUrl.searchParams.get('destination')).toBe(`${START.point.lat},${START.point.lon}`)
    expect(lastUrl.searchParams.get('origin')).toBe(`${END.point.lat},${END.point.lon}`)
    expect(lastUrl.searchParams.get('destination')).toBe(`${DESTINATION.lat},${DESTINATION.lon}`)
    expectSafeExternalLink(first)
    expectSafeExternalLink(last)
  })

  it.each<RouteWeatherCoverage>([
    {
      status: 'same_urban_area',
      settlementId: 'hagstofa:0000',
      settlementName: 'Example town',
    },
    {
      status: 'unavailable',
      reason: 'road_graph_unavailable',
    },
  ])('uses a neutral whole-trip Google Maps link for $status', coverage => {
    render(
      <RouteNavigationHandoff
        coverage={coverage}
        origin={ORIGIN}
        destination={DESTINATION}
        labels={LABELS}
      />,
    )

    expect(screen.queryByText('Weather coverage boundary')).not.toBeInTheDocument()
    expect(screen.queryByText('Urban boundary: Reykjavík gateway')).not.toBeInTheDocument()
    expect(screen.getByText(
      coverage.status === 'same_urban_area'
        ? 'This trip is within one town.'
        : 'A trusted road section could not be confirmed.',
    )).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Open the whole trip in Google Maps' })
    const url = new URL(link.getAttribute('href')!)
    expect(url.searchParams.get('origin')).toBe(`${ORIGIN.lat},${ORIGIN.lon}`)
    expect(url.searchParams.get('destination')).toBe(`${DESTINATION.lat},${DESTINATION.lon}`)
    expectSafeExternalLink(link)
  })

  it('fails closed without rendering a broken external link', () => {
    const coverage: RouteWeatherCoverage = {
      status: 'unavailable',
      reason: 'invalid_reference_route',
    }
    const { container } = render(
      <RouteNavigationHandoff
        coverage={coverage}
        origin={{ lat: Number.NaN, lon: ORIGIN.lon }}
        destination={DESTINATION}
        labels={LABELS}
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })
})
