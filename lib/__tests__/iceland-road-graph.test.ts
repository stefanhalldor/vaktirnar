import { describe, expect, it } from 'vitest'
import {
  analyzeIcelandRoadGraph,
  buildIcelandRoadGraph,
  derivedRoadSpeedKmh,
  findIcelandRoadGraphRoute,
  findIcelandRoadGraphAlternatives,
  geometryLengthM,
  ICELAND_ROUTING_PROFILES,
} from '@/lib/iceland-routes/roadGraph'
import type { IcelandRoadGraphSegmentInput } from '@/lib/iceland-routes/roadGraphTypes'

const A = { lat: 64.10, lon: -21.90 }
const B = { lat: 64.10, lon: -21.70 }
const C = { lat: 64.18, lon: -21.80 }
const D = { lat: 64.18, lon: -21.90 }

function segment(
  id: string,
  geometry: IcelandRoadGraphSegmentInput['geometry'],
  overrides: Partial<IcelandRoadGraphSegmentInput> = {},
): IcelandRoadGraphSegmentInput {
  return {
    id,
    source: 'teskeid_fixture',
    sourceId: id,
    geometry,
    roadClass: 'trunk',
    surface: 'paved',
    direction: 'both',
    ...overrides,
  }
}

describe('Iceland road graph builder', () => {
  it('snaps neighbouring segment endpoints and creates directed edges', () => {
    const almostB = { lat: B.lat + 0.00002, lon: B.lon }
    const graph = buildIcelandRoadGraph([
      segment('a-b', [A, B]),
      segment('b-c', [almostB, C], { direction: 'forward' }),
    ], { nodeSnapToleranceM: 5 })

    expect(graph.nodes.size).toBe(3)
    expect(graph.edges).toHaveLength(3)
    expect(graph.edges.filter(edge => edge.segmentId === 'b-c')).toHaveLength(1)
  })

  it('respects reverse-only segments', () => {
    const graph = buildIcelandRoadGraph([
      segment('reverse', [A, B], { direction: 'reverse' }),
    ])

    expect(findIcelandRoadGraphRoute(graph, A, B, {
      profile: { objective: 'shortest' },
    }).status).toBe('no_route')
    expect(findIcelandRoadGraphRoute(graph, B, A, {
      profile: { objective: 'shortest' },
    }).status).toBe('ok')
  })

  it('reports weak components and source quality diagnostics', () => {
    const graph = buildIcelandRoadGraph([
      segment('a-b', [A, B]),
      segment('isolated', [{ lat: 65, lon: -20 }, { lat: 65.1, lon: -20 }], { surface: 'gravel' }),
    ])
    expect(analyzeIcelandRoadGraph(graph)).toMatchObject({
      nodeCount: 4,
      edgeCount: 4,
      segmentCount: 2,
      weakComponentCount: 2,
      largestWeakComponentNodeCount: 2,
      surfaceEdgeCounts: { paved: 2, gravel: 2, mixed: 0, unknown: 0 },
      derivedSpeedEdgeCount: 4,
    })
  })
})

describe('Iceland road graph routing profiles', () => {
  const graph = buildIcelandRoadGraph([
    segment('direct-gravel', [A, B], {
      lengthM: 10_000,
      surface: 'gravel',
      speedKmh: 40,
      speedSource: 'official',
    }),
    segment('paved-a-c', [A, C], {
      lengthM: 7_000,
      speedKmh: 80,
      speedSource: 'official',
    }),
    segment('paved-c-b', [C, B], {
      lengthM: 7_000,
      speedKmh: 80,
      speedSource: 'official',
    }),
  ])

  it('selects the physically shortest route when gravel is allowed', () => {
    const result = findIcelandRoadGraphRoute(graph, A, B, {
      profile: { objective: 'shortest' },
    })
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.route.segmentIds).toEqual(['direct-gravel'])
    expect(result.route.surface.gravelM).toBe(10_000)
  })

  it('carries F-road distance and road numbers into the routed result', () => {
    const fRoadGraph = buildIcelandRoadGraph([
      segment('f-road', [A, B], {
        lengthM: 12_000,
        roadNumber: 'F35',
        roadClass: 'highland_trunk',
        isFRoad: true,
        isMountainRoad: true,
        surface: 'gravel',
      }),
    ])
    const result = findIcelandRoadGraphRoute(fRoadGraph, A, B, {
      profile: { objective: 'shortest' },
    })
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.route.fRoadDistanceM).toBe(12_000)
    expect(result.route.fRoadNumbers).toEqual(['F35'])
  })

  it('selects the fastest route using segment speeds', () => {
    const result = findIcelandRoadGraphRoute(graph, A, B, {
      profile: { objective: 'fastest' },
    })
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.route.segmentIds).toEqual(['paved-a-c', 'paved-c-b'])
    expect(result.route.durationS).toBe(630)
  })

  it('can require a fully paved route', () => {
    const result = findIcelandRoadGraphRoute(graph, A, B, {
      profile: ICELAND_ROUTING_PROFILES.shortestPaved,
    })
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.route.segmentIds).toEqual(['paved-a-c', 'paved-c-b'])
    expect(result.route.surface).toEqual({ pavedM: 14_000, gravelM: 0, mixedM: 0, unknownM: 0 })
  })

  it('returns no route when the only available edge violates the profile', () => {
    const gravelOnly = buildIcelandRoadGraph([
      segment('gravel', [A, B], { surface: 'gravel' }),
    ])
    expect(findIcelandRoadGraphRoute(gravelOnly, A, B, {
      profile: ICELAND_ROUTING_PROFILES.fastestPaved,
    })).toEqual({ status: 'no_route' })
  })

  it('returns no-nearby-node outside the configured snap radius', () => {
    expect(findIcelandRoadGraphRoute(graph, { lat: 66, lon: -18 }, B, {
      profile: { objective: 'shortest' },
      maxSnapDistanceM: 100,
    })).toEqual({ status: 'no_nearby_node' })
  })

  it('chooses a connected nearby node pair instead of two disconnected nearest nodes', () => {
    const originLocal = { lat: 64.1001, lon: -21.9001 }
    const destinationLocal = { lat: 64.1001, lon: -21.7001 }
    const disconnectedA = { lat: 64.1002, lon: -21.9001 }
    const disconnectedB = { lat: 64.1002, lon: -21.7001 }
    const candidateGraph = buildIcelandRoadGraph([
      segment('origin-dead-end', [originLocal, disconnectedA], { direction: 'forward' }),
      segment('destination-dead-end', [disconnectedB, destinationLocal], { direction: 'forward' }),
      segment('connected-main', [A, B], { lengthM: 10_000 }),
    ], { nodeSnapToleranceM: 2 })

    const result = findIcelandRoadGraphRoute(candidateGraph, originLocal, destinationLocal, {
      profile: { objective: 'shortest' },
      maxSnapDistanceM: 100,
    })
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.route.segmentIds).toEqual(['connected-main'])
  })
})

describe('Iceland road graph estimates', () => {
  it('calculates geometry length and conservative derived speeds', () => {
    expect(geometryLengthM([A, B])).toBeGreaterThan(9_000)
    expect(derivedRoadSpeedKmh('trunk', 'paved')).toBe(85)
    expect(derivedRoadSpeedKmh('trunk', 'gravel')).toBe(55)
    expect(derivedRoadSpeedKmh('highland_trunk', 'paved')).toBe(45)
    expect(derivedRoadSpeedKmh('local', 'gravel', true)).toBe(30)
  })

  it('marks distance that uses derived rather than official speed', () => {
    const graph = buildIcelandRoadGraph([segment('derived', [A, B], { lengthM: 12_345 })])
    const result = findIcelandRoadGraphRoute(graph, A, B, {
      profile: { objective: 'fastest' },
    })
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.route.derivedSpeedDistanceM).toBe(12_345)
  })
})

describe('Iceland road graph alternatives', () => {
  it('returns a meaningfully different second route without hand-authored corridors', () => {
    const graph = buildIcelandRoadGraph([
      segment('primary-a', [A, B]), segment('primary-b', [B, C]),
      segment('alternate-a', [A, D]), segment('alternate-b', [D, C], { lengthM: 1300 }),
    ])
    const alternatives = findIcelandRoadGraphAlternatives(graph, A, C, {
      profile: ICELAND_ROUTING_PROFILES.fastestCar,
      maxSnapDistanceM: 100,
      maxAlternatives: 2,
      maxOverlap: 0.8,
    })
    expect(alternatives).toHaveLength(1)
    expect([
      ['primary-a', 'primary-b'],
      ['alternate-a', 'alternate-b'],
    ]).toContainEqual(alternatives[0].route.segmentIds)
    expect(alternatives[0].overlapWithPrimary).toBe(0)
  })
})
