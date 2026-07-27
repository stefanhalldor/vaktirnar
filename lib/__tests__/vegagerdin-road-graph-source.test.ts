import { describe, expect, it, vi } from 'vitest'
import {
  normalizeVegagerdinRoadGraphSegments,
  vegagerdinDirection,
  vegagerdinRoadClass,
  vegagerdinSurface,
  type ArcGisGeoJsonFeatureCollection,
} from '@/lib/iceland-routes/vegagerdinRoadGraphSource'
import { fetchVegagerdinRoadGraphSegments } from '@/lib/iceland-routes/vegagerdinRoadGraphSource.server'

const line = [[-21.9, 64.1, 0], [-21.8, 64.2, 0]]

function collection(features: ArcGisGeoJsonFeatureCollection['features'], exceeded = false): ArcGisGeoJsonFeatureCollection {
  return { type: 'FeatureCollection', features, exceededTransferLimit: exceeded }
}

function feature(properties: Record<string, unknown>, coordinates: unknown = line) {
  return {
    type: 'Feature' as const,
    geometry: { type: 'LineString' as const, coordinates },
    properties,
  }
}

describe('Vegagerdin road graph normalization', () => {
  it('maps official coded values without guessing unknown values', () => {
    expect(vegagerdinSurface(1)).toBe('paved')
    expect(vegagerdinSurface(0)).toBe('gravel')
    expect(vegagerdinSurface(21)).toBe('unknown')
    expect(vegagerdinDirection(-1)).toBe('reverse')
    expect(vegagerdinDirection(1)).toBe('forward')
    expect(vegagerdinDirection(2)).toBe('both')
    expect(vegagerdinRoadClass(8)).toBe('highland_trunk')
    expect(vegagerdinRoadClass(999)).toBe('other')
  })

  it('joins direction metadata to surface-split geometry', () => {
    const roads = collection([
      feature({
        OBJECTID: 1,
        IDKAFLI: 10,
        NRVEGUR: '1',
        KAFLIVEGURHEITI: 'Hringvegur',
        VEGFLOKKUR: 1,
        STEFNA: -1,
      }),
    ])
    const surfaces = collection([
      feature({
        OBJECTID: 20,
        IDKAFLI: 10,
        NRVEGUR: '1',
        SLITLAGLENGD: 12_000,
        GERD_SL: 1,
      }),
    ])

    expect(normalizeVegagerdinRoadGraphSegments({ roads, surfaces })).toEqual([expect.objectContaining({
      id: 'vegagerdin-road-1-0',
      roadNumber: '1',
      roadName: 'Hringvegur',
      roadClass: 'trunk',
      surface: 'paved',
      direction: 'reverse',
      lengthM: undefined,
      isFRoad: false,
    })])
  })

  it('marks F roads without claiming that all F roads are currently seasonal', () => {
    const roads = collection([feature({ OBJECTID: 1, IDKAFLI: 10, NRVEGUR: 'F35', VEGFLOKKUR: 8, STEFNA: 2 })])
    const surfaces = collection([feature({ OBJECTID: 20, IDKAFLI: 10, GERD_SL: 0 })])
    const [result] = normalizeVegagerdinRoadGraphSegments({ roads, surfaces })
    expect(result).toMatchObject({
      isFRoad: true,
      isMountainRoad: true,
      isSeasonal: false,
      surface: 'gravel',
    })
  })

  it('rejects geometry outside Icelandic bounds', () => {
    const roads = collection([feature({ OBJECTID: 1, IDKAFLI: 10 }, [[0, 0], [1, 1]])])
    const surfaces = collection([feature({ OBJECTID: 20, IDKAFLI: 10 })])
    expect(normalizeVegagerdinRoadGraphSegments({ roads, surfaces })).toEqual([])
  })

  it('splits a mixed road section using complete official station intervals', () => {
    const roads = collection([feature({
      OBJECTID: 1,
      IDKAFLI: 10,
      VEGFLOKKUR: 1,
      STEFNA: 2,
      KAFLILENGD: 1_000,
      KAFLISTODUPPHAF: 0,
      KAFLISTODENDIR: 1_000,
    }, [[-21.9, 64.1], [-21.8, 64.2], [-21.7, 64.3]])])
    const surfaces = collection([
      feature({ OBJECTID: 20, IDKAFLI: 10, GERD_SL: 1, UPPH_STOD: 0, ENDA_STOD: 400, SLITLAGLENGD: 400 }),
      feature({ OBJECTID: 21, IDKAFLI: 10, GERD_SL: 0, UPPH_STOD: 400, ENDA_STOD: 1_000, SLITLAGLENGD: 600 }),
    ])
    const result = normalizeVegagerdinRoadGraphSegments({ roads, surfaces })
    expect(result).toHaveLength(2)
    expect(result.map(segment => ({ id: segment.id, surface: segment.surface, lengthM: segment.lengthM }))).toEqual([
      { id: 'vegagerdin-road-1-0-surface-0', surface: 'paved', lengthM: 400 },
      { id: 'vegagerdin-road-1-0-surface-1', surface: 'gravel', lengthM: 600 },
    ])
    expect(result[0].geometry[0]).toEqual({ lat: 64.1, lon: -21.9 })
    expect(result[0].geometry.at(-1)).toEqual(result[1].geometry[0])
    expect(result[1].geometry.at(-1)).toEqual({ lat: 64.3, lon: -21.7 })
  })

  it('fails closed to mixed when official station intervals have a gap', () => {
    const roads = collection([feature({
      OBJECTID: 1,
      IDKAFLI: 10,
      VEGFLOKKUR: 1,
      STEFNA: 2,
      KAFLILENGD: 1_000,
      KAFLISTODUPPHAF: 0,
      KAFLISTODENDIR: 1_000,
    })])
    const surfaces = collection([
      feature({ OBJECTID: 20, IDKAFLI: 10, GERD_SL: 1, UPPH_STOD: 0, ENDA_STOD: 400, SLITLAGLENGD: 400 }),
      feature({ OBJECTID: 21, IDKAFLI: 10, GERD_SL: 0, UPPH_STOD: 500, ENDA_STOD: 1_000, SLITLAGLENGD: 500 }),
    ])
    const result = normalizeVegagerdinRoadGraphSegments({ roads, surfaces })
    expect(result).toHaveLength(1)
    expect(result[0].surface).toBe('mixed')
  })

  it('maps surface intervals in geometry order when road stationing runs in reverse', () => {
    const roads = collection([feature({
      OBJECTID: 1,
      IDKAFLI: 10,
      VEGFLOKKUR: 1,
      STEFNA: 2,
      KAFLILENGD: 1_000,
      KAFLISTODUPPHAF: 1_000,
      KAFLISTODENDIR: 0,
    }, [[-21.9, 64.1], [-21.8, 64.2], [-21.7, 64.3]])])
    const surfaces = collection([
      feature({ OBJECTID: 20, IDKAFLI: 10, GERD_SL: 1, UPPH_STOD: 0, ENDA_STOD: 600, SLITLAGLENGD: 600 }),
      feature({ OBJECTID: 21, IDKAFLI: 10, GERD_SL: 0, UPPH_STOD: 600, ENDA_STOD: 1_000, SLITLAGLENGD: 400 }),
    ])

    const result = normalizeVegagerdinRoadGraphSegments({ roads, surfaces })
    expect(result.map(segment => ({ surface: segment.surface, lengthM: segment.lengthM }))).toEqual([
      { surface: 'gravel', lengthM: 400 },
      { surface: 'paved', lengthM: 600 },
    ])
    expect(result[0].geometry[0]).toEqual({ lat: 64.1, lon: -21.9 })
    expect(result[0].geometry.at(-1)).toEqual(result[1].geometry[0])
    expect(result[1].geometry.at(-1)).toEqual({ lat: 64.3, lon: -21.7 })
  })
})

describe('Vegagerdin road graph fetch boundary', () => {
  it('paginates both official layers and sends a fixed allowlisted query', async () => {
    const roadFeature = feature({ OBJECTID: 1, IDKAFLI: 10, NRVEGUR: '1', VEGFLOKKUR: 1, STEFNA: 2 })
    const surfaceFeature = feature({ OBJECTID: 2, IDKAFLI: 10, NRVEGUR: '1', GERD_SL: 1 })
    const calls: string[] = []
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      calls.push(url)
      const isRoad = url.includes('/vegakerfi/')
      const offset = new URL(url).searchParams.get('resultOffset')
      const payload = offset === '0'
        ? collection([isRoad ? roadFeature : surfaceFeature], true)
        : collection([])
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    const result = await fetchVegagerdinRoadGraphSegments({ fetchImpl })
    expect(result).toHaveLength(1)
    expect(calls).toHaveLength(4)
    for (const call of calls) {
      const url = new URL(call)
      expect(url.hostname).toBe('vegasja.vegagerdin.is')
      expect(url.searchParams.get('where')).toBe('1=1')
      expect(url.searchParams.get('outSR')).toBe('4326')
      expect(url.searchParams.get('f')).toBe('geojson')
    }
    const roadUrl = new URL(calls.find(call => call.includes('/vegakerfi/'))!)
    expect(roadUrl.searchParams.get('outFields')).toContain('KAFLISTODUPPHAF')
    expect(roadUrl.searchParams.get('outFields')).toContain('KAFLISTODENDIR')
    const surfaceUrl = new URL(calls.find(call => call.includes('/slitlag/'))!)
    expect(surfaceUrl.searchParams.get('outFields')).toContain('UPPH_STOD')
    expect(surfaceUrl.searchParams.get('outFields')).toContain('ENDA_STOD')
  })

  it('fails closed on an upstream HTTP error', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 503 }))
    await expect(fetchVegagerdinRoadGraphSegments({ fetchImpl }))
      .rejects.toThrow('vegagerdin_road_graph_source_http_503')
  })
})
