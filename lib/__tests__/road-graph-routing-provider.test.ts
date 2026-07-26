import { describe, expect, it } from 'vitest'
import { buildIcelandRoadGraph } from '@/lib/iceland-routes/roadGraph'
import { IcelandRoadGraphRoutingProvider } from '@/lib/iceland-routes/roadGraphRoutingProvider.server'
import type { IcelandRoadGraphSegmentInput } from '@/lib/iceland-routes/roadGraphTypes'

const A = { lat: 64.1, lon: -21.9 }
const B = { lat: 64.1, lon: -21.7 }
const C = { lat: 64.18, lon: -21.8 }

function segment(id: string, geometry: IcelandRoadGraphSegmentInput['geometry'], overrides: Partial<IcelandRoadGraphSegmentInput> = {}): IcelandRoadGraphSegmentInput {
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

const graph = buildIcelandRoadGraph([
  segment('gravel-shortcut', [A, B], { surface: 'gravel', lengthM: 10_000 }),
  segment('paved-1', [A, C], { lengthM: 7_000 }),
  segment('paved-2', [C, B], { lengthM: 7_000 }),
])

describe('IcelandRoadGraphRoutingProvider', () => {
  it('returns connected road-graph geometry and surface facts', async () => {
    const provider = new IcelandRoadGraphRoutingProvider(graph, 100)
    const result = await provider.calculateRoutes({
      origin: { point: A },
      destination: { point: B },
      vehicleProfile: 'caravan',
    })
    const [path] = result.paths
    expect(path.resultKind).toBe('road_graph')
    expect(path.segmentIds).toEqual(['paved-1', 'paved-2'])
    expect(path.surfaceBreakdown).toEqual({ pavedM: 14_000, gravelM: 0, mixedM: 0, unknownM: 0 })
    expect(path.originSnapDistanceM).toBe(0)
    expect(path.destinationSnapDistanceM).toBe(0)
    expect(path.warnings).toContain('travel-time-uses-derived-speeds')
  })

  it('honours explicit avoid-gravel for a normal car', async () => {
    const provider = new IcelandRoadGraphRoutingProvider(graph, 100)
    const result = await provider.calculateRoutes({
      origin: { point: A },
      destination: { point: B },
      vehicleProfile: 'car',
      avoid: ['gravel'],
    })
    expect(result.paths[0].segmentIds).toEqual(['paved-1', 'paved-2'])
  })

  it('uses a stable privacy-safe error when no graph node is nearby', async () => {
    const provider = new IcelandRoadGraphRoutingProvider(graph, 100)
    await expect(provider.calculateRoutes({
      origin: { point: { lat: 66, lon: -18 } },
      destination: { point: B },
      vehicleProfile: 'car',
    })).rejects.toThrow('teskeid_routes: no_nearby_node')
  })
})
