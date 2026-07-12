import { vi, describe, it, expect, beforeEach } from 'vitest'

// ── Environment stubs ─────────────────────────────────────────────────────────

vi.mock('server-only', () => ({}))

const mockMaybeSingle = vi.fn()
const mockUpsert = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  getAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: mockMaybeSingle,
        }),
      }),
      upsert: mockUpsert,
    }),
  }),
}))

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import {
  fetchVedurstofanForecastsForStations,
  cacheKeyForStation,
} from '@/lib/weather/providers/vedurstofan.server'
import { VEDURSTOFAN_STATIONS } from '@/lib/weather/providers/vedurstofanStations'

// ── Test fixtures ─────────────────────────────────────────────────────────────

function stationXml(id: string, name: string): string {
  return [
    `<station id="${id}" valid="1">`,
    `  <name>${name}</name>`,
    `  <atime>2026-07-12 06:00:00</atime>`,
    `  <err></err>`,
    `  <forecast>`,
    `    <ftime>2026-07-12 09:00:00</ftime>`,
    `    <F>10</F><D>N</D><T>5</T><R>0,6</R><W>Skýjað</W>`,
    `  </forecast>`,
    `</station>`,
  ].join('\n')
}

function forecastsXml(stations: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<forecasts>\n${stations.join('\n')}\n</forecasts>`
}

const HELLISH_ID = '31392'
const SELFOSS_ID = '6300'

const SINGLE_STATION_XML = forecastsXml([stationXml(HELLISH_ID, 'Hellisheiði')])
const TWO_STATION_XML = forecastsXml([
  stationXml(HELLISH_ID, 'Hellisheiði'),
  stationXml(SELFOSS_ID, 'Selfoss'),
])

function makeCachedPayload(stationId: string): object {
  return {
    source: 'vedurstofan',
    stationId,
    forecasts: [],
    parseErrors: [],
    expiresAtIso: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    fetchedAtIso: new Date().toISOString(),
    attribution: { provider: 'Veðurstofa Íslands', downloadedAtIso: '', serviceUrl: '' },
  }
}

// ── Setup ─────────────────────────────────────────────────────────────────────

const mockFetch = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', mockFetch)
  mockUpsert.mockResolvedValue({})
})

// ── cacheKeyForStation ────────────────────────────────────────────────────────

describe('cacheKeyForStation', () => {
  it('returns the correct key format encoding all response dimensions', () => {
    expect(cacheKeyForStation('31392')).toBe(
      'vedurstofan:xml:forec:is:3h:F-D-T-R-W:31392',
    )
  })

  it('includes the station ID in the key', () => {
    expect(cacheKeyForStation('5544')).toBe(
      'vedurstofan:xml:forec:is:3h:F-D-T-R-W:5544',
    )
  })
})

// ── fetchVedurstofanForecastsForStations ─────────────────────────────────────

describe('fetchVedurstofanForecastsForStations', () => {
  it('returns an empty map for empty input without fetching', async () => {
    const result = await fetchVedurstofanForecastsForStations([])
    expect(result.size).toBe(0)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns unavailable for station IDs not in the verified list', async () => {
    const result = await fetchVedurstofanForecastsForStations(['FAKE999'])
    expect(result.get('FAKE999')).toEqual({ status: 'unavailable' })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns ok from fresh cache without fetching', async () => {
    const payload = makeCachedPayload(HELLISH_ID)
    // Cache row with expires_at 1 hour in the future
    mockMaybeSingle.mockResolvedValue({
      data: { response_body: payload, expires_at: new Date(Date.now() + 3_600_000).toISOString() },
    })

    const result = await fetchVedurstofanForecastsForStations([HELLISH_ID])

    expect(result.get(HELLISH_ID)?.status).toBe('ok')
    expect(result.get(HELLISH_ID)).toMatchObject({ status: 'ok', payload })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('fetches, parses and upserts when cache is missing', async () => {
    // Cache miss
    mockMaybeSingle.mockResolvedValue({ data: null })
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(SINGLE_STATION_XML),
    })

    const result = await fetchVedurstofanForecastsForStations([HELLISH_ID])

    expect(result.get(HELLISH_ID)?.status).toBe('ok')
    const entry = result.get(HELLISH_ID)
    expect(entry?.status).toBe('ok')
    if (entry?.status === 'ok') {
      expect(entry.payload.stationId).toBe(HELLISH_ID)
      expect(entry.payload.forecasts).toHaveLength(1)
    }
    expect(mockUpsert).toHaveBeenCalledOnce()
  })

  it('fetches fresh data when cache is expired', async () => {
    // Expired cache row
    mockMaybeSingle.mockResolvedValue({
      data: {
        response_body: makeCachedPayload(HELLISH_ID),
        expires_at: new Date(Date.now() - 1000).toISOString(),
      },
    })
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(SINGLE_STATION_XML),
    })

    const result = await fetchVedurstofanForecastsForStations([HELLISH_ID])

    expect(result.get(HELLISH_ID)?.status).toBe('ok')
    expect(mockFetch).toHaveBeenCalledOnce()
    expect(mockUpsert).toHaveBeenCalledOnce()
  })

  it('returns stale cache when fetch fails on an expired row', async () => {
    const stalePayload = makeCachedPayload(HELLISH_ID)
    mockMaybeSingle.mockResolvedValue({
      data: {
        response_body: stalePayload,
        expires_at: new Date(Date.now() - 1000).toISOString(),
      },
    })
    mockFetch.mockRejectedValue(new Error('network error'))

    const result = await fetchVedurstofanForecastsForStations([HELLISH_ID])

    expect(result.get(HELLISH_ID)).toMatchObject({ status: 'stale', payload: stalePayload })
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('returns unavailable when cache is missing and fetch fails', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null })
    mockFetch.mockRejectedValue(new Error('network error'))

    const result = await fetchVedurstofanForecastsForStations([HELLISH_ID])

    expect(result.get(HELLISH_ID)).toEqual({ status: 'unavailable' })
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('splits 12 station IDs into two batches of ≤10', async () => {
    const ids = VEDURSTOFAN_STATIONS.slice(0, 12).map(s => s.stationId)
    // All cache misses
    mockMaybeSingle.mockResolvedValue({ data: null })
    // All fetches fail (simplest way to test batch splitting)
    mockFetch.mockRejectedValue(new Error('network error'))

    await fetchVedurstofanForecastsForStations(ids)

    expect(mockFetch).toHaveBeenCalledTimes(2)

    // First batch: 10 IDs
    const firstUrl = mockFetch.mock.calls[0][0] as string
    const firstIds = firstUrl.split('ids=')[1]?.split('&')[0]?.split(';') ?? []
    expect(firstIds).toHaveLength(10)

    // Second batch: 2 IDs
    const secondUrl = mockFetch.mock.calls[1][0] as string
    const secondIds = secondUrl.split('ids=')[1]?.split('&')[0]?.split(';') ?? []
    expect(secondIds).toHaveLength(2)
  })

  it('upserts using the correct structured cache key', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null })
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(SINGLE_STATION_XML),
    })

    await fetchVedurstofanForecastsForStations([HELLISH_ID])

    expect(mockUpsert).toHaveBeenCalledOnce()
    const upsertArg = mockUpsert.mock.calls[0][0] as { cache_key: string }
    expect(upsertArg.cache_key).toBe(cacheKeyForStation(HELLISH_ID))
    expect(upsertArg.cache_key).toBe('vedurstofan:xml:forec:is:3h:F-D-T-R-W:31392')
  })

  it('includes attribution and fetchedAtIso in every cached payload', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null })
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(SINGLE_STATION_XML),
    })

    const result = await fetchVedurstofanForecastsForStations([HELLISH_ID])

    const entry = result.get(HELLISH_ID)
    expect(entry?.status).toBe('ok')
    if (entry?.status === 'ok') {
      expect(entry.payload.attribution.provider).toBe('Veðurstofa Íslands')
      expect(entry.payload.attribution.downloadedAtIso).toBeTruthy()
      expect(entry.payload.attribution.serviceUrl).toContain('xmlweather.vedur.is')
      expect(entry.payload.fetchedAtIso).toBeTruthy()
      expect(new Date(entry.payload.fetchedAtIso).getTime()).toBeGreaterThan(0)
    }
  })

  it('returns ok for fetched station and unavailable for missing station in same batch', async () => {
    // HELLISH_ID is in the XML, SELFOSS_ID is not
    mockMaybeSingle.mockResolvedValue({ data: null })
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(SINGLE_STATION_XML),
    })

    const result = await fetchVedurstofanForecastsForStations([HELLISH_ID, SELFOSS_ID])

    expect(result.get(HELLISH_ID)?.status).toBe('ok')
    expect(result.get(SELFOSS_ID)?.status).toBe('unavailable')
  })

  it('handles mixed verified and unverified IDs in the same call', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        response_body: makeCachedPayload(HELLISH_ID),
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      },
    })

    const result = await fetchVedurstofanForecastsForStations([HELLISH_ID, 'BOGUS'])

    expect(result.get(HELLISH_ID)?.status).toBe('ok')
    expect(result.get('BOGUS')).toEqual({ status: 'unavailable' })
  })

  it('expiresAtIso is approximately 90 minutes after fetchedAtIso', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null })
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(SINGLE_STATION_XML),
    })

    const before = Date.now()
    const result = await fetchVedurstofanForecastsForStations([HELLISH_ID])
    const after = Date.now()

    const entry = result.get(HELLISH_ID)
    if (entry?.status === 'ok') {
      const fetched = new Date(entry.payload.fetchedAtIso).getTime()
      const expires = new Date(entry.payload.expiresAtIso).getTime()
      const ttlMs = expires - fetched
      // TTL should be 90 minutes (5400000 ms), with small clock tolerance
      expect(ttlMs).toBeGreaterThanOrEqual(5_400_000 - 100)
      expect(ttlMs).toBeLessThanOrEqual(5_400_000 + 100)
      // fetchedAtIso should be within the test execution window
      expect(fetched).toBeGreaterThanOrEqual(before)
      expect(fetched).toBeLessThanOrEqual(after)
    }
  })

  it('does not cache a station response with valid=false', async () => {
    const invalidXml = forecastsXml([
      `<station id="${HELLISH_ID}" valid="0"><name>Hellisheiði</name><atime>2026-07-12 06:00:00</atime><err>Station offline</err></station>`,
    ])
    mockMaybeSingle.mockResolvedValue({ data: null })
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve(invalidXml) })

    const result = await fetchVedurstofanForecastsForStations([HELLISH_ID])

    expect(result.get(HELLISH_ID)).toEqual({ status: 'unavailable' })
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('does not cache a station with non-empty errText even when valid=true', async () => {
    const errXml = forecastsXml([
      `<station id="${HELLISH_ID}" valid="1"><name>Hellisheiði</name><atime>2026-07-12 06:00:00</atime><err>Timeout</err></station>`,
    ])
    mockMaybeSingle.mockResolvedValue({ data: null })
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve(errXml) })

    const result = await fetchVedurstofanForecastsForStations([HELLISH_ID])

    expect(result.get(HELLISH_ID)).toEqual({ status: 'unavailable' })
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('does not cache a station with zero forecast rows', async () => {
    const emptyXml = forecastsXml([
      `<station id="${HELLISH_ID}" valid="1"><name>Hellisheiði</name><atime>2026-07-12 06:00:00</atime><err></err></station>`,
    ])
    mockMaybeSingle.mockResolvedValue({ data: null })
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve(emptyXml) })

    const result = await fetchVedurstofanForecastsForStations([HELLISH_ID])

    expect(result.get(HELLISH_ID)).toEqual({ status: 'unavailable' })
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('returns stale cache for invalid station response when stale row exists', async () => {
    const stalePayload = makeCachedPayload(HELLISH_ID)
    mockMaybeSingle.mockResolvedValue({
      data: { response_body: stalePayload, expires_at: new Date(Date.now() - 1000).toISOString() },
    })
    const invalidXml = forecastsXml([
      `<station id="${HELLISH_ID}" valid="0"><name>Hellisheiði</name><atime>2026-07-12 06:00:00</atime><err>Down</err></station>`,
    ])
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve(invalidXml) })

    const result = await fetchVedurstofanForecastsForStations([HELLISH_ID])

    expect(result.get(HELLISH_ID)).toMatchObject({ status: 'stale', payload: stalePayload })
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('deduplicates duplicate input station IDs', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        response_body: makeCachedPayload(HELLISH_ID),
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      },
    })

    const result = await fetchVedurstofanForecastsForStations([HELLISH_ID, HELLISH_ID, HELLISH_ID])

    // Only one entry in the result
    expect(result.size).toBe(1)
    expect(result.get(HELLISH_ID)?.status).toBe('ok')
    // Only one cache read (not three)
    expect(mockMaybeSingle).toHaveBeenCalledTimes(1)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('payload includes atimeIso from the XML station block', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null })
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(SINGLE_STATION_XML),
    })

    const result = await fetchVedurstofanForecastsForStations([HELLISH_ID])

    const entry = result.get(HELLISH_ID)
    if (entry?.status === 'ok') {
      expect(entry.payload.atimeIso).toBe('2026-07-12T06:00:00Z')
    }
  })

  it('fetch URL includes station IDs joined by semicolons', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null })
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(TWO_STATION_XML),
    })

    await fetchVedurstofanForecastsForStations([HELLISH_ID, SELFOSS_ID])

    expect(mockFetch).toHaveBeenCalledOnce()
    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain(`ids=${HELLISH_ID};${SELFOSS_ID}`)
    expect(url).toContain('xmlweather.vedur.is')
    expect(url).toContain('type=forec')
  })

  it('passes an AbortSignal to fetch when timeoutMs is provided', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null })
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(SINGLE_STATION_XML),
    })

    await fetchVedurstofanForecastsForStations([HELLISH_ID], { timeoutMs: 5000 })

    expect(mockFetch).toHaveBeenCalledOnce()
    const fetchOpts = mockFetch.mock.calls[0][1] as RequestInit & { signal?: AbortSignal }
    expect(fetchOpts.signal).toBeDefined()
    expect(fetchOpts.signal).toBeInstanceOf(AbortSignal)
  })

  it('returns stale cache when fetch is aborted (simulating timeout)', async () => {
    const stalePayload = makeCachedPayload(HELLISH_ID)
    // Expired cache row exists
    mockMaybeSingle.mockResolvedValue({
      data: { response_body: stalePayload, expires_at: new Date(Date.now() - 1000).toISOString() },
    })
    // Fetch rejects with AbortError (what happens when AbortController fires)
    const abortError = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })
    mockFetch.mockRejectedValue(abortError)

    const result = await fetchVedurstofanForecastsForStations([HELLISH_ID], { timeoutMs: 100 })

    // On abort/timeout, stale cache is used as fallback
    expect(result.get(HELLISH_ID)).toMatchObject({ status: 'stale', payload: stalePayload })
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('returns unavailable when aborted and no stale cache exists', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null })
    const abortError = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })
    mockFetch.mockRejectedValue(abortError)

    const result = await fetchVedurstofanForecastsForStations([HELLISH_ID], { timeoutMs: 100 })

    expect(result.get(HELLISH_ID)).toEqual({ status: 'unavailable' })
  })
})
