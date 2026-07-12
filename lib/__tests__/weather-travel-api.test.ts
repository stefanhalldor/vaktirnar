/**
 * Tests for POST /api/teskeid/weather/travel/route (final-submit path).
 *
 * Focused regression: a selected curated route (CURATED_VIA_THRENGSLAVEGUR)
 * must survive final-submit recomputation without returning selected_route_unavailable.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockGetUser } = vi.hoisted(() => ({ mockGetUser: vi.fn() }))
const { mockCheckFeatureAccess } = vi.hoisted(() => ({ mockCheckFeatureAccess: vi.fn() }))
const { mockGetRouteOptions } = vi.hoisted(() => ({ mockGetRouteOptions: vi.fn() }))
const { mockGetRouteGeometry } = vi.hoisted(() => ({ mockGetRouteGeometry: vi.fn() }))
const { mockFetchForecast } = vi.hoisted(() => ({ mockFetchForecast: vi.fn() }))
const { mockSampleRouteWeatherPoints } = vi.hoisted(() => ({ mockSampleRouteWeatherPoints: vi.fn() }))
const { mockFetchVedurstofan } = vi.hoisted(() => ({ mockFetchVedurstofan: vi.fn() }))
const { mockGetUniqueStationIds, mockMapRoutePoint } = vi.hoisted(() => ({
  mockGetUniqueStationIds: vi.fn(),
  mockMapRoutePoint: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}))

vi.mock('@/lib/loans/guard', () => ({
  checkFeatureAccess: mockCheckFeatureAccess,
}))

vi.mock('@/lib/weather/provider.server', () => ({
  getWeatherMapProvider: vi.fn(() => ({
    getRouteOptions: mockGetRouteOptions,
    getRouteGeometry: mockGetRouteGeometry,
  })),
}))

vi.mock('@/lib/weather/metno.server', () => ({
  fetchForecast: mockFetchForecast,
}))

vi.mock('@/lib/weather/routeSampling', () => ({
  sampleRouteWeatherPoints: mockSampleRouteWeatherPoints,
}))

vi.mock('@/lib/weather/providers/vedurstofan.server', () => ({
  fetchVedurstofanForecastsForStations: mockFetchVedurstofan,
}))

vi.mock('@/lib/weather/providers/vedurstofanStations', () => ({
  getUniqueStationIdsForRoute: mockGetUniqueStationIds,
  mapRoutePointToVedurstofanStation: mockMapRoutePoint,
  VEDURSTOFAN_STATIONS: [],
}))

import { POST } from '@/app/api/teskeid/weather/travel/route'

// ── Helpers ───────────────────────────────────────────────────────────────────

// Valid Iceland coordinates for Garðabær and Þorlákshöfn
const GARDABAER = { name: 'Garðabær', lat: 64.09, lon: -21.93 }
const THORLAKSHOFN = { name: 'Þorlákshöfn', lat: 63.849, lon: -21.365 }

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/teskeid/weather/travel/route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function authedUser() {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'test@example.com' } } })
  mockCheckFeatureAccess.mockResolvedValue(true)
}

function makeRouteOption(id: string, labels: string[], routeIndex = 0) {
  return {
    id,
    routeIndex,
    provider: 'google' as const,
    labels,
    isDefault: labels.includes('DEFAULT_ROUTE'),
    points: [
      { lat: 64.09, lon: -21.93 },
      { lat: 63.849, lon: -21.365 },
    ],
    distanceM: 56000,
    durationS: 3420,
  }
}

function makeHour(time: string) {
  return {
    time,
    airTemperatureC: 10,
    windSpeedMs: 3,
    windGustMs: 5,
    windFromDegrees: 180,
    precipitationMmPerHour: 0,
    symbolCode: 'clearsky_day',
  }
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  process.env.AUTH_MVP_ENABLED = 'true'
  process.env.WEATHER_ENABLED = 'true'

  mockSampleRouteWeatherPoints.mockReturnValue({
    weatherPoints: [{
      lat: 64.09, lon: -21.93,
      forecastLat: 64.09, forecastLon: -21.93,
      routeIndex: 0, distanceFromOriginM: 0,
    }],
    diagnostics: { strategy: 'exhaustive', totalCells: 1, sampledCells: 1 },
  })

  mockFetchForecast.mockResolvedValue([
    makeHour('2026-07-10T08:00:00Z'),
    makeHour('2026-07-10T09:00:00Z'),
    makeHour('2026-07-10T10:00:00Z'),
  ])

  // Default route geometry for non-selectedRouteId tests
  mockGetRouteGeometry.mockResolvedValue({
    points: [{ lat: 64.09, lon: -21.93 }, { lat: 63.849, lon: -21.365 }],
    distanceM: 56000,
    durationS: 3420,
  })

  // Default: no Veðurstofan stations — enrichment is skipped
  mockGetUniqueStationIds.mockReturnValue([])
  mockFetchVedurstofan.mockResolvedValue(new Map())
  mockMapRoutePoint.mockReturnValue(null)
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/teskeid/weather/travel/route — curated route final-submit', () => {
  it('succeeds when selectedRouteId matches a curated CURATED_VIA_THRENGSLAVEGUR route', async () => {
    authedUser()
    const curatedId = 'google-56000-64.0900,-21.9300-63.9695,-21.6475-63.8490,-21.3650'
    mockGetRouteOptions.mockResolvedValue([
      makeRouteOption('google-default-id', ['DEFAULT_ROUTE']),
      makeRouteOption(curatedId, ['CURATED_VIA_THRENGSLAVEGUR'], -1),
    ])

    const res = await POST(makeRequest({
      origin: { ...GARDABAER, placeId: 'ChIJgardabaer' },
      destination: { ...THORLAKSHOFN, placeId: 'ChIJU1N290hC1kgRypBJRWS0YX4' },
      trailerKind: 'none',
      selectedRouteId: curatedId,
    }))

    expect(res.status).not.toBe(422)
    const body = await res.json()
    expect(body.error).not.toBe('selected_route_unavailable')
  })

  it('returns selected_route_unavailable when curated id is not in provider results', async () => {
    authedUser()
    mockGetRouteOptions.mockResolvedValue([
      makeRouteOption('google-default-id', ['DEFAULT_ROUTE']),
    ])

    const res = await POST(makeRequest({
      origin: { ...GARDABAER, placeId: 'ChIJgardabaer' },
      destination: { ...THORLAKSHOFN, placeId: 'ChIJU1N290hC1kgRypBJRWS0YX4' },
      trailerKind: 'none',
      selectedRouteId: 'google-curated-id-not-in-results',
    }))

    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toBe('selected_route_unavailable')
  })

  it('uses the curated route geometry for weather sampling, not the default route', async () => {
    authedUser()
    const curatedId = 'google-56000-curated'
    const curatedPoints = [
      { lat: 64.09, lon: -21.93 },
      { lat: 63.97, lon: -21.52 },  // via Þrengslavegur
      { lat: 63.849, lon: -21.365 },
    ]
    mockGetRouteOptions.mockResolvedValue([
      makeRouteOption('google-default-id', ['DEFAULT_ROUTE']),
      {
        id: curatedId,
        routeIndex: -1,
        provider: 'google' as const,
        labels: ['CURATED_VIA_THRENGSLAVEGUR'],
        isDefault: false,
        points: curatedPoints,
        distanceM: 56000,
        durationS: 3420,
      },
    ])

    await POST(makeRequest({
      origin: { ...GARDABAER, placeId: 'ChIJgardabaer' },
      destination: { ...THORLAKSHOFN, placeId: 'ChIJU1N290hC1kgRypBJRWS0YX4' },
      trailerKind: 'none',
      selectedRouteId: curatedId,
    }))

    // sampleRouteWeatherPoints should have been called with the curated route's points
    const samplingCall = mockSampleRouteWeatherPoints.mock.calls[0]
    expect(samplingCall[0]).toEqual(curatedPoints)
  })
})

// ── Veðurstofan enrichment ─────────────────────────────────────────────────────

const HELLISH_ID = '31392'

function makeVedurstofanPayload() {
  return {
    source: 'vedurstofan' as const,
    endpoint: 'xml' as const,
    type: 'forec' as const,
    lang: 'is' as const,
    timeStep: '3h' as const,
    params: ['F', 'D', 'T', 'R', 'W'] as ['F', 'D', 'T', 'R', 'W'],
    stationId: HELLISH_ID,
    stationName: 'Hellisheiði',
    atimeIso: '2026-07-10T06:00:00Z',
    fetchedAtIso: new Date().toISOString(),
    expiresAtIso: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
    attribution: { provider: 'Veðurstofa Íslands' as const, downloadedAtIso: '', serviceUrl: '' },
    forecasts: [
      { ftimeIso: '2026-07-10T09:00:00Z', windSpeedMs: 12, windDirectionText: 'N', temperatureC: 5, precipitationMmPerHour: 0.5, weatherText: 'Skýjað' },
      { ftimeIso: '2026-07-10T12:00:00Z', windSpeedMs: 8, windDirectionText: 'NV', temperatureC: 6, precipitationMmPerHour: 0, weatherText: 'Hlýtt' },
    ],
    parseErrors: [],
  }
}

function setupEnrichment() {
  mockGetUniqueStationIds.mockReturnValue([HELLISH_ID])
  mockMapRoutePoint.mockReturnValue({
    station: { stationId: HELLISH_ID, stationName: 'Hellisheiði' },
    distanceFromRoutePointM: 2000,
    confidence: 'good',
  })
}

describe('POST /api/teskeid/weather/travel/route — Veðurstofan enrichment', () => {
  it('populates forecastRows on route points when station data is available', async () => {
    authedUser()
    setupEnrichment()
    mockFetchVedurstofan.mockResolvedValue(
      new Map([[HELLISH_ID, { status: 'ok', payload: makeVedurstofanPayload() }]]),
    )

    const res = await POST(makeRequest({ origin: GARDABAER, destination: THORLAKSHOFN, trailerKind: 'none' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    const points = body.travelPlan?.routeWeatherPoints
    expect(points).toBeDefined()
    const station = points[0]?.vedurstofanStation
    expect(station).toBeDefined()
    expect(station.stationId).toBe(HELLISH_ID)
    expect(station.forecastRows).toHaveLength(2)
    expect(station.forecastRows[0].windSpeedMs).toBe(12)
    expect(station.forecastRows[1].windSpeedMs).toBe(8)
  })

  it('populates stale forecastRows when station result has status stale', async () => {
    authedUser()
    setupEnrichment()
    mockFetchVedurstofan.mockResolvedValue(
      new Map([[HELLISH_ID, { status: 'stale', payload: makeVedurstofanPayload() }]]),
    )

    const res = await POST(makeRequest({ origin: GARDABAER, destination: THORLAKSHOFN, trailerKind: 'none' }))
    const body = await res.json()
    const station = body.travelPlan?.routeWeatherPoints?.[0]?.vedurstofanStation
    expect(station?.status).toBe('stale')
    expect(station?.forecastRows).toHaveLength(2)
  })

  it('returns MET/Yr result without vedurstofanStation when Veðurstofan rejects', async () => {
    authedUser()
    setupEnrichment()
    mockFetchVedurstofan.mockRejectedValue(new Error('network failure'))

    const res = await POST(makeRequest({ origin: GARDABAER, destination: THORLAKSHOFN, trailerKind: 'none' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.travelPlan).toBeDefined()
    expect(body.travelPlan?.routeWeatherPoints?.[0]?.vedurstofanStation).toBeUndefined()
  })

  it('omits vedurstofanStation when station result is unavailable', async () => {
    authedUser()
    setupEnrichment()
    mockFetchVedurstofan.mockResolvedValue(
      new Map([[HELLISH_ID, { status: 'unavailable' }]]),
    )

    const res = await POST(makeRequest({ origin: GARDABAER, destination: THORLAKSHOFN, trailerKind: 'none' }))
    const body = await res.json()
    expect(body.travelPlan?.routeWeatherPoints?.[0]?.vedurstofanStation).toBeUndefined()
  })

  it('omits vedurstofanStation entirely when payload has no forecast rows', async () => {
    authedUser()
    setupEnrichment()
    const emptyPayload = { ...makeVedurstofanPayload(), forecasts: [] }
    mockFetchVedurstofan.mockResolvedValue(
      new Map([[HELLISH_ID, { status: 'ok', payload: emptyPayload }]]),
    )

    const res = await POST(makeRequest({ origin: GARDABAER, destination: THORLAKSHOFN, trailerKind: 'none' }))
    const body = await res.json()
    // Station must be omitted entirely — not a partial object with no rows
    expect(body.travelPlan?.routeWeatherPoints?.[0]?.vedurstofanStation).toBeUndefined()
  })

  it('returns MET/Yr result when global budget elapses before provider resolves', async () => {
    authedUser()
    setupEnrichment()
    // Provider never settles — simulates all batches timing out beyond global budget
    mockFetchVedurstofan.mockReturnValue(new Promise(() => {}))

    vi.useFakeTimers()
    const requestPromise = POST(makeRequest({ origin: GARDABAER, destination: THORLAKSHOFN, trailerKind: 'none' }))
    // Advance past the 2000ms global budget
    await vi.advanceTimersByTimeAsync(2500)
    const res = await requestPromise
    vi.useRealTimers()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.travelPlan).toBeDefined()
    // Veðurstofan enrichment dropped — budget elapsed
    expect(body.travelPlan?.routeWeatherPoints?.[0]?.vedurstofanStation).toBeUndefined()
  })
})
