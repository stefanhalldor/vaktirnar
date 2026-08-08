import { describe, expect, it } from 'vitest'
import {
  parseOfficialEndpointSectionReference,
  reconcileSourceAttestedJunctionGaps,
  type RoadTopologyPoint,
  type RoadTopologyReconciliationPolicy,
  type RoadTopologySourceSegment,
} from '@/lib/iceland-routes/roadGraphTopologyReconciliation'

const SHA256 = 'a'.repeat(64)

function point(lat: number, lon: number, zM?: number): RoadTopologyPoint {
  return { lat, lon, ...(zM === undefined ? {} : { zM }) }
}

function segment(
  overrides: Partial<RoadTopologySourceSegment> & Pick<RoadTopologySourceSegment, 'id' | 'geometry'>,
): RoadTopologySourceSegment {
  return {
    sourceFeatureId: `feature:${overrides.id}`,
    officialSection: {
      authority: 'official-road-authority',
      datasetId: 'public-roads',
      roadNumber: overrides.id.toUpperCase(),
      sectionNumber: '01',
    },
    networkRole: 'assessment',
    roadPart: 'centreline',
    direction: 'both',
    lifecycle: 'active',
    eligibleRoutingProfiles: ['motor_vehicle'],
    ...overrides,
  }
}

function policy(overrides: Partial<RoadTopologyReconciliationPolicy> = {}): RoadTopologyReconciliationPolicy {
  return {
    policyId: 'fixture-policy-v1',
    requiredRoutingProfile: 'motor_vehicle',
    eligibleTargetDatasetIds: ['public-roads'],
    eligibleTargetRoles: ['assessment'],
    eligibleTargetRoadParts: ['centreline'],
    compatibleNetworkRolePairs: [['assessment', 'access_connector']],
    compatibleRoadPartPairs: [['centreline', 'access']],
    maximumGapDistanceM: 120,
    projectionTieToleranceM: 0.05,
    endpointClearanceM: 1,
    maximumElevationDifferenceM: 3,
    minimumCrossingAngleDeg: 45,
    minimumGapForHeadingCheckM: 0.5,
    maximumGapApproachDifferenceDeg: 35,
    allowSourceAttestedExactInteriorVertex: false,
    allowSourceAttestedExactTargetEndpoint: false,
    allowSourceAttestedHubEndpointGap: false,
    useReliableElevationForEndpointJunctions: false,
    reciprocalReferenceTargetsEndpoint: false,
    maximumEndpointJunctionTurnDeg: 90,
    exactVertexToleranceM: 0.001,
    artifact: {
      artifactId: 'fixture-road-artifact',
      contentSha256: SHA256,
      validationReportId: 'fixture-validation-report',
      numericCeilingRationale: 'Synthetic fixture bounds cover the measured endpoint gap distribution.',
    },
    ...overrides,
  }
}

function endpointJunctionPolicy(
  overrides: Partial<RoadTopologyReconciliationPolicy> = {},
): RoadTopologyReconciliationPolicy {
  return policy({
    policyId: 'fixture-policy-v3',
    allowSourceAttestedExactInteriorVertex: true,
    allowSourceAttestedExactTargetEndpoint: true,
    allowSourceAttestedHubEndpointGap: false,
    useReliableElevationForEndpointJunctions: true,
    reciprocalReferenceTargetsEndpoint: true,
    maximumEndpointJunctionTurnDeg: 90,
    ...overrides,
  })
}

function hubEndpointPolicy(
  overrides: Partial<RoadTopologyReconciliationPolicy> = {},
): RoadTopologyReconciliationPolicy {
  return endpointJunctionPolicy({
    policyId: 'fixture-policy-v4',
    allowSourceAttestedHubEndpointGap: true,
    ...overrides,
  })
}

function reciprocalMidSegmentFixture(zM: number | null = 10): RoadTopologySourceSegment[] {
  const elevation = zM ?? undefined
  return [
    segment({
      id: 'a',
      officialSection: {
        authority: 'official-road-authority',
        datasetId: 'public-roads',
        roadNumber: 'A',
        sectionNumber: '01',
      },
      geometry: [point(63.9998, -21, elevation), point(64, -21, elevation)],
      endpointLabels: { end: 'Tengist vegkafla (B-02)' },
    }),
    segment({
      id: 'b',
      officialSection: {
        authority: 'official-road-authority',
        datasetId: 'public-roads',
        roadNumber: 'B',
        sectionNumber: '02',
      },
      geometry: [point(64, -21.01, elevation), point(64, -20.99, elevation)],
      endpointLabels: { start: 'Tengist vegkafla (A-01)' },
    }),
  ]
}

function oneSidedExactInteriorVertexFixture(
  sourceElevationM = 0,
  targetElevationM = 33,
): RoadTopologySourceSegment[] {
  return [
    segment({
      id: 'a',
      officialSection: {
        authority: 'official-road-authority',
        datasetId: 'public-roads',
        roadNumber: 'A',
        sectionNumber: '01',
      },
      geometry: [
        point(63.9998, -21, sourceElevationM),
        point(64, -21, sourceElevationM),
      ],
      endpointLabels: { end: 'Tengist vegkafla (B-02)' },
    }),
    segment({
      id: 'b',
      officialSection: {
        authority: 'official-road-authority',
        datasetId: 'public-roads',
        roadNumber: 'B',
        sectionNumber: '02',
      },
      geometry: [
        point(64, -21.01, targetElevationM),
        point(64, -21, targetElevationM),
        point(64, -20.99, targetElevationM),
      ],
    }),
  ]
}

function reciprocalEndpointGapFixture(input: {
  sourceElevationM?: number
  targetElevationM?: number
  targetStart?: RoadTopologyPoint
  sourceApproach?: 'east' | 'north'
} = {}): RoadTopologySourceSegment[] {
  const sourceEnd = point(64, -21.0005, input.sourceElevationM ?? 0)
  const sourceStart = input.sourceApproach === 'north'
    ? point(63.999, -21.0005, input.sourceElevationM ?? 0)
    : point(64, -21.0015, input.sourceElevationM ?? 0)
  const targetStart = input.targetStart ?? point(64, -21, input.targetElevationM ?? 30)
  const targetEnd = point(
    targetStart.lat,
    targetStart.lon + 0.001,
    input.targetElevationM ?? 30,
  )
  return [
    segment({
      id: 'a',
      officialSection: {
        authority: 'official-road-authority', datasetId: 'public-roads',
        roadNumber: 'A', sectionNumber: '01',
      },
      geometry: [sourceStart, sourceEnd],
      endpointLabels: { end: '(B-02)' },
    }),
    segment({
      id: 'b',
      officialSection: {
        authority: 'official-road-authority', datasetId: 'public-roads',
        roadNumber: 'B', sectionNumber: '02',
      },
      geometry: [targetStart, targetEnd],
      endpointLabels: { start: '(A-01)' },
    }),
  ]
}

function oneSidedExactEndpointFixture(): RoadTopologySourceSegment[] {
  const [source, target] = reciprocalEndpointGapFixture({
    sourceElevationM: 10,
    targetElevationM: 10,
    targetStart: point(64, -21.0005, 10),
  })
  return [source, { ...target, endpointLabels: undefined }]
}

function sourceAttestedHubGapFixture(): RoadTopologySourceSegment[] {
  const hub = point(64, -21, 10)
  return [
    segment({
      id: 'a',
      officialSection: {
        authority: 'official-road-authority', datasetId: 'public-roads',
        roadNumber: 'A', sectionNumber: '01',
      },
      geometry: [point(63.999, -21, 10), point(63.9997, -21, 10)],
      endpointLabels: { end: '(B-02)' },
    }),
    segment({
      id: 'b',
      officialSection: {
        authority: 'official-road-authority', datasetId: 'public-roads',
        roadNumber: 'B', sectionNumber: '02',
      },
      geometry: [hub, point(64, -20.999, 10)],
      endpointLabels: { start: '(C-03)' },
    }),
    segment({
      id: 'c',
      officialSection: {
        authority: 'official-road-authority', datasetId: 'public-roads',
        roadNumber: 'C', sectionNumber: '03',
      },
      geometry: [point(64.001, -21, 10), hub],
      endpointLabels: { end: '(B-02)' },
    }),
  ]
}

describe('strict official endpoint section references', () => {
  it('parses one embedded machine reference without treating the label as evidence', () => {
    expect(parseOfficialEndpointSectionReference('Við gatnamót (f208-03)')).toEqual({
      status: 'ok',
      reference: { roadNumber: 'F208', sectionNumber: '03' },
    })
  })

  it.each([
    ['human label only', { status: 'absent' }],
    ['Vegur F208 kafli 03', { status: 'absent' }],
    ['(F208-03) eða (F208-04)', { status: 'ambiguous' }],
    ['(F208-03-extra)', { status: 'absent' }],
  ])('fails closed for %s', (label, expected) => {
    expect(parseOfficialEndpointSectionReference(label)).toEqual(expected)
  })
})

describe('source-attested road topology reconciliation', () => {
  it('projects onto a long target segment interior and emits only an unassessed connector', () => {
    const result = reconcileSourceAttestedJunctionGaps(reciprocalMidSegmentFixture(), policy())

    expect(result.receipts).toHaveLength(1)
    expect(result.candidates).toEqual([
      expect.objectContaining({ status: 'accepted', sourceSegmentId: 'a', sourceEndpoint: 'end' }),
    ])
    const receipt = result.receipts[0]
    expect(receipt.targetAttestation).toEqual({ kind: 'reciprocal_endpoint', endpoint: 'start' })
    expect(receipt.targetSplit.location).toBe('interior')
    expect(receipt.targetSplit.edgeIndex).toBe(0)
    expect(receipt.targetSplit.edgeFraction).toBeCloseTo(0.5, 4)
    expect(receipt.targetSplit.geometryFraction).toBeCloseTo(0.5, 4)
    expect(receipt.targetSplit.geometryBefore).toHaveLength(2)
    expect(receipt.targetSplit.geometryAfter).toHaveLength(2)
    expect(receipt.connector).toMatchObject({
      kind: 'source_attested_junction_gap',
      networkRole: 'access_connector',
      assessmentEligible: false,
      truthClaims: { road: false, surface: false, weather: false, safety: false },
      allowedTraversal: ['source_to_target', 'target_to_source'],
    })
    expect(receipt.provenance.contentSha256).toBe(SHA256)
  })

  it('is deterministic across source feature ordering', () => {
    const forward = reciprocalMidSegmentFixture()
    const reverse = [...forward].reverse()
    expect(reconcileSourceAttestedJunctionGaps(forward, policy())).toEqual(
      reconcileSourceAttestedJunctionGaps(reverse, policy()),
    )
  })

  it('never joins nearby sections from a name or proximity alone', () => {
    const [source, target] = reciprocalMidSegmentFixture()
    const result = reconcileSourceAttestedJunctionGaps([
      { ...source, endpointLabels: { end: 'B vegur' } },
      target,
    ], policy())

    expect(result.receipts).toEqual([])
    expect(result.candidates).toContainEqual(
      expect.objectContaining({ rejectionReason: 'invalid_source_reference' }),
    )
  })

  it('rejects a one-sided official reference', () => {
    const [source, target] = reciprocalMidSegmentFixture()
    const result = reconcileSourceAttestedJunctionGaps([
      source,
      { ...target, endpointLabels: undefined },
    ], policy())

    expect(result.receipts).toEqual([])
    expect(result.candidates[0]).toMatchObject({ rejectionReason: 'nonreciprocal_reference' })
  })

  it('accepts a unique source-attested exact interior target vertex without reciprocal endpoint text', () => {
    const result = reconcileSourceAttestedJunctionGaps(
      oneSidedExactInteriorVertexFixture(),
      policy({ allowSourceAttestedExactInteriorVertex: true }),
    )

    expect(result.receipts).toHaveLength(1)
    expect(result.candidates).toEqual([
      expect.objectContaining({ status: 'accepted', sourceSegmentId: 'a', sourceEndpoint: 'end' }),
    ])
    expect(result.receipts[0]).toMatchObject({
      targetAttestation: { kind: 'source_exact_interior_vertex', vertexIndex: 1 },
      targetSplit: { location: 'vertex', edgeIndex: 0, edgeFraction: 1 },
      connector: {
        lengthM: 0,
        allowedTraversal: ['source_to_target', 'target_to_source'],
      },
    })
  })

  it('keeps one-sided exact vertices disabled under the reciprocal-only policy', () => {
    const result = reconcileSourceAttestedJunctionGaps(
      oneSidedExactInteriorVertexFixture(),
      policy({ allowSourceAttestedExactInteriorVertex: false }),
    )

    expect(result.receipts).toEqual([])
    expect(result.candidates[0]).toMatchObject({ rejectionReason: 'nonreciprocal_reference' })
  })

  it('accepts one unique source-attested exact target endpoint only under v3', () => {
    const fixture = oneSidedExactEndpointFixture()
    const retainedV2 = reconcileSourceAttestedJunctionGaps(fixture, policy({
      allowSourceAttestedExactInteriorVertex: true,
    }))
    expect(retainedV2.receipts).toEqual([])
    expect(retainedV2.candidates[0]).toMatchObject({
      rejectionReason: 'nonreciprocal_reference',
    })

    const current = reconcileSourceAttestedJunctionGaps(fixture, endpointJunctionPolicy())
    expect(current.receipts).toHaveLength(1)
    expect(current.receipts[0]).toMatchObject({
      targetAttestation: { kind: 'source_exact_endpoint', endpoint: 'start' },
      targetSplit: { location: 'start' },
      connector: { lengthM: 0 },
    })
  })

  it('rejects a one-sided exact endpoint when both target endpoints match', () => {
    const [source, target] = oneSidedExactEndpointFixture()
    const repeatedEndpoint = {
      ...target,
      geometry: [target.geometry[0], point(64.0002, -21, 10), target.geometry[0]],
    }
    const result = reconcileSourceAttestedJunctionGaps(
      [source, repeatedEndpoint],
      endpointJunctionPolicy(),
    )

    expect(result.receipts).toEqual([])
    expect(result.candidates[0]).toMatchObject({ rejectionReason: 'nonreciprocal_reference' })
  })

  it('keeps a non-zero source-attested hub gap rejected under immutable v3', () => {
    const result = reconcileSourceAttestedJunctionGaps(
      sourceAttestedHubGapFixture(),
      endpointJunctionPolicy(),
    )

    expect(result.candidates).toContainEqual(expect.objectContaining({
      sourceSegmentId: 'a',
      sourceEndpoint: 'end',
      rejectionReason: 'nonreciprocal_reference',
    }))
    expect(result.receipts.some(receipt => receipt.sourceSegmentId === 'a')).toBe(false)
  })

  it('accepts a source-attested hub gap in a deterministic second v4 phase', () => {
    const fixture = sourceAttestedHubGapFixture()
    const forward = reconcileSourceAttestedJunctionGaps(fixture, hubEndpointPolicy())
    const reversed = reconcileSourceAttestedJunctionGaps([...fixture].reverse(), hubEndpointPolicy())

    expect(reversed).toEqual(forward)
    expect(forward.candidates).toContainEqual(expect.objectContaining({
      sourceSegmentId: 'a', sourceEndpoint: 'end', status: 'accepted',
    }))
    const receipt = forward.receipts.find(value => value.sourceSegmentId === 'a')
    expect(receipt).toMatchObject({
      targetSegmentId: 'b',
      targetAttestation: {
        kind: 'source_attested_hub_endpoint',
        endpoint: 'start',
        hubReceiptIds: [expect.stringContaining('source-attested-gap:')],
      },
      connector: { assessmentEligible: false },
    })
    expect(receipt!.connector.lengthM).toBeGreaterThan(30)
    expect(receipt!.connector.lengthM).toBeLessThan(40)
  })

  it('rejects a v4 hub gap when the target endpoint has no independent receipt', () => {
    const [source, target] = sourceAttestedHubGapFixture()
    const result = reconcileSourceAttestedJunctionGaps(
      [source, { ...target, endpointLabels: undefined }],
      hubEndpointPolicy(),
    )

    expect(result.receipts).toEqual([])
    expect(result.candidates).toContainEqual(expect.objectContaining({
      sourceSegmentId: 'a', rejectionReason: 'target_hub_missing',
    }))
  })

  it('rejects a v4 hub gap when the named target endpoint is ambiguous', () => {
    const source = segment({
      id: 'a',
      officialSection: {
        authority: 'official-road-authority', datasetId: 'public-roads',
        roadNumber: 'A', sectionNumber: '01',
      },
      geometry: [point(63.999, -21, 10), point(64, -21, 10)],
      endpointLabels: { end: '(B-02)' },
    })
    const target = segment({
      id: 'b',
      officialSection: {
        authority: 'official-road-authority', datasetId: 'public-roads',
        roadNumber: 'B', sectionNumber: '02',
      },
      geometry: [point(64, -21.0005, 10), point(64, -20.9995, 10)],
    })
    const result = reconcileSourceAttestedJunctionGaps([source, target], hubEndpointPolicy())

    expect(result.receipts).toEqual([])
    expect(result.candidates[0]).toMatchObject({ rejectionReason: 'target_hub_ambiguous' })
  })

  it.each([
    ['source angle', (fixture: RoadTopologySourceSegment[]) => [
      { ...fixture[0], geometry: [point(63.9997, -21.001, 10), fixture[0].geometry[1]] },
      ...fixture.slice(1),
    ], 'gap_approach_misaligned'],
    ['target crossing', (fixture: RoadTopologySourceSegment[]) => [
      fixture[0],
      { ...fixture[1], geometry: [fixture[1].geometry[0], point(64.001, -21, 10)] },
      ...fixture.slice(2),
    ], 'gap_approach_misaligned'],
    ['elevation', (fixture: RoadTopologySourceSegment[]) => [
      { ...fixture[0], geometry: fixture[0].geometry.map(value => ({ ...value, zM: 25 })) },
      ...fixture.slice(1),
    ], 'elevation_contradiction'],
    ['third-party crossing', (fixture: RoadTopologySourceSegment[]) => [
      ...fixture,
      segment({
        id: 'd',
        geometry: [point(63.99985, -21.001, 10), point(63.99985, -20.999, 10)],
      }),
    ], 'third_party_crossing_ambiguous'],
  ] as const)('keeps the v4 %s safeguard fail-closed', (_name, mutate, rejectionReason) => {
    const result = reconcileSourceAttestedJunctionGaps(
      mutate(sourceAttestedHubGapFixture()),
      hubEndpointPolicy(),
    )

    expect(result.receipts.some(receipt => receipt.sourceSegmentId === 'a')).toBe(false)
    expect(result.candidates).toContainEqual(expect.objectContaining({
      sourceSegmentId: 'a', rejectionReason,
    }))
  })

  it('does not treat an exact point inside a target edge as an attested vertex', () => {
    const [source, target] = reciprocalMidSegmentFixture(10)
    const result = reconcileSourceAttestedJunctionGaps(
      [source, { ...target, endpointLabels: undefined }],
      policy({ allowSourceAttestedExactInteriorVertex: true }),
    )

    expect(result.receipts).toEqual([])
    expect(result.candidates[0]).toMatchObject({ rejectionReason: 'nonreciprocal_reference' })
  })

  it('does not widen the exact-vertex rule into a nearby one-sided gap repair', () => {
    const [source, target] = oneSidedExactInteriorVertexFixture()
    const offsetSource = {
      ...source,
      geometry: [source.geometry[0], { ...source.geometry[1], lat: source.geometry[1].lat + 0.0000001 }],
    }
    const result = reconcileSourceAttestedJunctionGaps(
      [offsetSource, target],
      policy({ allowSourceAttestedExactInteriorVertex: true }),
    )

    expect(result.receipts).toEqual([])
    expect(result.candidates[0]).toMatchObject({ rejectionReason: 'nonreciprocal_reference' })
  })

  it('rejects repeated matching target vertices as ambiguous topology evidence', () => {
    const [source, target] = oneSidedExactInteriorVertexFixture()
    const repeatedTarget = {
      ...target,
      geometry: [
        target.geometry[0],
        target.geometry[1],
        point(64.0001, -20.995, 33),
        target.geometry[1],
        target.geometry[2],
      ],
    }
    const result = reconcileSourceAttestedJunctionGaps(
      [source, repeatedTarget],
      policy({ allowSourceAttestedExactInteriorVertex: true }),
    )

    expect(result.receipts).toEqual([])
    expect(result.candidates[0]).toMatchObject({ rejectionReason: 'nonreciprocal_reference' })
  })

  it('preserves source one-way direction at an exact interior target vertex', () => {
    const [source, target] = oneSidedExactInteriorVertexFixture()
    const result = reconcileSourceAttestedJunctionGaps(
      [{ ...source, direction: 'forward' }, target],
      policy({ allowSourceAttestedExactInteriorVertex: true }),
    )

    expect(result.receipts[0].connector.allowedTraversal).toEqual(['source_to_target'])
  })

  it('still rejects reliable elevation contradictions at an exact named vertex', () => {
    const result = reconcileSourceAttestedJunctionGaps(
      oneSidedExactInteriorVertexFixture(10, 25),
      policy({ allowSourceAttestedExactInteriorVertex: true }),
    )

    expect(result.receipts).toEqual([])
    expect(result.candidates[0]).toMatchObject({ rejectionReason: 'elevation_contradiction' })
  })

  it('rejects a reciprocal reference that appears at both target endpoints', () => {
    const [source, target] = reciprocalMidSegmentFixture()
    const result = reconcileSourceAttestedJunctionGaps([
      source,
      { ...target, endpointLabels: { start: '(A-01)', end: '(A-01)' } },
    ], policy())

    expect(result.receipts).toEqual([])
    expect(result.candidates[0]).toMatchObject({ rejectionReason: 'reciprocal_reference_ambiguous' })
  })

  it('rejects non-unique eligible target sections instead of proximity tie-breaking', () => {
    const [source, target] = reciprocalMidSegmentFixture()
    const duplicate = {
      ...target,
      id: 'b-duplicate',
      sourceFeatureId: 'feature:b-duplicate',
      geometry: target.geometry.map(value => ({ ...value, lat: value.lat + 0.00001 })),
    }
    const result = reconcileSourceAttestedJunctionGaps([source, target, duplicate], policy())

    expect(result.receipts).toEqual([])
    expect(result.candidates[0]).toMatchObject({ rejectionReason: 'target_ambiguous' })
  })

  it.each([
    [
      'inactive lifecycle',
      (target: RoadTopologySourceSegment) => ({ ...target, lifecycle: 'inactive' as const }),
      'target_ineligible',
    ],
    [
      'ineligible profile',
      (target: RoadTopologySourceSegment) => ({ ...target, eligibleRoutingProfiles: ['foot'] }),
      'target_ineligible',
    ],
    [
      'incompatible network role',
      (target: RoadTopologySourceSegment) => ({ ...target, networkRole: 'access_connector' as const }),
      'target_ineligible',
    ],
    [
      'incompatible road part',
      (target: RoadTopologySourceSegment) => ({ ...target, roadPart: 'roundabout' }),
      'target_ineligible',
    ],
  ])('rejects an %s target before geometry joining', (_name, mutate, reason) => {
    const [source, target] = reciprocalMidSegmentFixture()
    const result = reconcileSourceAttestedJunctionGaps([source, mutate(target)], policy())
    expect(result.receipts).toEqual([])
    expect(result.candidates[0]).toMatchObject({ rejectionReason: reason })
  })

  it('rejects a target role that is eligible in isolation but incompatible with the source role', () => {
    const [source, target] = reciprocalMidSegmentFixture()
    const result = reconcileSourceAttestedJunctionGaps([
      source,
      { ...target, networkRole: 'access_connector' },
    ], policy({
      eligibleTargetRoles: ['assessment', 'access_connector'],
      compatibleNetworkRolePairs: [],
    }))

    expect(result.receipts).toEqual([])
    expect(result.candidates[0]).toMatchObject({ rejectionReason: 'incompatible_network_role' })
  })

  it('rejects a target road part without an explicit compatible pair', () => {
    const [source, target] = reciprocalMidSegmentFixture()
    const result = reconcileSourceAttestedJunctionGaps([
      source,
      { ...target, roadPart: 'roundabout' },
    ], policy({
      eligibleTargetRoadParts: ['centreline', 'roundabout'],
      compatibleRoadPartPairs: [],
    }))

    expect(result.receipts).toEqual([])
    expect(result.candidates[0]).toMatchObject({ rejectionReason: 'incompatible_road_part' })
  })

  it('rejects incompatible one-way endpoints', () => {
    const [source, target] = reciprocalMidSegmentFixture()
    const result = reconcileSourceAttestedJunctionGaps([
      { ...source, direction: 'forward' },
      { ...target, direction: 'forward', endpointLabels: { end: '(A-01)' } },
    ], policy())

    expect(result.receipts).toEqual([])
    expect(result.candidates[0]).toMatchObject({ rejectionReason: 'incompatible_direction' })
  })

  it('preserves a valid one-way traversal instead of making the gap bidirectional', () => {
    const [source, target] = reciprocalMidSegmentFixture()
    const result = reconcileSourceAttestedJunctionGaps([
      { ...source, direction: 'forward' },
      { ...target, direction: 'forward' },
    ], policy())

    expect(result.receipts[0].connector.allowedTraversal).toEqual(['source_to_target'])
  })

  it('rejects a gap beyond the artifact-justified ceiling', () => {
    const [source, target] = reciprocalMidSegmentFixture()
    const farSource = {
      ...source,
      geometry: [point(63.998, -21, 10), point(63.999, -21, 10)],
    }
    const result = reconcileSourceAttestedJunctionGaps([farSource, target], policy({ maximumGapDistanceM: 50 }))

    expect(result.receipts).toEqual([])
    expect(result.candidates[0]).toMatchObject({ rejectionReason: 'gap_too_far' })
  })

  it('rejects two distinct, equally close projections on a folded target geometry', () => {
    const [source, target] = reciprocalMidSegmentFixture(10)
    const foldedTarget = {
      ...target,
      geometry: [
        point(64, -21.001, 10),
        point(64, -20.999, 10),
        point(64.0002, -20.999, 10),
        point(64.0002, -21.001, 10),
      ],
    }
    const sourceBetween = {
      ...source,
      geometry: [point(63.9999, -21, 10), point(64.0001, -21, 10)],
    }
    const result = reconcileSourceAttestedJunctionGaps(
      [sourceBetween, foldedTarget],
      policy({ projectionTieToleranceM: 0.2 }),
    )

    expect(result.receipts).toEqual([])
    expect(result.candidates[0]).toMatchObject({ rejectionReason: 'projection_ambiguous' })
  })

  it('rejects a side-snap to a close parallel road even with reciprocal text', () => {
    const [source, target] = reciprocalMidSegmentFixture(10)
    const parallelSource = {
      ...source,
      geometry: [point(64.0001, -21.001, 10), point(64.0001, -21, 10)],
    }
    const result = reconcileSourceAttestedJunctionGaps([parallelSource, target], policy())

    expect(result.receipts).toEqual([])
    expect(result.candidates[0]).toMatchObject({ rejectionReason: 'gap_approach_misaligned' })
  })

  it('treats an all-zero endpoint Z series as missing only under v3', () => {
    const fixture = reciprocalEndpointGapFixture()
    const retainedV2 = reconcileSourceAttestedJunctionGaps(fixture, policy())
    expect(retainedV2.receipts).toEqual([])
    expect(retainedV2.candidates[0]).toMatchObject({
      rejectionReason: 'elevation_contradiction',
    })

    const current = reconcileSourceAttestedJunctionGaps(fixture, endpointJunctionPolicy())
    expect(current.receipts).toHaveLength(1)
    expect(current.receipts[0].targetAttestation).toEqual({
      kind: 'reciprocal_endpoint', endpoint: 'start',
    })
  })

  it('allows an attested endpoint gap inside both forward half-planes under v3', () => {
    const fixture = reciprocalEndpointGapFixture({
      sourceElevationM: 10,
      targetElevationM: 10,
      sourceApproach: 'north',
      targetStart: point(64.00013, -21, 10),
    })
    const retainedV2 = reconcileSourceAttestedJunctionGaps(fixture, policy())
    expect(retainedV2.candidates).toContainEqual(expect.objectContaining({
      sourceSegmentId: 'a',
      sourceEndpoint: 'end',
      rejectionReason: 'gap_approach_misaligned',
    }))

    const current = reconcileSourceAttestedJunctionGaps(fixture, endpointJunctionPolicy())
    expect(current.receipts).toHaveLength(1)
  })

  it('still rejects an attested endpoint gap that points behind either road end', () => {
    const fixture = reciprocalEndpointGapFixture({
      sourceElevationM: 10,
      targetElevationM: 10,
      sourceApproach: 'north',
      targetStart: point(63.99987, -21, 10),
    })
    const result = reconcileSourceAttestedJunctionGaps(fixture, endpointJunctionPolicy())

    expect(result.receipts).toEqual([])
    expect(result.candidates[0]).toMatchObject({
      rejectionReason: 'gap_approach_misaligned',
    })
  })

  it('rejects an elevation contradiction at an interior crossing', () => {
    const [source, target] = reciprocalMidSegmentFixture(10)
    const elevatedTarget = {
      ...target,
      geometry: target.geometry.map(value => ({ ...value, zM: 25 })),
    }
    const result = reconcileSourceAttestedJunctionGaps([source, elevatedTarget], policy())

    expect(result.receipts).toEqual([])
    expect(result.candidates[0]).toMatchObject({ rejectionReason: 'elevation_contradiction' })
  })

  it('rejects an interior crossing when elevation/grade evidence is absent', () => {
    const result = reconcileSourceAttestedJunctionGaps(reciprocalMidSegmentFixture(null), policy())

    expect(result.receipts).toEqual([])
    expect(result.candidates[0]).toMatchObject({ rejectionReason: 'grade_ambiguous' })
  })

  it('rejects a connector crossing an unrelated third road at the same grade', () => {
    const source = segment({
      id: 'a',
      officialSection: {
        authority: 'official-road-authority', datasetId: 'public-roads', roadNumber: 'A', sectionNumber: '01',
      },
      geometry: [point(64, -21.003, 10), point(64, -21.002, 10)],
      endpointLabels: { end: '(B-02)' },
    })
    const target = segment({
      id: 'b',
      officialSection: {
        authority: 'official-road-authority', datasetId: 'public-roads', roadNumber: 'B', sectionNumber: '02',
      },
      geometry: [point(64, -21, 10), point(64, -20.999, 10)],
      endpointLabels: { start: '(A-01)' },
    })
    const crossing = segment({
      id: 'c',
      geometry: [point(63.9998, -21.001, 10), point(64.0002, -21.001, 10)],
    })
    const result = reconcileSourceAttestedJunctionGaps([source, target, crossing], policy())

    expect(result.receipts).toEqual([])
    expect(result.candidates[0]).toMatchObject({ rejectionReason: 'third_party_crossing_ambiguous' })

    const current = reconcileSourceAttestedJunctionGaps(
      [source, target, crossing],
      endpointJunctionPolicy(),
    )
    expect(current.receipts).toEqual([])
    expect(current.candidates[0]).toMatchObject({
      rejectionReason: 'third_party_crossing_ambiguous',
    })
  })

  it('requires a concrete artifact hash and rationale for every numeric ceiling', () => {
    expect(() => reconcileSourceAttestedJunctionGaps([], policy({
      artifact: {
        artifactId: 'fixture-road-artifact',
        contentSha256: 'not-a-sha256',
        validationReportId: 'fixture-validation-report',
        numericCeilingRationale: '',
      },
    }))).toThrow('invalid_road_topology_reconciliation_policy')
    expect(() => reconcileSourceAttestedJunctionGaps([], policy({
      allowSourceAttestedExactInteriorVertex: true,
      exactVertexToleranceM: 0.011,
    }))).toThrow('invalid_road_topology_reconciliation_policy')
  })
})
