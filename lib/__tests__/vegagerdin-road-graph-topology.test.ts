import { describe, expect, it } from 'vitest'
import type { IcelandRoadGraphSegmentInput } from '@/lib/iceland-routes/roadGraphTypes'
import {
  reconcileVegagerdinRoadGraphTopology,
  VEGAGERDIN_TOPOLOGY_RECONCILIATION_POLICY_ID_V1,
  VEGAGERDIN_TOPOLOGY_RECONCILIATION_POLICY_ID_V2,
} from '@/lib/iceland-routes/vegagerdinRoadGraphTopology'

const ARTIFACT = {
  artifactId: 'synthetic-vegagerdin-layer-6',
  contentSha256: 'c'.repeat(64),
  validationReportId: 'synthetic-exact-vertex-regression',
}

function officialSegment(input: {
  sourceId: string
  sourceObjectId: number
  sectionId: number
  roadNumber: string
  sectionNumber: string
  geometry: IcelandRoadGraphSegmentInput['geometry']
  sectionStartLabel?: string
  sectionEndLabel?: string
}): IcelandRoadGraphSegmentInput {
  return {
    id: `${input.sourceId}:geometry-0`,
    source: 'vegagerdin',
    sourceId: input.sourceId,
    geometry: input.geometry,
    roadNumber: input.roadNumber,
    roadClass: 'local',
    surface: 'paved',
    direction: 'both',
    directionStatus: 'authoritative_both',
    networkRole: 'assessment_public',
    official: {
      provider: 'vegagerdin',
      sourceLayerId: 6,
      sourceObjectId: input.sourceObjectId,
      sectionId: input.sectionId,
      sectionNumber: input.sectionNumber,
      sectionStartLabel: input.sectionStartLabel,
      sectionEndLabel: input.sectionEndLabel,
      roadPartCode: 1,
      roadPartNumber: '1',
      ownerCode: 0,
      roadClassCode: 1,
      directionCode: 2,
      directionFieldState: 'integer',
      inUseFromEpochMs: 0,
      outOfUseAtEpochMs: Date.parse('9999-12-31T00:00:00.000Z'),
    },
  }
}

function exactVertexSegments(): IcelandRoadGraphSegmentInput[] {
  return [
    officialSegment({
      sourceId: 'vegagerdin:layer-6:section-271',
      sourceObjectId: 271,
      sectionId: 58_496,
      roadNumber: '271',
      sectionNumber: '01',
      sectionStartLabel: 'Hringvegur (1-c5)',
      geometry: [
        { lat: 64.001, lon: -21, elevationM: 0 },
        { lat: 64, lon: -21, elevationM: 0 },
      ],
    }),
    officialSegment({
      sourceId: 'vegagerdin:layer-6:section-1-c5',
      sourceObjectId: 1,
      sectionId: 48_906,
      roadNumber: '1',
      sectionNumber: 'c5',
      geometry: [
        { lat: 64.001, lon: -21.01, elevationM: 33 },
        { lat: 64.001, lon: -21, elevationM: 33 },
        { lat: 64.001, lon: -20.99, elevationM: 33 },
      ],
    }),
  ]
}

describe('Vegagerðin road-graph topology policy adapter', () => {
  it('uses strict exact-interior-vertex v2 by default while retaining reciprocal-v1 rollback', () => {
    const current = reconcileVegagerdinRoadGraphTopology({
      segments: exactVertexSegments(),
      nodeSnapToleranceM: 20,
      artifact: ARTIFACT,
    })
    expect(current.policyId).toBe(VEGAGERDIN_TOPOLOGY_RECONCILIATION_POLICY_ID_V2)
    expect(current.receipts).toHaveLength(1)
    expect(current.bindings).toHaveLength(1)
    expect(current.receipts[0]).toMatchObject({
      sourceSection: { roadNumber: '271', sectionNumber: '01' },
      targetSection: { roadNumber: '1', sectionNumber: 'C5' },
      targetAttestation: { kind: 'source_exact_interior_vertex', vertexIndex: 1 },
      targetSplit: { location: 'vertex', edgeIndex: 0, edgeFraction: 1 },
      connector: { lengthM: 0, assessmentEligible: false },
    })

    const rollback = reconcileVegagerdinRoadGraphTopology({
      segments: exactVertexSegments(),
      nodeSnapToleranceM: 20,
      policyId: VEGAGERDIN_TOPOLOGY_RECONCILIATION_POLICY_ID_V1,
      artifact: ARTIFACT,
    })
    expect(rollback.policyId).toBe(VEGAGERDIN_TOPOLOGY_RECONCILIATION_POLICY_ID_V1)
    expect(rollback.receipts).toEqual([])
    expect(rollback.bindings).toEqual([])
    expect(rollback.candidates).toContainEqual(expect.objectContaining({
      sourceSegmentId: 'vegagerdin:layer-6:section-271',
      rejectionReason: 'nonreciprocal_reference',
    }))
  })
})
