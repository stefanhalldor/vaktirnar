import { describe, expect, it } from 'vitest'

import {
  CAPITAL_AREA_BOUNDS,
  CURATED_ROUTE_PARITY_MANIFEST,
  CURATED_ROUTE_PARITY_MANIFEST_VERSION,
  HELLISHEIDI_DUPLICATE_TOLERANCE_S,
  pointInCuratedBounds,
  shouldSuppressDistinctHellisheidiCandidate,
  triggeredEndpointCuratedRuleIds,
} from '@/lib/iceland-routes/curatedRouteParity'
import {
  compareTeskeidRouteOptions,
  selectTeskeidRouteRecordsBeforeCap,
  type TeskeidRouteInclusion,
} from '@/lib/iceland-routes/routeOptionComparator'
import type { RouteOption } from '@/lib/weather/provider.types'

const REYKJAVIK = { lat: 64.1466, lon: -21.9426 }

function route(id: string, input: {
  unknownM?: number
  mixedM?: number
  fRoadM?: number
  cautions?: number
  gravelM?: number
} = {}): RouteOption {
  return {
    id,
    routeIndex: -1,
    provider: 'teskeid',
    labels: ['TESKEID_EXPERIMENTAL'],
    isDefault: false,
    points: [{ lat: 64, lon: -21 }, { lat: 65, lon: -20 }],
    distanceM: 100_000,
    durationS: 5_000,
    cautions: Array.from({ length: input.cautions ?? 0 }, (_, index) => ({
      id: `caution-${index}`,
      labelKey: 'label',
      summaryKey: 'summary',
      severity: 'caution' as const,
      appliesTo: ['trailer' as const],
    })),
    experimental: {
      derivedDuration: true,
      surface: {
        pavedM: 100_000,
        gravelM: input.gravelM ?? 0,
        mixedM: input.mixedM ?? 0,
        unknownM: input.unknownM ?? 0,
      },
      ...(input.fRoadM ? { fRoad: { distanceM: input.fRoadM, roadNumbers: ['F1'] } } : {}),
    },
  }
}

describe('v238 provider-neutral curated parity manifest', () => {
  it('is versioned, stable and has complete unique policy ownership', () => {
    expect(CURATED_ROUTE_PARITY_MANIFEST_VERSION).toBe('v238.1')
    expect(CURATED_ROUTE_PARITY_MANIFEST.map(rule => rule.id)).toEqual([
      'northern-westfjords-via-holmavik',
      'capital-south-east-via-hellisheidi',
      'capital-east-via-hellisheidi',
      'capital-north-ring-south-east-north',
      'capital-southeast-ring-north-east-south',
      'avoid-oxi-via-reydarfjordur',
    ])
    expect(new Set(CURATED_ROUTE_PARITY_MANIFEST.map(rule => rule.id)).size).toBe(6)
    expect(CURATED_ROUTE_PARITY_MANIFEST.every(rule => (
      rule.owner === 'teskeid_graph'
      && rule.labels.length > 0
      && rule.trigger.length > 0
      && rule.postcondition.length > 0
      && rule.dedupePolicy.length > 0
      && rule.ownerImplementation.startsWith('routeAssessmentCandidateEvidence.server.ts#')
      && rule.proof.length >= 2
    ))).toBe(true)
  })

  it('preserves the exact directional capital and destination bounds', () => {
    expect(pointInCuratedBounds(REYKJAVIK, CAPITAL_AREA_BOUNDS)).toBe(true)
    expect(triggeredEndpointCuratedRuleIds({
      origin: REYKJAVIK,
      destination: { lat: 63.999, lon: -21.188 }, // Hveragerði
      fastestDistanceM: 50_000,
    })).toEqual(['capital-south-east-via-hellisheidi'])
    expect(triggeredEndpointCuratedRuleIds({
      origin: REYKJAVIK,
      destination: { lat: 63.933, lon: -21.373 }, // Þorlákshöfn, west of exact bound
      fastestDistanceM: 50_000,
    })).toEqual([])
    expect(triggeredEndpointCuratedRuleIds({
      origin: REYKJAVIK,
      destination: { lat: 64.255, lon: -21.130 }, // Þingvellir/Laugarvatn side
      fastestDistanceM: 50_000,
    })).toEqual([])
    expect(triggeredEndpointCuratedRuleIds({
      origin: REYKJAVIK,
      destination: { lat: 65.267, lon: -14.395 }, // Egilsstaðir
      fastestDistanceM: 650_000,
    })).toEqual(['capital-east-via-hellisheidi'])
    for (const destination of [
      { lat: 63.933, lon: -20.997 }, // Selfoss
      { lat: 63.419, lon: -19.006 }, // Vík / representative Suðurland
    ]) {
      expect(triggeredEndpointCuratedRuleIds({
        origin: REYKJAVIK,
        destination,
        fastestDistanceM: 200_000,
      })).toEqual(['capital-south-east-via-hellisheidi'])
    }
    expect(triggeredEndpointCuratedRuleIds({
      origin: REYKJAVIK,
      destination: { lat: 64.217, lon: -20.733 }, // Laugarvatn, north of exact bound
      fastestDistanceM: 100_000,
    })).toEqual([])
    expect(triggeredEndpointCuratedRuleIds({
      origin: { lat: 63.985, lon: -22.605 }, // Keflavík, outside capital bounds
      destination: { lat: 65.267, lon: -14.395 },
      fastestDistanceM: 650_000,
    })).toEqual([])
  })

  it('gates both Ring Road directions at 350 km and preserves boundary negatives', () => {
    expect(triggeredEndpointCuratedRuleIds({
      origin: REYKJAVIK,
      destination: { lat: 65.688, lon: -18.126 }, // Akureyri
      fastestDistanceM: 349_999,
    })).toEqual([])
    expect(triggeredEndpointCuratedRuleIds({
      origin: REYKJAVIK,
      destination: { lat: 65.688, lon: -18.126 },
      fastestDistanceM: 350_000,
    })).toEqual(['capital-north-ring-south-east-north'])
    for (const destination of [
      { lat: 65.604, lon: -17.000 }, // Mývatn
      { lat: 66.044, lon: -17.338 }, // Húsavík
    ]) {
      expect(triggeredEndpointCuratedRuleIds({
        origin: REYKJAVIK,
        destination,
        fastestDistanceM: 500_000,
      })).toEqual(['capital-north-ring-south-east-north'])
    }
    expect(triggeredEndpointCuratedRuleIds({
      origin: REYKJAVIK,
      destination: { lat: 64.250, lon: -15.202 }, // Höfn
      fastestDistanceM: 450_000,
    })).toEqual(['capital-southeast-ring-north-east-south'])
    expect(triggeredEndpointCuratedRuleIds({
      origin: REYKJAVIK,
      destination: { lat: 64.657, lon: -14.290 }, // Djúpivogur
      fastestDistanceM: 600_000,
    })).toEqual([
      'capital-east-via-hellisheidi',
      'capital-southeast-ring-north-east-south',
    ])
    expect(triggeredEndpointCuratedRuleIds({
      origin: REYKJAVIK,
      destination: { lat: 65.267, lon: -14.395 }, // Egilsstaðir boundary negative
      fastestDistanceM: 650_000,
    })).not.toContain('capital-southeast-ring-north-east-south')
  })

  it('preserves the exact 60 second Hellisheiði duplicate threshold', () => {
    expect(HELLISHEIDI_DUPLICATE_TOLERANCE_S).toBe(60)
    expect(shouldSuppressDistinctHellisheidiCandidate({
      candidateDurationS: 940,
      fastestBaseDurationS: 1_000,
      baseAlreadyUsesCorridor: true,
    })).toBe(true)
    expect(shouldSuppressDistinctHellisheidiCandidate({
      candidateDurationS: 939,
      fastestBaseDurationS: 1_000,
      baseAlreadyUsesCorridor: true,
    })).toBe(false)
    expect(shouldSuppressDistinctHellisheidiCandidate({
      candidateDurationS: 1_200,
      fastestBaseDurationS: 1_000,
      baseAlreadyUsesCorridor: false,
    })).toBe(false)
  })
})

describe('v238 inclusion and presentation ordering', () => {
  it('keeps every mandatory route before the five-route cap and evicts generics first', () => {
    const record = (stableId: string, inclusion: TeskeidRouteInclusion, engineOrder: number) => ({
      value: stableId,
      stableId,
      inclusion,
      engineOrder,
    })
    const selected = selectTeskeidRouteRecordsBeforeCap({
      cap: 5,
      records: [
        record('primary', 'primary', 0),
        record('generic-1', 'generic', 1),
        record('generic-2', 'generic', 2),
        record('generic-3', 'generic', 3),
        record('generic-4', 'generic', 4),
        record('oxi-safe', 'safety', 5),
        record('ring', 'ring', 6),
      ],
    })
    expect(selected?.map(item => item.value)).toEqual([
      'primary', 'oxi-safe', 'ring', 'generic-1', 'generic-2',
    ])
  })

  it('fails truthfully when mandatory candidates exceed the cap', () => {
    expect(selectTeskeidRouteRecordsBeforeCap({
      cap: 5,
      records: Array.from({ length: 6 }, (_, index) => ({
        value: index,
        stableId: String(index),
        inclusion: index === 0 ? 'primary' as const : 'safety' as const,
        engineOrder: index,
      })),
    })).toBeNull()
  })

  it('uses only surface, F-road, caution, gravel, engine order and stable ID', () => {
    const options = [
      route('unknown', { unknownM: 1 }),
      route('f-road', { fRoadM: 1 }),
      route('caution', { cautions: 1 }),
      route('gravel', { gravelM: 1 }),
      route('clean'),
    ]
    const engineOrder = new Map(options.map((option, index) => [option.id, index]))
    expect([...options].sort((left, right) => compareTeskeidRouteOptions(
      left,
      right,
      engineOrder.get(left.id)!,
      engineOrder.get(right.id)!,
    )).map(option => option.id)).toEqual([
      'clean', 'gravel', 'caution', 'f-road', 'unknown',
    ])
  })
})
