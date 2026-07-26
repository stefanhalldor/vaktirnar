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

  it('marks a road section mixed when its official surface records disagree within the section', () => {
    const roads = collection([feature({ OBJECTID: 1, IDKAFLI: 10, VEGFLOKKUR: 1, STEFNA: 2 })])
    const surfaces = collection([
      feature({ OBJECTID: 20, IDKAFLI: 10, GERD_SL: 1 }),
      feature({ OBJECTID: 21, IDKAFLI: 10, GERD_SL: 0 }),
    ])
    expect(normalizeVegagerdinRoadGraphSegments({ roads, surfaces })[0].surface).toBe('mixed')
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
  })

  it('fails closed on an upstream HTTP error', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 503 }))
    await expect(fetchVegagerdinRoadGraphSegments({ fetchImpl }))
      .rejects.toThrow('vegagerdin_road_graph_source_http_503')
  })
})
