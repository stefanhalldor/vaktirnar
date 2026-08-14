import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FERDALAGID_ROUTE_RESTORE_SCHEMA_VERSION, FERDALAGID_ROUTE_RESTORE_TTL_MS } from '@/lib/road-intelligence/ferdalagidRouteRestore'

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
}))

vi.mock('next-intl', () => {
  const translate = Object.assign((key: string) => key, {
    rich: (key: string) => key,
  })
  return {
    useTranslations: () => translate,
    useLocale: () => 'is',
  }
})

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

vi.mock('@/components/weather/TravelAuditMap', () => ({
  TravelAuditMap: () => <div data-testid="travel-audit-map" />,
}))
vi.mock('@/components/weather/ForecastDrawer', () => ({ ForecastDrawer: () => null }))
vi.mock('@/components/weather/DepartureHeatmap', () => ({ DepartureHeatmap: () => null }))
vi.mock('@/components/weather/RouteSelectionStep', () => ({
  RouteSelectionStep: ({
    selectedRouteId,
    onRouteSelected,
    onConfirm,
  }: {
    selectedRouteId: string | null
    onRouteSelected: (id: string) => void
    onConfirm: () => void
  }) => (
    <div data-testid="route-selection">
      <span>{selectedRouteId}</span>
      <button type="button" onClick={() => onRouteSelected('teskeid-road-graph-v1-primary-test')}>
        test-select-route
      </button>
      <button type="button" onClick={onConfirm} disabled={!selectedRouteId}>
        test-confirm-route
      </button>
    </div>
  ),
}))
vi.mock('@/components/weather/WeatherResultLoader', () => ({ WeatherResultLoader: () => null }))
vi.mock('@/components/weather/WeatherBetaBanner', () => ({ WeatherBetaBanner: () => null }))
vi.mock('@/components/teskeid/TeskeidMenu', () => ({ TeskeidMenu: () => null }))
vi.mock('@/components/weather/WeatherWatchersComparison', () => ({ WeatherWatchersComparison: () => null }))
vi.mock('@/components/weather/RouteWeatherPointDetailCard', () => ({ RouteWeatherPointDetailCard: () => null }))
vi.mock('@/components/weather/WindStatusBadge', () => ({ WindStatusBadge: () => null }))
vi.mock('@/components/weather/VedurstofanPointCard', () => ({ VedurstofanPointCard: () => null }))
vi.mock('@/components/weather/VedurstofanRoutePulseSummary', () => ({ VedurstofanRoutePulseSummary: () => null }))

import { FerdalagidClient } from '@/app/auth-mvp/vedrid/FerdalagidClient'

const RESTORE_KEY = 'vaktirnar:weather-route-restore'
const ORIGIN = { name: 'Reykjavík', lat: 64.135, lon: -21.895 }
const DESTINATION = { name: 'Akureyri', lat: 65.683, lon: -18.1 }
const TESKEID_ROUTE = {
  id: 'teskeid-road-graph-v1-primary-test',
  routeIndex: 0,
  provider: 'teskeid' as const,
  labels: ['TESKEID_PRIMARY'],
  isDefault: true,
  points: [ORIGIN, DESTINATION],
  distanceM: 388_000,
  durationS: 17_100,
}
const READY_SCOPE = {
  status: 'ready' as const,
  scopeId: `assessment:v3:${'a'.repeat(43)}`,
  origin: { ...ORIGIN, source: 'official' as const },
  destination: { ...DESTINATION, source: 'official' as const },
}

function legacyRestore(savedAtIso: string) {
  return {
    schemaVersion: FERDALAGID_ROUTE_RESTORE_SCHEMA_VERSION,
    savedAtIso,
    step: 'result',
    origin: ORIGIN,
    destination: DESTINATION,
    trailerKind: 'none',
    thresholdOverrides: {},
    selectedRouteId: 'google-legacy-route',
    result: {
      id: 'legacy-weather-result',
      stada: 'graent',
      svar: 'Eldri niðurstaða',
      travelPlan: {
        route: {
          distanceKm: 388,
          durationMinutes: 285,
          auditPolylinePoints: [ORIGIN, DESTINATION],
        },
        outbound: {
          windowMode: true,
          candidates: [],
          timelineCandidates: [],
        },
        routeWeatherPoints: [],
        destinationForecastRows: [],
      },
    },
  }
}

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: vi.fn(async () => body),
  } as unknown as Response
}

function requestedUrls(): string[] {
  return mocks.fetch.mock.calls.map(([input]) => String(input))
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  window.history.replaceState(null, '', '/auth-mvp/vedrid/ferdalagid')
  vi.stubGlobal('fetch', mocks.fetch)
  mocks.fetch.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url === '/api/teskeid/weather/saved-places') return response({ places: [] })
    if (url === '/api/teskeid/weather/travel/routes') {
      return response({
        status: 'ready',
        assessmentScope: READY_SCOPE,
        routes: [TESKEID_ROUTE],
        routeEnvelopes: [{
          version: 1,
          issuedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
          assessmentScopeId: READY_SCOPE.scopeId,
          origin: { lat: ORIGIN.lat, lon: ORIGIN.lon },
          destination: { lat: DESTINATION.lat, lon: DESTINATION.lon },
          route: TESKEID_ROUTE,
          signature: 'test-signature',
        }],
        recommendedRouteId: TESKEID_ROUTE.id,
      })
    }
    if (url === '/api/teskeid/weather/travel') {
      return response({ error: 'test-stop-after-request' }, 500)
    }
    throw new Error(`unexpected network request: ${url}`)
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

describe('Ferðalagið v238 old-tab runtime boundary', () => {
  it('renders an in-TTL Google result read-only while only rediscovering Teskeið routes', async () => {
    const originalSavedAt = new Date(Date.now() - 5 * 60_000).toISOString()
    sessionStorage.setItem(RESTORE_KEY, JSON.stringify(legacyRestore(originalSavedAt)))

    render(<FerdalagidClient />)

    expect(await screen.findByText('legacyRouteReadOnlyNotice')).toBeInTheDocument()
    await waitFor(() => {
      expect(requestedUrls()).toContain('/api/teskeid/weather/travel/routes')
    })

    const urls = requestedUrls()
    expect(urls).toContain('/api/teskeid/weather/saved-places')
    expect(urls).not.toContain('/api/teskeid/weather/travel')
    expect(urls).not.toContain('/api/teskeid/weather/provider-stations')
    expect(urls).not.toContain('/api/teskeid/weather/vedurstofan/freshness')
    expect(urls.every(url => !url.includes('routes.googleapis.com'))).toBe(true)

    await waitFor(() => {
      expect(sessionStorage.getItem(RESTORE_KEY)).toContain(originalSavedAt)
    })
  })

  it('requires explicit reselection before leaving the read-only result', async () => {
    sessionStorage.setItem(
      RESTORE_KEY,
      JSON.stringify(legacyRestore(new Date(Date.now() - 5 * 60_000).toISOString())),
    )
    render(<FerdalagidClient />)

    await screen.findByText('legacyRouteReadOnlyNotice')
    await waitFor(() => {
      expect(screen.queryByTestId('route-selection')).not.toBeInTheDocument()
    })
    await waitFor(() => expect(requestedUrls()).toContain('/api/teskeid/weather/travel/routes'))

    fireEvent.click(screen.getByRole('button', { name: 'legacyRouteReselect' }))

    expect(await screen.findByTestId('route-selection')).toHaveTextContent(TESKEID_ROUTE.id)
    expect(screen.queryByText('legacyRouteReadOnlyNotice')).not.toBeInTheDocument()
    expect(sessionStorage.getItem(RESTORE_KEY)).toBeNull()
    expect(requestedUrls()).not.toContain('/api/teskeid/weather/travel')
  })

  it('clears a legacy result on normal route reselection and sends the chosen trailer on explicit submit', async () => {
    sessionStorage.setItem(
      RESTORE_KEY,
      JSON.stringify(legacyRestore(new Date(Date.now() - 5 * 60_000).toISOString())),
    )
    render(<FerdalagidClient />)

    await screen.findByText('legacyRouteReadOnlyNotice')
    await waitFor(() => expect(requestedUrls()).toContain('/api/teskeid/weather/travel/routes'))

    const routeNav = screen.getByRole('navigation', { name: 'stepNavAriaLabel' }).querySelectorAll('button')[0]
    expect(routeNav).not.toBeNull()
    fireEvent.click(routeNav!)

    fireEvent.click(await screen.findByRole('button', { name: 'test-select-route' }))
    expect(screen.queryByText('legacyRouteReadOnlyNotice')).not.toBeInTheDocument()
    expect(sessionStorage.getItem(RESTORE_KEY)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'test-confirm-route' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'stepTrailerTitle' }), {
      target: { value: 'caravan' },
    })
    fireEvent.change(screen.getByLabelText('thresholdCautionWind'), {
      target: { value: '10' },
    })
    fireEvent.change(screen.getByLabelText('thresholdRedWind'), {
      target: { value: '20' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'thresholdSubmit' }))

    await waitFor(() => {
      expect(requestedUrls()).toContain('/api/teskeid/weather/travel')
    })
    const travelCall = mocks.fetch.mock.calls.find(([input]) => (
      String(input) === '/api/teskeid/weather/travel'
    ))
    expect(travelCall).toBeDefined()
    const body = JSON.parse(String((travelCall?.[1] as RequestInit).body))
    expect(body.trailerKind).toBe('caravan')
    expect(body.routeEnvelope.route.id).toBe(TESKEID_ROUTE.id)
  })

  it('does not let a changed trailer return to a result calculated with another trailer', async () => {
    sessionStorage.setItem(
      RESTORE_KEY,
      JSON.stringify({
        ...legacyRestore(new Date(Date.now() - 5 * 60_000).toISOString()),
        selectedRouteId: TESKEID_ROUTE.id,
        submittedTrailerKind: 'none',
        submittedThresholds: {},
      }),
    )
    render(<FerdalagidClient />)

    await waitFor(() => expect(requestedUrls()).toContain('/api/teskeid/weather/travel/routes'))
    const thresholdNav = screen.getByRole('navigation', { name: 'stepNavAriaLabel' }).querySelectorAll('button')[1]
    fireEvent.click(thresholdNav)
    fireEvent.change(screen.getByRole('combobox', { name: 'stepTrailerTitle' }), {
      target: { value: 'caravan' },
    })

    const resultNav = screen.getByRole('button', { name: 'stepNavResult' })
    expect(resultNav).toBeDisabled()
    expect(resultNav).toHaveAttribute('title', 'resultInputsDirtyNavHint')
  })

  it('invalidates an expired old-tab result instead of refreshing or displaying it', async () => {
    sessionStorage.setItem(
      RESTORE_KEY,
      JSON.stringify(legacyRestore(
        new Date(Date.now() - FERDALAGID_ROUTE_RESTORE_TTL_MS - 1).toISOString(),
      )),
    )

    render(<FerdalagidClient />)

    await waitFor(() => expect(sessionStorage.getItem(RESTORE_KEY)).toBeNull())
    expect(screen.queryByText('legacyRouteReadOnlyNotice')).not.toBeInTheDocument()
    expect(requestedUrls()).not.toContain('/api/teskeid/weather/travel')
    expect(requestedUrls()).not.toContain('/api/teskeid/weather/vedurstofan/freshness')
  })
})
