import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  formatRouteCoverageBoundaryLabel,
  RouteNavigationHandoff,
} from '@/components/weather/RouteNavigationHandoff'
const ORIGIN = { lat: 64.146582123456, lon: -21.942635987654 }
const DESTINATION = { lat: 63.933008765432, lon: -20.997120123456 }
const LABELS = {
  assessmentTitle: 'Teskeið assesses the weather conditions for the route:',
  navigationTitle: 'Detailed directions:',
  boundaryFallback: 'Confirmed road point',
  settlementBoundary: 'Urban boundary',
  officialRoadBoundary: 'Confirmed road point',
  openDirections: 'Open directions in Google Maps',
}
const PLACE_LABELS = {
  assessment: {
    originName: 'Garðabær',
    destinationName: 'Akranes',
  },
  navigation: {
    origin: ORIGIN,
    destination: DESTINATION,
    originName: 'Melás 8',
    destinationName: 'Ásabraut 19',
  },
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
  assessment: typeof PLACE_LABELS.assessment | null = PLACE_LABELS.assessment,
  origin = ORIGIN,
) {
  return render(
    <RouteNavigationHandoff
      assessment={assessment}
      navigation={{ ...PLACE_LABELS.navigation, origin }}
      labels={LABELS}
    />,
  )
}

describe('RouteNavigationHandoff', () => {
  it('keeps the exact handoff visible independently of completed assessment coverage', () => {
    renderHandoff()

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

  it.each(['same-area', 'unavailable'])(
    'shows a neutral exact-only handoff when assessment scope is %s', () => {
      renderHandoff(null)

      const region = screen.getByRole('region', { name: 'Detailed directions:' })
      expect(region).not.toHaveTextContent('Teskeið assesses the weather conditions for the route:')
      expect(region).not.toHaveTextContent('Garðabær')
      expect(region).not.toHaveTextContent('Akranes')
      expect(region).toHaveTextContent('Detailed directions:')
      expect(region).toHaveTextContent('Melás 8')
      expect(region).toHaveTextContent('Ásabraut 19')
      expect(screen.getAllByRole('link', { name: 'Open directions in Google Maps' })).toHaveLength(1)
    },
  )

  it('degrades incomplete assessment labels to the neutral exact-only handoff', () => {
    renderHandoff({ originName: 'Garðabær', destinationName: ' ' })

    const region = screen.getByRole('region', { name: 'Detailed directions:' })
    expect(region).not.toHaveTextContent('Teskeið assesses the weather conditions for the route:')
    expect(region).not.toHaveTextContent('Garðabær')
    expect(region).toHaveTextContent('Melás 8')
    expect(region).toHaveTextContent('Ásabraut 19')
  })

  it('keeps boundary formatting available for route-map markers', () => {
    expect(formatRouteCoverageBoundaryLabel(START, LABELS)).toBe('Urban boundary: Garðabær')
    expect(formatRouteCoverageBoundaryLabel(END, LABELS)).toBe('Confirmed road point: 1')
  })

  it('fails closed without rendering a broken external link', () => {
    const { container } = renderHandoff(
      PLACE_LABELS.assessment,
      { lat: Number.NaN, lon: ORIGIN.lon },
    )

    expect(container).toBeEmptyDOMElement()
  })
})
