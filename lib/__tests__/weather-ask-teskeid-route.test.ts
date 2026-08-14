import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  checkFeatureAccess: vi.fn(),
  resolvePlace: vi.fn(),
  fetchForecast: vi.fn(),
  checkRouteWeather: vi.fn(),
  getAiAnswer: vi.fn(),
  detectIntent: vi.fn(),
  extractTrailerKind: vi.fn(),
  extractRouteOrigin: vi.fn(),
  extractRouteDestination: vi.fn(),
  parseTimeWindow: vi.fn(),
  getWeatherMapProvider: vi.fn(),
  geocodePlace: vi.fn(),
  searchHmsPlaces: vi.fn(),
  discoverTeskeidRoutes: vi.fn(),
  globalFetch: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}))
vi.mock('@/lib/loans/guard', () => ({ checkFeatureAccess: mocks.checkFeatureAccess }))
vi.mock('@/lib/weather/places', () => ({ resolvePlace: mocks.resolvePlace }))
vi.mock('@/lib/weather/metno.server', () => ({ fetchForecast: mocks.fetchForecast }))
vi.mock('@/lib/weather/tools', () => ({
  checkGrillWeather: vi.fn(),
  checkGolfWindow: vi.fn(),
  checkRouteWeather: mocks.checkRouteWeather,
}))
vi.mock('@/lib/weather/ai.server', () => ({ getAiAnswer: mocks.getAiAnswer }))
vi.mock('@/lib/weather/question', () => ({
  detectIntent: mocks.detectIntent,
  extractPlace: vi.fn(),
  extractTrailerKind: mocks.extractTrailerKind,
  extractRouteOrigin: mocks.extractRouteOrigin,
  extractRouteDestination: mocks.extractRouteDestination,
  parseTimeWindow: mocks.parseTimeWindow,
}))
vi.mock('@/lib/weather/provider.server', () => ({
  getWeatherMapProvider: mocks.getWeatherMapProvider,
}))
vi.mock('@/lib/places/hmsDirectory.server', () => ({
  searchHmsPlaces: mocks.searchHmsPlaces,
}))
vi.mock('@/lib/road-intelligence/teskeidRouteDiscovery.server', () => ({
  discoverTeskeidRoutes: mocks.discoverTeskeidRoutes,
}))

import { POST } from '@/app/api/teskeid/weather/ask/route'

const ORIGIN = { name: 'Reykjavík', lat: 64.135, lon: -21.895 }
const DESTINATION = { name: 'Akureyri', lat: 65.683, lon: -18.1 }
const RECOMMENDED_ROUTE = {
  id: 'teskeid-recommended',
  routeIndex: 0,
  provider: 'teskeid' as const,
  labels: ['TESKEID_PRIMARY'],
  isDefault: true,
  points: Array.from({ length: 20 }, (_, index) => ({
    lat: ORIGIN.lat + ((DESTINATION.lat - ORIGIN.lat) * index) / 19,
    lon: ORIGIN.lon + ((DESTINATION.lon - ORIGIN.lon) * index) / 19,
  })),
  distanceM: 388_000,
  durationS: 17_100,
}
const ALTERNATE_ROUTE = {
  ...RECOMMENDED_ROUTE,
  id: 'teskeid-alternate',
  routeIndex: 1,
  points: [{ lat: 66, lon: -23 }, { lat: 66.1, lon: -22.9 }],
  distanceM: 450_000,
  durationS: 20_000,
}
const DETERMINISTIC = {
  id: 'route-weather-answer',
  stada: 'innan-marka',
  svar: 'Leiðin er innan marka.',
  suggestedAction: 'Fylgstu með veðri.',
}

function request() {
  return new Request('http://localhost/api/teskeid/weather/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: 'Má draga hjólhýsi frá Reykjavík til Akureyrar?' }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.AUTH_MVP_ENABLED = 'true'
  delete process.env.PLACE_SEARCH_GOOGLE_FALLBACK_ENABLED
  mocks.globalFetch.mockRejectedValue(new Error('unexpected_network_fetch'))
  vi.stubGlobal('fetch', mocks.globalFetch)
  mocks.getUser.mockResolvedValue({
    data: { user: { id: 'u1', email: 'u@example.com' } },
  })
  mocks.checkFeatureAccess.mockResolvedValue(true)
  mocks.detectIntent.mockReturnValue('route_towable_trailer')
  mocks.extractTrailerKind.mockReturnValue('caravan')
  mocks.extractRouteOrigin.mockReturnValue('Reykjavík')
  mocks.extractRouteDestination.mockReturnValue('Akureyri')
  mocks.parseTimeWindow.mockReturnValue({
    startIso: '2026-08-13T18:00:00.000Z',
    endIso: '2026-08-13T21:00:00.000Z',
  })
  mocks.resolvePlace.mockImplementation((query: string) => (
    query === 'Reykjavík' ? ORIGIN : query === 'Akureyri' ? DESTINATION : null
  ))
  mocks.searchHmsPlaces.mockResolvedValue([])
  mocks.getWeatherMapProvider.mockReturnValue({
    geocodePlace: mocks.geocodePlace,
    staticMapUrl: vi.fn(() => 'https://maps.example/static'),
  })
  mocks.discoverTeskeidRoutes.mockResolvedValue({
    status: 'ready',
    routes: [RECOMMENDED_ROUTE, ALTERNATE_ROUTE],
    evidence: [],
    recommendedRouteId: RECOMMENDED_ROUTE.id,
  })
  mocks.fetchForecast.mockResolvedValue([{ time: '2026-08-13T18:00:00.000Z' }])
  mocks.checkRouteWeather.mockReturnValue(DETERMINISTIC)
  mocks.getAiAnswer.mockResolvedValue(null)
})

afterEach(() => {
  expect(mocks.globalFetch).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
  delete process.env.PLACE_SEARCH_GOOGLE_FALLBACK_ENABLED
})

describe('POST /api/teskeid/weather/ask route intent (v238)', () => {
  it('assesses the canonical recommended Teskeið route directly with bounded weather calls', async () => {
    const response = await POST(request())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.discoverTeskeidRoutes).toHaveBeenCalledWith(
      expect.objectContaining(ORIGIN),
      expect.objectContaining(DESTINATION),
    )
    expect(mocks.fetchForecast).toHaveBeenCalledTimes(11)
    expect(mocks.fetchForecast.mock.calls.length).toBeLessThanOrEqual(15)
    expect(mocks.fetchForecast).not.toHaveBeenCalledWith(66, -23)
    expect(mocks.checkRouteWeather).toHaveBeenCalledWith(expect.objectContaining({
      trailerKind: 'caravan',
      distanceM: RECOMMENDED_ROUTE.distanceM,
      durationS: RECOMMENDED_ROUTE.durationS,
    }))
    expect(body.displayed).toMatchObject({
      source: 'deterministic',
      svar: DETERMINISTIC.svar,
    })
  })

  it.each([
    ['pending', 422],
    ['no_route', 422],
    ['unavailable', 422],
    ['disabled', 422],
  ] as const)('fails truthfully on %s discovery without starting weather', async (status, httpStatus) => {
    mocks.discoverTeskeidRoutes.mockResolvedValue({ status, routes: [], evidence: [] })

    const response = await POST(request())

    expect(response.status).toBe(httpStatus)
    await expect(response.json()).resolves.toEqual({ error: 'route_unavailable' })
    expect(mocks.fetchForecast).not.toHaveBeenCalled()
  })

  it('returns a retryable failure when canonical discovery throws', async () => {
    mocks.discoverTeskeidRoutes.mockRejectedValue(new Error('graph unavailable'))

    const response = await POST(request())

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({ error: 'route_unavailable' })
    expect(mocks.fetchForecast).not.toHaveBeenCalled()
  })

  it('stops unauthenticated requests before place, route or weather work', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } })

    const response = await POST(request())

    expect(response.status).toBe(401)
    expect(mocks.resolvePlace).not.toHaveBeenCalled()
    expect(mocks.discoverTeskeidRoutes).not.toHaveBeenCalled()
    expect(mocks.fetchForecast).not.toHaveBeenCalled()
  })

  it('allows the explicit Google place fallback without giving the provider a routing surface', async () => {
    process.env.PLACE_SEARCH_GOOGLE_FALLBACK_ENABLED = 'true'
    mocks.resolvePlace.mockReturnValue(null)
    mocks.geocodePlace
      .mockResolvedValueOnce([{
        placeId: 'google-origin', displayName: ORIGIN.name,
        formattedAddress: `${ORIGIN.name}, Ísland`, lat: ORIGIN.lat, lon: ORIGIN.lon,
      }])
      .mockResolvedValueOnce([{
        placeId: 'google-destination', displayName: DESTINATION.name,
        formattedAddress: `${DESTINATION.name}, Ísland`, lat: DESTINATION.lat, lon: DESTINATION.lon,
      }])

    const response = await POST(request())

    expect(response.status).toBe(200)
    expect(mocks.geocodePlace).toHaveBeenCalledTimes(2)
    expect(mocks.getWeatherMapProvider.mock.results[0]?.value).not.toHaveProperty('getRouteOptions')
    expect(mocks.getWeatherMapProvider.mock.results[0]?.value).not.toHaveProperty('getRouteGeometry')
    expect(mocks.discoverTeskeidRoutes).toHaveBeenCalledOnce()
  })
})
