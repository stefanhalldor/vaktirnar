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
const { mockReadVegagerdinCurrent } = vi.hoisted(() => ({ mockReadVegagerdinCurrent: vi.fn() }))
const { mockMatchProviderPoints } = vi.hoisted(() => ({
  mockMatchProviderPoints: vi.fn(),
}))
const { mockGetTeskeidRouteCandidateById } = vi.hoisted(() => ({
  mockGetTeskeidRouteCandidateById: vi.fn(),
}))
const { mockIsTeskeidRouteCandidateEnabled } = vi.hoisted(() => ({
  mockIsTeskeidRouteCandidateEnabled: vi.fn(),
}))
const { mockRecordRouteMemory } = vi.hoisted(() => ({ mockRecordRouteMemory: vi.fn() }))
const { mockResolveTrustedRouteCoverage } = vi.hoisted(() => ({
  mockResolveTrustedRouteCoverage: vi.fn(),
}))
const { mockRecordTeskeidUsageEvent, mockRoutePairFingerprint } = vi.hoisted(() => ({
  mockRecordTeskeidUsageEvent: vi.fn(),
  mockRoutePairFingerprint: vi.fn(),
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
  readVedurstofanProductForStations: mockFetchVedurstofan,
  getLastVedurstofanWarmAttemptIso: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/weather/providers/vegagerdinCurrent.server', () => ({
  readVegagerdinCurrentWithHistoryFallback: mockReadVegagerdinCurrent,
}))

vi.mock('@/lib/weather/providers/vedurstofanStations', () => ({
  VEDURSTOFAN_STATIONS: [],
}))

vi.mock('@/lib/weather/providerRouteMatching', () => ({
  DEFAULT_PROVIDER_ROUTE_MAX_DISTANCE_M: 1_000,
  VEGAGERDIN_PROVIDER_ROUTE_MAX_DISTANCE_M: 2_500,
  haversineM: vi.fn((lat1: number, lon1: number, lat2: number, lon2: number) => {
    // Real haversine for cumDist computation in route.ts
    const R = 6_371_000
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLon = (lon2 - lon1) * Math.PI / 180
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }),
  pointToPolylineDistanceM: vi.fn(() => 0),
  matchProviderPointsToRoute: mockMatchProviderPoints,
}))

vi.mock('@/lib/iceland-routes/roadGraphCandidate.server', () => ({
  TESKEID_ROUTE_CANDIDATE_ID: 'teskeid-road-graph-v1',
  TESKEID_ROUTE_CANDIDATE_ID_PREFIX: 'teskeid-road-graph-v1-alt-',
  getTeskeidRouteCandidateById: mockGetTeskeidRouteCandidateById,
  isTeskeidRouteCandidateEnabled: mockIsTeskeidRouteCandidateEnabled,
}))

vi.mock('@/lib/iceland-routes/routeMemory.server', () => ({
  recordRouteMemory: mockRecordRouteMemory,
}))

vi.mock('@/lib/iceland-routes/trustedRouteCoverage.server', () => ({
  resolveTrustedRouteCoverageFromRuntime: mockResolveTrustedRouteCoverage,
}))

vi.mock('@/lib/teskeid/usage.server', () => ({
  recordTeskeidUsageEvent: mockRecordTeskeidUsageEvent,
  routePairFingerprint: mockRoutePairFingerprint,
}))

import { POST } from '@/app/api/teskeid/weather/travel/route'
import { signRouteOptionEnvelope } from '@/lib/iceland-routes/routeOptionEnvelope.server'

// ── Helpers ───────────────────────────────────────────────────────────────────

// Valid Iceland coordinates for Garðabær and Þorlákshöfn
const GARDABAER = { name: 'Garðabær', lat: 64.09, lon: -21.93 }
const THORLAKSHOFN = { name: 'Þorlákshöfn', lat: 63.849, lon: -21.365 }
const GARDABAER_POINT = { lat: GARDABAER.lat, lon: GARDABAER.lon }
const THORLAKSHOFN_POINT = { lat: THORLAKSHOFN.lat, lon: THORLAKSHOFN.lon }
const ASSESSMENT_SCOPE_ID = 'assessment:v2:server-attested-gardabaer-vidibakki'
const ASSESSMENT_ORIGIN = { name: 'Garðabær', lat: 64.0912, lon: -21.9123 }
const ASSESSMENT_DESTINATION = { name: 'Víðibakki', lat: 63.9942, lon: -20.1321 }
const ASSESSMENT_ORIGIN_POINT = { lat: ASSESSMENT_ORIGIN.lat, lon: ASSESSMENT_ORIGIN.lon }
const ASSESSMENT_DESTINATION_POINT = {
  lat: ASSESSMENT_DESTINATION.lat,
  lon: ASSESSMENT_DESTINATION.lon,
}
const ASSESSMENT_PROVIDER_MATCHING_POINTS = [
  ASSESSMENT_ORIGIN_POINT,
  { lat: 64.04, lon: -20.9 },
  ASSESSMENT_DESTINATION_POINT,
]

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
    providerMatchingPoints: [
      { lat: 64.09, lon: -21.93 },
      { lat: 64.04, lon: -21.60 },
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
  process.env.AUTH_CODE_SECRET = 'test-route-envelope-secret-at-least-32-bytes-long'
  delete process.env.WEATHER_PUBLIC_ENABLED
  delete process.env.WEATHER_PROVIDER_VEDURSTOFAN_ENABLED
  delete process.env.WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED
  mockGetTeskeidRouteCandidateById.mockResolvedValue(null)
  mockIsTeskeidRouteCandidateEnabled.mockReturnValue(true)
  mockRecordRouteMemory.mockResolvedValue(undefined)
  mockRecordTeskeidUsageEvent.mockResolvedValue(undefined)
  mockRoutePairFingerprint.mockReturnValue('server-anchor-fingerprint')
  mockResolveTrustedRouteCoverage.mockResolvedValue({
    status: 'full',
    start: {
      kind: 'exact',
      label: GARDABAER.name,
      point: GARDABAER_POINT,
      routeFraction: 0,
      distanceFromTripOriginM: 0,
      elapsedFromTripOriginS: 0,
    },
    end: {
      kind: 'exact',
      label: THORLAKSHOFN.name,
      point: THORLAKSHOFN_POINT,
      routeFraction: 1,
      distanceFromTripOriginM: 56_000,
      elapsedFromTripOriginS: 3_420,
    },
    coverageDistanceM: 56_000,
    coverageDurationS: 3_420,
    distanceConfidence: 'reference_route',
  })

  mockSampleRouteWeatherPoints.mockImplementation((points, cumulativeDistances) => ({
    weatherPoints: [{
      lat: points[0].lat,
      lon: points[0].lon,
      forecastLat: points[0].lat,
      forecastLon: points[0].lon,
      routeIndex: 0,
      distanceFromOriginM: cumulativeDistances[0],
    }],
    diagnostics: {
      mode: 'all_unique_forecast_points',
      rawRoutePointCount: points.length,
      uniqueForecastPointCount: 1,
      selectedWeatherPointCount: 1,
    },
  }))

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

  // Default: no Veðurstofan stations matched — enrichment is skipped
  mockMatchProviderPoints.mockReturnValue([])
  mockFetchVedurstofan.mockResolvedValue(new Map())
  mockReadVegagerdinCurrent.mockResolvedValue({ status: 'unavailable' })
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/teskeid/weather/travel/route — assessment attestation', () => {
  function makeAssessmentEnvelope(scopeId = ASSESSMENT_SCOPE_ID) {
    return signRouteOptionEnvelope({
      origin: ASSESSMENT_ORIGIN_POINT,
      destination: ASSESSMENT_DESTINATION_POINT,
      assessmentScopeId: scopeId,
      route: {
        ...makeRouteOption('google-assessment-ready', ['DEFAULT_ROUTE']),
        points: [
          { lat: ASSESSMENT_ORIGIN.lat, lon: ASSESSMENT_ORIGIN.lon },
          { lat: ASSESSMENT_DESTINATION.lat, lon: ASSESSMENT_DESTINATION.lon },
        ],
        providerMatchingPoints: ASSESSMENT_PROVIDER_MATCHING_POINTS,
      },
    })
  }

  it('uses only signed assessment anchors for fingerprint, coverage and weather, without route-memory', async () => {
    authedUser()
    const routeEnvelope = makeAssessmentEnvelope()

    const response = await POST(makeRequest({
      origin: ASSESSMENT_ORIGIN,
      destination: ASSESSMENT_DESTINATION,
      assessmentScopeId: ASSESSMENT_SCOPE_ID,
      routeEnvelope,
      trailerKind: 'none',
    }))

    expect(response.status).toBe(200)
    expect(mockRoutePairFingerprint).toHaveBeenCalledWith(
      expect.objectContaining({ lat: ASSESSMENT_ORIGIN.lat, lon: ASSESSMENT_ORIGIN.lon }),
      expect.objectContaining({ lat: ASSESSMENT_DESTINATION.lat, lon: ASSESSMENT_DESTINATION.lon }),
    )
    expect(mockResolveTrustedRouteCoverage).toHaveBeenCalledWith(expect.objectContaining({
      origin: expect.objectContaining({ lat: ASSESSMENT_ORIGIN.lat, lon: ASSESSMENT_ORIGIN.lon }),
      destination: expect.objectContaining({
        lat: ASSESSMENT_DESTINATION.lat,
        lon: ASSESSMENT_DESTINATION.lon,
      }),
      assessmentScopeId: ASSESSMENT_SCOPE_ID,
    }))
    const sampledRoute = mockSampleRouteWeatherPoints.mock.calls[0]?.[0] as Array<{
      lat: number
      lon: number
    }>
    expect(sampledRoute[0]).toEqual(ASSESSMENT_ORIGIN_POINT)
    expect(sampledRoute.at(-1)).toEqual(ASSESSMENT_DESTINATION_POINT)
    expect(mockGetRouteGeometry).not.toHaveBeenCalled()
    expect(mockGetRouteOptions).not.toHaveBeenCalled()
    expect(mockGetTeskeidRouteCandidateById).not.toHaveBeenCalled()
    expect(mockRecordRouteMemory).not.toHaveBeenCalled()
  })

  it('passes the exact signed Teskeið alternative into scoped coverage without primary recomputation', async () => {
    authedUser()
    const alternativeRoute = {
      id: `teskeid-road-graph-v1-alt-1-${'a'.repeat(43)}`,
      routeIndex: -2,
      provider: 'teskeid' as const,
      labels: ['TESKEID_EXPERIMENTAL', 'TESKEID_ALTERNATIVE'],
      isDefault: false,
      points: ASSESSMENT_PROVIDER_MATCHING_POINTS,
      distanceM: 58_000,
      durationS: 3_600,
    }
    const routeEnvelope = signRouteOptionEnvelope({
      origin: ASSESSMENT_ORIGIN_POINT,
      destination: ASSESSMENT_DESTINATION_POINT,
      assessmentScopeId: ASSESSMENT_SCOPE_ID,
      route: alternativeRoute,
    })

    const response = await POST(makeRequest({
      origin: ASSESSMENT_ORIGIN,
      destination: ASSESSMENT_DESTINATION,
      assessmentScopeId: ASSESSMENT_SCOPE_ID,
      selectedRouteId: alternativeRoute.id,
      routeEnvelope,
      trailerKind: 'none',
    }))

    expect(response.status).toBe(200)
    expect(mockResolveTrustedRouteCoverage).toHaveBeenCalledWith(expect.objectContaining({
      assessmentScopeId: ASSESSMENT_SCOPE_ID,
      selectedTeskeidRoute: alternativeRoute,
      referenceRoute: alternativeRoute.points,
      routeDistanceM: alternativeRoute.distanceM,
      routeDurationS: alternativeRoute.durationS,
    }))
    expect(mockGetTeskeidRouteCandidateById).not.toHaveBeenCalled()
    expect(mockGetRouteGeometry).not.toHaveBeenCalled()
    expect(mockGetRouteOptions).not.toHaveBeenCalled()
  })

  it('matches every provider station against the complete signed route when trusted coverage is partial', async () => {
    authedUser()
    const stationIds = [HELLISH_ID, '6300', '6315']
    mockResolveTrustedRouteCoverage.mockResolvedValueOnce({
      status: 'partial',
      start: {
        kind: 'official_road_anchor',
        label: 'Suðurlandsvegur',
        point: ASSESSMENT_PROVIDER_MATCHING_POINTS[0],
        routeFraction: 0.25,
        distanceFromTripOriginM: 14_000,
        elapsedFromTripOriginS: 855,
      },
      end: {
        kind: 'official_road_anchor',
        label: 'Suðurlandsvegur',
        point: ASSESSMENT_PROVIDER_MATCHING_POINTS.at(-1),
        routeFraction: 0.75,
        distanceFromTripOriginM: 42_000,
        elapsedFromTripOriginS: 2_565,
      },
      coverageDistanceM: 28_000,
      coverageDurationS: 1_710,
      unassessedBeforeM: 14_000,
      unassessedAfterM: 14_000,
      distanceConfidence: 'reference_route',
    })
    mockMatchProviderPoints.mockImplementation(({ points, routePolyline }) => {
      const coversCompleteRoute =
        routePolyline[0]?.lat === ASSESSMENT_ORIGIN_POINT.lat
        && routePolyline[0]?.lon === ASSESSMENT_ORIGIN_POINT.lon
        && routePolyline.at(-1)?.lat === ASSESSMENT_DESTINATION_POINT.lat
        && routePolyline.at(-1)?.lon === ASSESSMENT_DESTINATION_POINT.lon
      if (!coversCompleteRoute) return [makeStationMatch(HELLISH_ID)]
      if (points.length < 10) return [makeStationMatch(points[0]?.id ?? HELLISH_ID)]
      return stationIds.map((stationId, index) => makeStationMatch(stationId, 8_000 + index * 16_000))
    })
    mockFetchVedurstofan.mockResolvedValue(new Map(stationIds.map(stationId => [
      stationId,
      {
        status: 'ok',
        payload: {
          ...makeVedurstofanPayload(),
          stationId,
        },
      },
    ])))
    mockReadVegagerdinCurrent.mockResolvedValue(makeVegagerdinCurrentResult())

    const response = await POST(makeRequest({
      origin: ASSESSMENT_ORIGIN,
      destination: ASSESSMENT_DESTINATION,
      assessmentScopeId: ASSESSMENT_SCOPE_ID,
      routeEnvelope: makeAssessmentEnvelope(),
      trailerKind: 'none',
    }))

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.vedurstofanLayer.points).toHaveLength(3)
    expect(body.vedurstofanLayer.points.map((point: { stationId: string }) => point.stationId))
      .toEqual(stationIds)
    expect(mockMatchProviderPoints).toHaveBeenCalledTimes(2)
    for (const [{ routePolyline }] of mockMatchProviderPoints.mock.calls) {
      expect(routePolyline).toEqual(ASSESSMENT_PROVIDER_MATCHING_POINTS)
    }
  })

  it.each([
    ['an unscoped envelope', () => signRouteOptionEnvelope({
      origin: ASSESSMENT_ORIGIN_POINT,
      destination: ASSESSMENT_DESTINATION_POINT,
      route: makeRouteOption('google-unscoped', ['DEFAULT_ROUTE']),
    })],
    ['a mismatched scope claim', () => makeAssessmentEnvelope('assessment:v2:stale-scope')],
  ])('rejects %s before fingerprint, provider, coverage, forecast or persistence', async (_label, envelopeFactory) => {
    authedUser()

    const response = await POST(makeRequest({
      origin: ASSESSMENT_ORIGIN,
      destination: ASSESSMENT_DESTINATION,
      assessmentScopeId: ASSESSMENT_SCOPE_ID,
      routeEnvelope: envelopeFactory(),
      trailerKind: 'none',
    }))

    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toEqual({ error: 'route_envelope_invalid' })
    expect(mockRoutePairFingerprint).not.toHaveBeenCalled()
    expect(mockGetRouteGeometry).not.toHaveBeenCalled()
    expect(mockGetRouteOptions).not.toHaveBeenCalled()
    expect(mockGetTeskeidRouteCandidateById).not.toHaveBeenCalled()
    expect(mockResolveTrustedRouteCoverage).not.toHaveBeenCalled()
    expect(mockFetchForecast).not.toHaveBeenCalled()
    expect(mockRecordRouteMemory).not.toHaveBeenCalled()
  })

  it('does not let a scoped envelope fall back into legacy mode when the body omits its claim', async () => {
    authedUser()

    const response = await POST(makeRequest({
      origin: ASSESSMENT_ORIGIN,
      destination: ASSESSMENT_DESTINATION,
      routeEnvelope: makeAssessmentEnvelope(),
      trailerKind: 'none',
    }))

    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toEqual({ error: 'route_envelope_invalid' })
    expect(mockRoutePairFingerprint).not.toHaveBeenCalled()
    expect(mockGetRouteGeometry).not.toHaveBeenCalled()
    expect(mockResolveTrustedRouteCoverage).not.toHaveBeenCalled()
    expect(mockFetchForecast).not.toHaveBeenCalled()
    expect(mockRecordRouteMemory).not.toHaveBeenCalled()
  })

  it('requires a signed envelope and validates the bounded scope id before route work', async () => {
    authedUser()

    const missingEnvelope = await POST(makeRequest({
      origin: ASSESSMENT_ORIGIN,
      destination: ASSESSMENT_DESTINATION,
      assessmentScopeId: ASSESSMENT_SCOPE_ID,
      trailerKind: 'none',
    }))
    expect(missingEnvelope.status).toBe(422)
    await expect(missingEnvelope.json()).resolves.toEqual({ error: 'route_envelope_invalid' })

    const malformedScope = await POST(makeRequest({
      origin: ASSESSMENT_ORIGIN,
      destination: ASSESSMENT_DESTINATION,
      assessmentScopeId: ' scope-with-whitespace ',
      routeEnvelope: makeAssessmentEnvelope(),
      trailerKind: 'none',
    }))
    expect(malformedScope.status).toBe(400)
    await expect(malformedScope.json()).resolves.toEqual({ error: 'invalid_assessment_scope_id' })
    expect(mockRoutePairFingerprint).not.toHaveBeenCalled()
    expect(mockGetRouteGeometry).not.toHaveBeenCalled()
    expect(mockResolveTrustedRouteCoverage).not.toHaveBeenCalled()
    expect(mockFetchForecast).not.toHaveBeenCalled()
    expect(mockRecordRouteMemory).not.toHaveBeenCalled()
  })
})

describe('POST /api/teskeid/weather/travel/route — auth / public access', () => {
  it('uses the default provider route when selectedRouteId is omitted', async () => {
    authedUser()

    const res = await POST(makeRequest({
      origin: GARDABAER,
      destination: THORLAKSHOFN,
      trailerKind: 'none',
    }))

    expect(res.status).toBe(200)
    expect(mockGetRouteGeometry).toHaveBeenCalledOnce()
    expect(mockGetTeskeidRouteCandidateById).not.toHaveBeenCalled()
  })

  it('signed-in user without vedrid is allowed in Authenticated mode (legacy: WEATHER_ENABLED=true)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u2', email: 'novedrid@example.com' } } })
    mockCheckFeatureAccess.mockResolvedValue(false)
    // WEATHER_ENABLED=true + no WEATHER_PUBLIC_ENABLED = authenticated mode → all signed-in users allowed
    const res = await POST(makeRequest({ origin: GARDABAER, destination: THORLAKSHOFN, trailerKind: 'none' }))
    expect(res.status).toBe(200)
  })

  it('signed-out guest returns 401 in Authenticated mode', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    process.env.WEATHER_ENABLED = 'Authenticated'
    const res = await POST(makeRequest({ origin: GARDABAER, destination: THORLAKSHOFN, trailerKind: 'none' }))
    expect(res.status).toBe(401)
  })

  it('legacy fallback for All mode: signed-in user without vedrid gets MET/Yr when WEATHER_ENABLED=true + WEATHER_PUBLIC_ENABLED=true', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u2', email: 'novedrid@example.com' } } })
    mockCheckFeatureAccess.mockResolvedValue(false)
    process.env.WEATHER_PUBLIC_ENABLED = 'true'
    mockGetRouteOptions.mockResolvedValue([makeRouteOption('google-0', ['DEFAULT_ROUTE'])])
    const res = await POST(makeRequest({ origin: GARDABAER, destination: THORLAKSHOFN, trailerKind: 'none' }))
    expect(res.status).toBe(200)
  })

  it('legacy fallback for All mode: signed-in user without vedrid and without provider access does not get Veðurstofan layer', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u2', email: 'novedrid@example.com' } } })
    // Both vedrid and weather-provider-vedurstofan calls return false
    mockCheckFeatureAccess.mockResolvedValue(false)
    process.env.WEATHER_PUBLIC_ENABLED = 'true'
    mockGetRouteOptions.mockResolvedValue([makeRouteOption('google-0', ['DEFAULT_ROUTE'])])
    const res = await POST(makeRequest({ origin: GARDABAER, destination: THORLAKSHOFN, trailerKind: 'none' }))
    expect(res.status).toBe(200)
    expect(mockFetchVedurstofan).not.toHaveBeenCalled()
    const body = await res.json()
    expect(body.vedurstofanLayer).toBeUndefined()
  })

  it('includes vedurstofanLayer for signed-in public-tier user with weather-provider-vedurstofan access (WEATHER_ENABLED=All)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u-public', email: 'provider@example.com' } } })
    // First call: vedrid → false (public-tier in All mode), second call: weather-provider-vedurstofan → true
    mockCheckFeatureAccess.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    process.env.WEATHER_ENABLED = 'All'
    setupStationMapping()
    mockFetchVedurstofan.mockResolvedValue(
      new Map([[HELLISH_ID, { status: 'ok', payload: makeVedurstofanPayload() }]]),
    )
    const res = await POST(makeRequest({ origin: GARDABAER, destination: THORLAKSHOFN, trailerKind: 'none' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.vedurstofanLayer).toBeDefined()
    expect(body.vedurstofanLayer.status).toBe('available')
  })
})

describe('POST /api/teskeid/weather/travel/route — signed first-ready route', () => {
  it('uses a verified Google route without a second provider lookup', async () => {
    authedUser()
    const coordinateBearingId = 'google-56000-64.0900,-21.9300-63.8490,-21.3650'
    const route = {
      ...makeRouteOption(coordinateBearingId, ['DEFAULT_ROUTE']),
      cautions: [{
        id: 'wind-sensitive',
        severity: 'caution' as const,
        labelKey: 'teskeid.routes.cautions.windSensitive',
        appliesTo: ['all' as const],
      }],
    }
    const routeEnvelope = signRouteOptionEnvelope({
      origin: GARDABAER_POINT,
      destination: THORLAKSHOFN_POINT,
      route,
    })

    const res = await POST(makeRequest({
      origin: GARDABAER,
      destination: THORLAKSHOFN,
      trailerKind: 'none',
      routeEnvelope,
    }))

    expect(res.status).toBe(200)
    expect(mockGetRouteGeometry).not.toHaveBeenCalled()
    expect(mockGetRouteOptions).not.toHaveBeenCalled()
    expect(mockGetTeskeidRouteCandidateById).not.toHaveBeenCalled()
    expect(mockSampleRouteWeatherPoints.mock.calls[0]?.[0]).toEqual(route.points)
    expect(mockRecordRouteMemory).toHaveBeenCalledWith(expect.objectContaining({
      routeVariantKey: 'google:0',
      routeVariantLabel: null,
      routeCautionIds: ['wind-sensitive'],
    }))
    expect(JSON.stringify(mockRecordRouteMemory.mock.calls)).not.toContain(coordinateBearingId)
    expect(JSON.stringify(mockRecordRouteMemory.mock.calls)).not.toMatch(/64\.0900|-21\.9300/)
  })

  it('uses an enabled Teskeið envelope without recomputing either provider', async () => {
    authedUser()
    const route = {
      ...makeRouteOption('teskeid-road-graph-v1', ['TESKEID_EXPERIMENTAL']),
      provider: 'teskeid' as const,
      experimental: {
        derivedDuration: true as const,
        surface: { pavedM: 56_000, gravelM: 0, mixedM: 0, unknownM: 0 },
      },
    }
    const routeEnvelope = signRouteOptionEnvelope({
      origin: GARDABAER_POINT,
      destination: THORLAKSHOFN_POINT,
      route,
    })

    const res = await POST(makeRequest({
      origin: GARDABAER,
      destination: THORLAKSHOFN,
      trailerKind: 'none',
      routeEnvelope,
    }))

    expect(res.status).toBe(200)
    expect(mockGetRouteGeometry).not.toHaveBeenCalled()
    expect(mockGetRouteOptions).not.toHaveBeenCalled()
    expect(mockGetTeskeidRouteCandidateById).not.toHaveBeenCalled()
  })

  it('accepts a signed Teskeið envelope from a signed-out public Weather user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    process.env.WEATHER_ENABLED = 'All'
    const route = {
      ...makeRouteOption('teskeid-road-graph-v1', ['TESKEID_EXPERIMENTAL']),
      provider: 'teskeid' as const,
    }
    const routeEnvelope = signRouteOptionEnvelope({
      origin: GARDABAER_POINT,
      destination: THORLAKSHOFN_POINT,
      route,
    })

    const res = await POST(makeRequest({
      origin: GARDABAER,
      destination: THORLAKSHOFN,
      trailerKind: 'none',
      routeEnvelope,
    }))

    expect(res.status).toBe(200)
    expect(mockGetTeskeidRouteCandidateById).not.toHaveBeenCalled()
    expect(mockGetRouteOptions).not.toHaveBeenCalled()
  })

  it('rejects a bare Teskeið route id from a signed-out public Weather user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    process.env.WEATHER_ENABLED = 'All'
    mockGetTeskeidRouteCandidateById.mockResolvedValue({
      ...makeRouteOption('teskeid-road-graph-v1', ['TESKEID_EXPERIMENTAL']),
      provider: 'teskeid' as const,
      experimental: {
        derivedDuration: true as const,
        surface: { pavedM: 56_000, gravelM: 0, mixedM: 0, unknownM: 0 },
      },
    })

    const res = await POST(makeRequest({
      origin: GARDABAER,
      destination: THORLAKSHOFN,
      trailerKind: 'none',
      selectedRouteId: 'teskeid-road-graph-v1',
    }))

    expect(res.status).toBe(422)
    await expect(res.json()).resolves.toMatchObject({ error: 'selected_route_unavailable' })
    expect(mockGetTeskeidRouteCandidateById).not.toHaveBeenCalled()
    expect(mockGetRouteOptions).not.toHaveBeenCalled()
  })

  it('rejects a bare Teskeið route id from an email-less Supabase identity', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'anonymous-id', email: null } } })
    process.env.WEATHER_ENABLED = 'All'
    mockGetTeskeidRouteCandidateById.mockResolvedValue({
      ...makeRouteOption('teskeid-road-graph-v1', ['TESKEID_EXPERIMENTAL']),
      provider: 'teskeid' as const,
    })

    const res = await POST(makeRequest({
      origin: GARDABAER,
      destination: THORLAKSHOFN,
      trailerKind: 'none',
      selectedRouteId: 'teskeid-road-graph-v1',
    }))

    expect(res.status).toBe(422)
    await expect(res.json()).resolves.toMatchObject({ error: 'selected_route_unavailable' })
    expect(mockGetTeskeidRouteCandidateById).not.toHaveBeenCalled()
    expect(mockGetRouteOptions).not.toHaveBeenCalled()
  })

  it('invalidates a signed Teskeið envelope immediately when the global kill switch is off', async () => {
    authedUser()
    const route = {
      ...makeRouteOption('teskeid-road-graph-v1', ['TESKEID_EXPERIMENTAL']),
      provider: 'teskeid' as const,
    }
    const routeEnvelope = signRouteOptionEnvelope({
      origin: GARDABAER_POINT,
      destination: THORLAKSHOFN_POINT,
      route,
    })
    mockIsTeskeidRouteCandidateEnabled.mockReturnValue(false)

    const res = await POST(makeRequest({
      origin: GARDABAER,
      destination: THORLAKSHOFN,
      trailerKind: 'none',
      routeEnvelope,
    }))

    expect(res.status).toBe(422)
    await expect(res.json()).resolves.toMatchObject({ error: 'selected_route_unavailable' })
    expect(mockGetTeskeidRouteCandidateById).not.toHaveBeenCalled()
    expect(mockGetRouteGeometry).not.toHaveBeenCalled()
    expect(mockGetRouteOptions).not.toHaveBeenCalled()
    expect(mockFetchForecast).not.toHaveBeenCalled()
  })

  it.each([
    ['tampered route', (envelope: ReturnType<typeof signRouteOptionEnvelope>) => ({
      ...envelope,
      route: { ...envelope.route, durationS: envelope.route.durationS + 1 },
    })],
    ['wrong endpoint pair', (envelope: ReturnType<typeof signRouteOptionEnvelope>) => envelope],
    ['expired envelope', (_envelope: ReturnType<typeof signRouteOptionEnvelope>) => signRouteOptionEnvelope({
      origin: GARDABAER_POINT,
      destination: THORLAKSHOFN_POINT,
      route: makeRouteOption('google-expired', ['DEFAULT_ROUTE']),
    }, { now: new Date(Date.now() - 20 * 60_000), ttlMs: 60_000 })],
  ])('rejects %s before provider and forecast work', async (caseName, mutateEnvelope) => {
    authedUser()
    const routeEnvelope = mutateEnvelope(signRouteOptionEnvelope({
      origin: GARDABAER_POINT,
      destination: THORLAKSHOFN_POINT,
      route: makeRouteOption('google-invalid', ['DEFAULT_ROUTE']),
    }))
    const requestOrigin = caseName === 'wrong endpoint pair'
      ? { ...GARDABAER, lat: GARDABAER.lat + 0.001 }
      : GARDABAER

    const res = await POST(makeRequest({
      origin: requestOrigin,
      destination: THORLAKSHOFN,
      trailerKind: 'none',
      routeEnvelope,
    }))

    expect(res.status).toBe(422)
    await expect(res.json()).resolves.toEqual({ error: 'route_envelope_invalid' })
    expect(mockGetRouteGeometry).not.toHaveBeenCalled()
    expect(mockGetRouteOptions).not.toHaveBeenCalled()
    expect(mockGetTeskeidRouteCandidateById).not.toHaveBeenCalled()
    expect(mockFetchForecast).not.toHaveBeenCalled()
  })

  it('rejects a selectedRouteId that conflicts with the signed route', async () => {
    authedUser()
    const routeEnvelope = signRouteOptionEnvelope({
      origin: GARDABAER_POINT,
      destination: THORLAKSHOFN_POINT,
      route: makeRouteOption('google-envelope-route', ['DEFAULT_ROUTE']),
    })

    const res = await POST(makeRequest({
      origin: GARDABAER,
      destination: THORLAKSHOFN,
      trailerKind: 'none',
      selectedRouteId: 'google-conflicting-route',
      routeEnvelope,
    }))

    expect(res.status).toBe(422)
    await expect(res.json()).resolves.toEqual({ error: 'route_envelope_invalid' })
    expect(mockGetRouteOptions).not.toHaveBeenCalled()
    expect(mockFetchForecast).not.toHaveBeenCalled()
  })
})

describe('POST /api/teskeid/weather/travel/route — trusted weather coverage', () => {
  it('clips weather work to the confirmed section while preserving full-trip progress', async () => {
    authedUser()
    mockResolveTrustedRouteCoverage.mockResolvedValueOnce({
      status: 'partial',
      start: {
        kind: 'settlement_gateway',
        label: 'Garðabær',
        point: { lat: 64.02975, lon: -21.78875 },
        routeFraction: 0.25,
        distanceFromTripOriginM: 14_000,
        elapsedFromTripOriginS: 855,
      },
      end: {
        kind: 'official_road_anchor',
        label: 'Þorlákshafnarvegur',
        point: { lat: 63.90925, lon: -21.50625 },
        routeFraction: 0.75,
        distanceFromTripOriginM: 42_000,
        elapsedFromTripOriginS: 2_565,
        roadNumber: '38',
      },
      coverageDistanceM: 28_000,
      coverageDurationS: 1_710,
      unassessedBeforeM: 14_000,
      unassessedAfterM: 14_000,
      distanceConfidence: 'reference_route',
    })

    const response = await POST(makeRequest({
      origin: GARDABAER,
      destination: THORLAKSHOFN,
      trailerKind: 'none',
    }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.travelPlan.route.weatherCoverage).toMatchObject({
      status: 'partial',
      unassessedAfterM: 14_000,
    })
    expect(mockSampleRouteWeatherPoints).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ lat: expect.any(Number), lon: expect.any(Number) }),
      ]),
      expect.arrayContaining([expect.any(Number)]),
    )
    const sampledCumulative = mockSampleRouteWeatherPoints.mock.calls[0][1] as number[]
    expect(sampledCumulative[0]).toBeGreaterThan(0)
    expect(body.travelPlan.routeWeatherPoints[0].distanceFromOriginM).toBeCloseTo(14_000, -2)
    expect(body.travelPlan.routeWeatherPoints[0].elapsedFromTripOriginS).toBeCloseTo(855, -1)
    expect(body.travelPlan.routeWeatherPoints[0].isOrigin).toBe(false)
    expect(body.travelPlan.routeWeatherPoints[0].isDestinationClosest).toBe(false)
    expect(mockFetchForecast).toHaveBeenCalledTimes(1)
  })

  it.each([
    {
      coverage: {
        status: 'same_urban_area',
        settlementId: 'hagstofa:hella',
        settlementName: 'Hella',
      },
      reasonCode: 'same_urban_area',
    },
    {
      coverage: {
        status: 'unavailable',
        reason: 'reference_route_mismatch',
      },
      reasonCode: 'trusted_route_unavailable',
    },
  ])('returns the exact route without inventing weather for $coverage.status', async ({
    coverage,
    reasonCode,
  }) => {
    authedUser()
    mockResolveTrustedRouteCoverage.mockResolvedValueOnce(coverage)

    const response = await POST(makeRequest({
      origin: GARDABAER,
      destination: THORLAKSHOFN,
      trailerKind: 'none',
    }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.reasonCode).toBe(reasonCode)
    expect(body.travelPlan.route.weatherCoverage).toEqual(coverage)
    expect(body.travelPlan.route.auditPolylinePoints).toEqual([
      GARDABAER_POINT,
      THORLAKSHOFN_POINT,
    ])
    expect(body.travelPlan.routeWeatherPoints).toEqual([])
    expect(mockSampleRouteWeatherPoints).not.toHaveBeenCalled()
    expect(mockFetchForecast).not.toHaveBeenCalled()
    expect(mockMatchProviderPoints).not.toHaveBeenCalled()
    expect(mockReadVegagerdinCurrent).not.toHaveBeenCalled()
    expect(mockRecordRouteMemory).not.toHaveBeenCalled()
  })
})

describe('POST /api/teskeid/weather/travel/route — curated route final-submit', () => {
  it('uses the shared Teskeið candidate without asking Google to match its id', async () => {
    authedUser()
    mockGetTeskeidRouteCandidateById.mockResolvedValue({
      ...makeRouteOption('teskeid-road-graph-v1', ['TESKEID_EXPERIMENTAL']),
      provider: 'teskeid',
      experimental: {
        derivedDuration: true,
        surface: { pavedM: 56_000, gravelM: 0, mixedM: 0, unknownM: 0 },
      },
    })

    const res = await POST(makeRequest({
      origin: GARDABAER,
      destination: THORLAKSHOFN,
      trailerKind: 'none',
      selectedRouteId: 'teskeid-road-graph-v1',
    }))

    expect(res.status).toBe(200)
    expect(mockGetTeskeidRouteCandidateById).toHaveBeenCalledWith(
      { lat: GARDABAER.lat, lon: GARDABAER.lon },
      { lat: THORLAKSHOFN.lat, lon: THORLAKSHOFN.lon },
      'teskeid-road-graph-v1',
    )
    expect(mockGetRouteOptions).not.toHaveBeenCalled()
  })

  it('rejects a stale Teskeið selection when the candidate is no longer available', async () => {
    authedUser()
    mockGetTeskeidRouteCandidateById.mockResolvedValue(null)

    const res = await POST(makeRequest({
      origin: GARDABAER,
      destination: THORLAKSHOFN,
      trailerKind: 'none',
      selectedRouteId: 'teskeid-road-graph-v1',
    }))

    expect(res.status).toBe(422)
    await expect(res.json()).resolves.toMatchObject({ error: 'selected_route_unavailable' })
    expect(mockGetRouteOptions).not.toHaveBeenCalled()
  })

  it('allows an authenticated Weather user without the legacy per-user routing row', async () => {
    authedUser()
    mockCheckFeatureAccess.mockImplementation(async (_uid: string, _email: string, featureKey: string) => (
      featureKey !== 'teskeid-routing-v1'
    ))
    mockGetTeskeidRouteCandidateById.mockResolvedValue({
      ...makeRouteOption('teskeid-road-graph-v1', ['TESKEID_EXPERIMENTAL']),
      provider: 'teskeid',
    })

    const res = await POST(makeRequest({
      origin: GARDABAER,
      destination: THORLAKSHOFN,
      trailerKind: 'none',
      selectedRouteId: 'teskeid-road-graph-v1',
    }))

    expect(res.status).toBe(200)
    expect(mockGetTeskeidRouteCandidateById).toHaveBeenCalledOnce()
  })

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

// ── Veðurstofan travel layer ───────────────────────────────────────────────────

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

function makeVegagerdinCurrentResult() {
  return {
    status: 'fresh' as const,
    cacheStatus: 'fresh' as const,
    measurementFreshness: 'fresh' as const,
    payload: {
      source: 'vegagerdin' as const,
      endpoint: 'vedur2014_1' as const,
      fetchedAtIso: '2026-07-10T08:05:00Z',
      oldestMeasuredAtIso: '2026-07-10T08:00:00Z',
      measurements: [{
        source: 'vegagerdin' as const,
        stationId: HELLISH_ID,
        stationName: 'Hellisheiði',
        lat: 64.04,
        lon: -21.37,
        measuredAtIso: '2026-07-10T08:00:00Z',
        fetchedAtIso: '2026-07-10T08:05:00Z',
        meanWindMs: 8,
        gustLast10MinMs: 16,
        windDirectionDeg: 180,
        windDirectionText: 'S',
        airTemperatureC: 5,
        roadTemperatureC: 2,
        dataQuality: 'complete' as const,
      }],
    },
  }
}

function setupLayerEnabled() {
  // authedUser() makes checkFeatureAccess return true for all calls, including weather-provider-vedurstofan.
  // No separate env var needed — the gate is now purely per-user feature access.
}

// Hellisheiði coords (~64.04, -21.37) — clearly distinct from Garðabær (64.09, -21.93)
function makeStationMatch(stationId: string, distanceFromOriginM = 5_000) {
  return {
    point: { id: stationId, name: 'Hellisheiði', lat: 64.04, lon: -21.37 },
    distanceM: 2_000,
    distanceFromOriginM,
    routeFraction: distanceFromOriginM / 56_000,
    nearestRoutePoint: { lat: 64.04, lon: -21.37 },
  }
}

function setupStationMapping() {
  mockMatchProviderPoints.mockReturnValue([makeStationMatch(HELLISH_ID)])
}

describe('POST /api/teskeid/weather/travel/route — Veðurstofan layer', () => {
  it('does not call product table and returns no vedurstofanLayer when user lacks weather-provider-vedurstofan access', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'test@example.com' } } })
    // First call: vedrid access (allow), second call: weather-provider-vedurstofan access (deny)
    mockCheckFeatureAccess.mockResolvedValueOnce(true).mockResolvedValueOnce(false)

    const res = await POST(makeRequest({ origin: GARDABAER, destination: THORLAKSHOFN, trailerKind: 'none' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(mockFetchVedurstofan).not.toHaveBeenCalled()
    expect(body.vedurstofanLayer).toBeUndefined()
  })

  it('includes vedurstofanLayer with points when layer is enabled', async () => {
    authedUser()
    setupLayerEnabled()
    setupStationMapping()
    mockFetchVedurstofan.mockResolvedValue(
      new Map([[HELLISH_ID, { status: 'ok', payload: makeVedurstofanPayload() }]]),
    )

    const res = await POST(makeRequest({ origin: GARDABAER, destination: THORLAKSHOFN, trailerKind: 'none' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.vedurstofanLayer).toBeDefined()
    expect(body.vedurstofanLayer.experimental).toBe(true)
    expect(body.vedurstofanLayer.status).toBe('available')
    expect(body.vedurstofanLayer.augmentedResult).toBeUndefined()
    expect(body.vedurstofanLayer.points).toHaveLength(1)
    expect(body.vedurstofanLayer.points[0].stationId).toBe(HELLISH_ID)
    expect(body.vedurstofanLayer.points[0].forecastRows).toHaveLength(2)
  })

  it('includes vegagerdinLayer with gust-based status when current stations match the route', async () => {
    authedUser()
    setupLayerEnabled()
    setupStationMapping()
    mockReadVegagerdinCurrent.mockResolvedValue(makeVegagerdinCurrentResult())

    const res = await POST(makeRequest({ origin: GARDABAER, destination: THORLAKSHOFN, trailerKind: 'none' }))
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.vegagerdinLayer).toBeDefined()
    expect(body.vegagerdinLayer.points).toHaveLength(1)
    expect(body.vegagerdinLayer.points[0]).toMatchObject({
      stationId: HELLISH_ID,
      meanWindMs: 8,
      gustLast10MinMs: 16,
      windDisplayStatus: 'haettulegt',
      statusWindMs: 16,
    })
  })

  it('keeps Vegagerðin layer exceptions privacy-safe in diagnostics', async () => {
    authedUser()
    setupLayerEnabled()
    setupStationMapping()
    const privateFailureText = 'provider failed at https://example.invalid/?lat=64.09&token=secret'
    mockReadVegagerdinCurrent.mockRejectedValue(new Error(privateFailureText))
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    try {
      const res = await POST(makeRequest({
        origin: GARDABAER,
        destination: THORLAKSHOFN,
        trailerKind: 'none',
      }))

      expect(res.status).toBe(200)
      const serializedLogs = JSON.stringify([
        ...logSpy.mock.calls,
        ...infoSpy.mock.calls,
        ...errorSpy.mock.calls,
      ])
      expect(serializedLogs).toContain('layer_build_failed')
      expect(serializedLogs).not.toContain(privateFailureText)
      expect(serializedLogs).not.toContain('token=secret')
      expect(serializedLogs).not.toContain('lat=64.09')
    } finally {
      logSpy.mockRestore()
      infoSpy.mockRestore()
      errorSpy.mockRestore()
    }
  })

  it('baseline result is unchanged and has no vedurstofanStation when layer is enabled', async () => {
    authedUser()
    setupLayerEnabled()
    setupStationMapping()
    mockFetchVedurstofan.mockResolvedValue(
      new Map([[HELLISH_ID, { status: 'ok', payload: makeVedurstofanPayload() }]]),
    )

    const res = await POST(makeRequest({ origin: GARDABAER, destination: THORLAKSHOFN, trailerKind: 'none' }))
    const body = await res.json()
    expect(body.stada).toBeDefined()
    expect(body.travelPlan?.routeWeatherPoints?.[0]?.vedurstofanStation).toBeUndefined()
  })

  it('returns vedurstofanLayer.status unavailable and empty points when product table is empty', async () => {
    authedUser()
    setupLayerEnabled()
    setupStationMapping()
    mockFetchVedurstofan.mockResolvedValue(new Map())

    const res = await POST(makeRequest({ origin: GARDABAER, destination: THORLAKSHOFN, trailerKind: 'none' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.stada).toBeDefined()
    expect(body.vedurstofanLayer.status).toBe('unavailable')
    expect(body.vedurstofanLayer.points).toHaveLength(0)
  })

  it('excludes unavailable station from layer points (fail-open)', async () => {
    authedUser()
    setupLayerEnabled()
    setupStationMapping()
    mockFetchVedurstofan.mockResolvedValue(
      new Map([[HELLISH_ID, { status: 'unavailable' }]]),
    )

    const res = await POST(makeRequest({ origin: GARDABAER, destination: THORLAKSHOFN, trailerKind: 'none' }))
    const body = await res.json()
    expect(body.stada).toBeDefined()
    expect(body.vedurstofanLayer.status).toBe('unavailable')
    expect(body.vedurstofanLayer.points).toHaveLength(0)
  })

  it('includes stale station data in layer points with status stale', async () => {
    authedUser()
    setupLayerEnabled()
    setupStationMapping()
    mockFetchVedurstofan.mockResolvedValue(
      new Map([[HELLISH_ID, { status: 'stale', payload: makeVedurstofanPayload() }]]),
    )

    const res = await POST(makeRequest({ origin: GARDABAER, destination: THORLAKSHOFN, trailerKind: 'none' }))
    const body = await res.json()
    expect(body.vedurstofanLayer.status).toBe('available')
    expect(body.vedurstofanLayer.points[0].status).toBe('stale')
    expect(body.vedurstofanLayer.points[0].forecastRows).toHaveLength(2)
  })

  it('does not call product table when no stations are matched for the route', async () => {
    authedUser()
    setupLayerEnabled()
    mockMatchProviderPoints.mockReturnValue([])

    const res = await POST(makeRequest({ origin: GARDABAER, destination: THORLAKSHOFN, trailerKind: 'none' }))
    expect(res.status).toBe(200)
    expect(mockFetchVedurstofan).not.toHaveBeenCalled()
    const body = await res.json()
    expect(body.vedurstofanLayer).toBeUndefined()
  })

  it('does not read product table or return vedurstofanLayer when user lacks weather-provider-vedurstofan access', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'test@example.com' } } })
    // Access required gate is active: vedrid access (allow), weather-provider-vedurstofan access (deny)
    process.env.WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED = 'true'
    mockCheckFeatureAccess.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    setupStationMapping()

    const res = await POST(makeRequest({ origin: GARDABAER, destination: THORLAKSHOFN, trailerKind: 'none' }))
    expect(res.status).toBe(200)
    expect(mockFetchVedurstofan).not.toHaveBeenCalled()
    const body = await res.json()
    expect(body.vedurstofanLayer).toBeUndefined()
  })

  it('returns baseline result when product-table read times out', async () => {
    vi.useFakeTimers()
    authedUser()
    setupLayerEnabled()
    setupStationMapping()
    mockFetchVedurstofan.mockReturnValue(new Promise(() => {})) // never resolves

    const resPromise = POST(makeRequest({ origin: GARDABAER, destination: THORLAKSHOFN, trailerKind: 'none' }))
    await vi.advanceTimersByTimeAsync(20_500)
    const res = await resPromise
    vi.useRealTimers()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.stada).toBeDefined()
    expect(body.vedurstofanLayer).toBeUndefined()
  })

  it('keeps every matched station when a valid cold product-table read completes within the 20 s budget', async () => {
    vi.useFakeTimers()
    authedUser()
    setupLayerEnabled()
    const stationIds = [HELLISH_ID, '6300', '6315']
    mockMatchProviderPoints.mockReturnValue(
      stationIds.map((stationId, index) => makeStationMatch(stationId, 8_000 + index * 12_000)),
    )
    mockFetchVedurstofan.mockImplementation(() => new Promise(resolve => {
      setTimeout(() => resolve(new Map(stationIds.map(stationId => [
        stationId,
        {
          status: 'ok' as const,
          payload: { ...makeVedurstofanPayload(), stationId },
        },
      ]))), 10_000)
    }))

    const resPromise = POST(makeRequest({ origin: GARDABAER, destination: THORLAKSHOFN, trailerKind: 'none' }))
    await vi.advanceTimersByTimeAsync(10_500)
    const res = await resPromise
    vi.useRealTimers()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.vedurstofanLayer.points.map((point: { stationId: string }) => point.stationId))
      .toEqual(stationIds)
  })

  it('builds one layer point per unique station, matched directly from route geometry', async () => {
    authedUser()
    setupLayerEnabled()
    // The route has two weather sample points, but station selection now comes from route geometry matching.
    // Only one station is matched (HELLISH_ID) — exactly one layer point must appear.
    mockSampleRouteWeatherPoints.mockReturnValue({
      weatherPoints: [
        { lat: 64.09, lon: -21.93, forecastLat: 64.09, forecastLon: -21.93, routeIndex: 0, distanceFromOriginM: 0 },
        { lat: 64.00, lon: -21.80, forecastLat: 64.00, forecastLon: -21.80, routeIndex: 1, distanceFromOriginM: 10_000 },
      ],
      diagnostics: { strategy: 'exhaustive', totalCells: 2, sampledCells: 2 },
    })
    mockMatchProviderPoints.mockReturnValue([makeStationMatch(HELLISH_ID)])
    mockFetchVedurstofan.mockResolvedValue(
      new Map([[HELLISH_ID, { status: 'ok', payload: makeVedurstofanPayload() }]]),
    )
    mockFetchForecast.mockResolvedValue([makeHour('2026-07-10T08:00:00Z')])

    const res = await POST(makeRequest({ origin: GARDABAER, destination: THORLAKSHOFN, trailerKind: 'none' }))
    const body = await res.json()
    expect(body.vedurstofanLayer.points).toHaveLength(1)
    expect(body.vedurstofanLayer.points[0].stationId).toBe(HELLISH_ID)
    expect(body.vedurstofanLayer.points[0].routePointId).toBe(`vedurstofan_${HELLISH_ID}`)
  })

  it('builds one layer point per unique station with station-based routePointId', async () => {
    authedUser()
    setupLayerEnabled()
    setupStationMapping()
    mockFetchVedurstofan.mockResolvedValue(
      new Map([[HELLISH_ID, { status: 'ok', payload: makeVedurstofanPayload() }]]),
    )

    const res = await POST(makeRequest({ origin: GARDABAER, destination: THORLAKSHOFN, trailerKind: 'none' }))
    const body = await res.json()
    expect(body.vedurstofanLayer.points[0].routePointId).toBe(`vedurstofan_${HELLISH_ID}`)
    expect(body.vedurstofanLayer.points[0].routeIndex).toBeUndefined()
  })

  it('selects a station via route geometry even when sampleRouteWeatherPoints does not cover its location', async () => {
    authedUser()
    setupLayerEnabled()
    // Sampled MET/Yr point: Garðabær (64.09, -21.93) — far from Hellisheiði (~64.04, -21.37).
    // Old code: getUniqueStationIdsForRoute(weatherPoints) would check each sampled point → miss Hellisheiði.
    // New code: matchProviderPointsToRoute uses routeGeometry.points directly → finds Hellisheiði.
    // This test proves the API uses the route-geometry matcher; the spatial correctness of
    // the matcher itself is proven in providerRouteMatching.test.ts test 1.
    mockSampleRouteWeatherPoints.mockReturnValue({
      weatherPoints: [{ lat: 64.09, lon: -21.93, forecastLat: 64.09, forecastLon: -21.93, routeIndex: 0, distanceFromOriginM: 0 }],
      diagnostics: { strategy: 'exhaustive', totalCells: 1, sampledCells: 1 },
    })
    mockMatchProviderPoints.mockReturnValue([makeStationMatch(HELLISH_ID, 8_000)])
    mockFetchVedurstofan.mockResolvedValue(
      new Map([[HELLISH_ID, { status: 'ok', payload: makeVedurstofanPayload() }]]),
    )

    const res = await POST(makeRequest({ origin: GARDABAER, destination: THORLAKSHOFN, trailerKind: 'none' }))
    expect(res.status).toBe(200)
    // Station was found via route geometry, not via sampled MET/Yr points
    expect(mockMatchProviderPoints).toHaveBeenCalled()
    const args = mockMatchProviderPoints.mock.calls[0][0]
    expect(args.routePolyline).toBeDefined()
    expect(args.maxDistanceM).toBe(1_000) // DEFAULT_PROVIDER_ROUTE_MAX_DISTANCE_M
    const body = await res.json()
    expect(body.vedurstofanLayer.points).toHaveLength(1)
    expect(body.vedurstofanLayer.points[0].stationId).toBe(HELLISH_ID)
  })

  it('uses providerMatchingPoints (not sampled points) as routePolyline when present', async () => {
    authedUser()
    setupLayerEnabled()
    const displayPoints = [
      { lat: 64.09, lon: -21.93 },
      { lat: 63.849, lon: -21.365 },
    ]
    const densePoints = [
      { lat: 64.09, lon: -21.93 },
      { lat: 64.04, lon: -21.60 },
      { lat: 63.95, lon: -21.48 },
      { lat: 63.849, lon: -21.365 },
    ]
    mockGetRouteGeometry.mockResolvedValue({
      points: displayPoints,
      providerMatchingPoints: densePoints,
      distanceM: 56000,
      durationS: 3420,
    })
    mockMatchProviderPoints.mockReturnValue([])

    await POST(makeRequest({ origin: GARDABAER, destination: THORLAKSHOFN, trailerKind: 'none' }))

    expect(mockMatchProviderPoints).toHaveBeenCalledWith(
      expect.objectContaining({ routePolyline: densePoints }),
    )
  })

  it('falls back to points when providerMatchingPoints is absent', async () => {
    authedUser()
    setupLayerEnabled()
    const routePoints = [
      { lat: 64.09, lon: -21.93 },
      { lat: 63.849, lon: -21.365 },
    ]
    mockGetRouteGeometry.mockResolvedValue({ points: routePoints, distanceM: 56000, durationS: 3420 })
    mockMatchProviderPoints.mockReturnValue([])

    await POST(makeRequest({ origin: GARDABAER, destination: THORLAKSHOFN, trailerKind: 'none' }))

    expect(mockMatchProviderPoints).toHaveBeenCalledWith(
      expect.objectContaining({ routePolyline: routePoints }),
    )
  })

  it('preserves distanceM, distanceFromOriginM, and routeFraction from route match in layer points', async () => {
    authedUser()
    setupLayerEnabled()
    mockMatchProviderPoints.mockReturnValue([
      makeStationMatch(HELLISH_ID, 12_000),
    ])
    mockFetchVedurstofan.mockResolvedValue(
      new Map([[HELLISH_ID, { status: 'ok', payload: makeVedurstofanPayload() }]]),
    )

    const res = await POST(makeRequest({ origin: GARDABAER, destination: THORLAKSHOFN, trailerKind: 'none' }))
    const body = await res.json()
    const pt = body.vedurstofanLayer.points[0]
    expect(pt.distanceM).toBe(2_000)
    expect(pt.distanceFromOriginM).toBe(12_000)
    expect(pt.routeFraction).toBeCloseTo(12_000 / 56_000, 5)
  })

  it('still runs MET/Yr route sampling unchanged when Veðurstofan layer is enabled', async () => {
    authedUser()
    setupLayerEnabled()
    setupStationMapping()
    mockFetchVedurstofan.mockResolvedValue(
      new Map([[HELLISH_ID, { status: 'ok', payload: makeVedurstofanPayload() }]]),
    )

    await POST(makeRequest({ origin: GARDABAER, destination: THORLAKSHOFN, trailerKind: 'none' }))

    // sampleRouteWeatherPoints must still be called for MET/Yr baseline — unchanged by this refactor
    expect(mockSampleRouteWeatherPoints).toHaveBeenCalledTimes(1)
    // matchProviderPoints is called for the Veðurstofan layer. Vegagerðin is mocked
    // unavailable by default in this suite; its route-layer behaviour has a separate test.
    expect(mockMatchProviderPoints).toHaveBeenCalledTimes(1)
  })
})
