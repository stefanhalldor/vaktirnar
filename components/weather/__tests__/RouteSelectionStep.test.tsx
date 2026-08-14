import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/components/weather/PlaceSearch', () => ({
  PlaceSearch: () => <div data-testid="place-search" />,
}))

vi.mock('@/lib/weather/googleMaps.client', () => ({
  loadMapsLibrary: vi.fn(() => new Promise(() => undefined)),
  loadMarkerLibrary: vi.fn(() => new Promise(() => undefined)),
  loadCoreLibrary: vi.fn(() => new Promise(() => undefined)),
}))

vi.mock('@/components/weather/ProviderStationPreviewCard', () => ({
  ProviderStationPreviewCard: () => null,
}))
vi.mock('@/components/weather/VedurstofanPulseInline', () => ({
  VedurstofanPulseInline: () => null,
}))

import { RouteSelectionStep } from '@/components/weather/RouteSelectionStep'
import type { RouteOption } from '@/lib/weather/provider.types'

const ORIGIN = { name: 'Reykjavík', lat: 64.1466, lon: -21.9426 }
const DESTINATION = { name: 'Akureyri', lat: 65.6885, lon: -18.1262 }

function route(
  id: string,
  durationS: number,
  distanceM: number,
  overrides: Partial<RouteOption> = {},
): RouteOption {
  return {
    id,
    routeIndex: -1,
    provider: 'teskeid',
    labels: ['TESKEID_EXPERIMENTAL'],
    isDefault: false,
    points: [ORIGIN, DESTINATION],
    distanceM,
    durationS,
    ...overrides,
  }
}

describe('RouteSelectionStep', () => {
  it('labels the actual minimum-duration route as fastest when the recommended route is longer', () => {
    render(
      <RouteSelectionStep
        origin={ORIGIN}
        destination={DESTINATION}
        onOriginSelected={() => undefined}
        onDestinationSelected={() => undefined}
        onClearOrigin={() => undefined}
        onClearDestination={() => undefined}
        routeOptions={[
          route('recommended-safe', 18_000, 380_000),
          route('fastest', 16_000, 267_000),
        ]}
        routeOptionsLoading={false}
        routeOptionsError={null}
        onRetryRoutes={() => undefined}
        selectedRouteId="recommended-safe"
        onRouteSelected={() => undefined}
        onConfirm={() => undefined}
        confirmLabel="confirm"
        locale="is"
      />,
    )

    expect(screen.getByText('routeOptionShortest')).toBeInTheDocument()
    expect(screen.getByText('routeOptionOther')).toBeInTheDocument()
    expect(screen.getByText('routeOptionShortest').closest('button'))
      .toHaveTextContent('267 km')
  })

  it('shows one merged east-Hellisheiði route with Öxi caution as Öxi', () => {
    render(
      <RouteSelectionStep
        origin={ORIGIN}
        destination={DESTINATION}
        onOriginSelected={() => undefined}
        onDestinationSelected={() => undefined}
        onClearOrigin={() => undefined}
        onClearDestination={() => undefined}
        routeOptions={[route('merged-oxi', 16_000, 267_000, {
          labels: [
            'CURATED_VIA_HELLISHEIDI',
            'CURATED_EAST_ICELAND_VIA_HELLISHEIDI',
          ],
          cautions: [{
            id: 'oxi-axarvegur-939',
            severity: 'caution',
            labelKey: 'oxi',
            appliesTo: ['all'],
          }],
        })]}
        routeOptionsLoading={false}
        routeOptionsError={null}
        onRetryRoutes={() => undefined}
        selectedRouteId="merged-oxi"
        onRouteSelected={() => undefined}
        onConfirm={() => undefined}
        confirmLabel="confirm"
        locale="is"
      />,
    )

    expect(screen.getByText('routeOptionOxi')).toBeInTheDocument()
    expect(screen.queryByText('routeOptionEastViaHellisheidi')).not.toBeInTheDocument()
  })
})
