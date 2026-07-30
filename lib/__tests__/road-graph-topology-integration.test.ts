import { describe, expect, it } from 'vitest'
import {
  buildIcelandRoadGraph,
  findIcelandRoadGraphRoute,
  type IcelandRoadGraphTopologyReceiptBinding,
} from '@/lib/iceland-routes/roadGraph'
import {
  reconcileSourceAttestedJunctionGaps,
  type RoadTopologyReconciliationPolicy,
  type RoadTopologySourceSegment,
} from '@/lib/iceland-routes/roadGraphTopologyReconciliation'
import type { IcelandRoadGraphSegmentInput } from '@/lib/iceland-routes/roadGraphTypes'
import { createIcelandRoadDirectionInferenceAttestation } from '@/lib/iceland-routes/roadGraphDirectionInference'

const topologyPolicy: RoadTopologyReconciliationPolicy = {
  policyId: 'graph-integration-v1',
  requiredRoutingProfile: 'motor_vehicle',
  eligibleTargetDatasetIds: ['public'],
  eligibleTargetRoles: ['assessment'],
  eligibleTargetRoadParts: ['centreline'],
  compatibleNetworkRolePairs: [],
  compatibleRoadPartPairs: [],
  maximumGapDistanceM: 20,
  projectionTieToleranceM: 0.05,
  endpointClearanceM: 1,
  maximumElevationDifferenceM: 2,
  minimumCrossingAngleDeg: 45,
  minimumGapForHeadingCheckM: 0.5,
  maximumGapApproachDifferenceDeg: 20,
  allowSourceAttestedExactInteriorVertex: false,
  exactVertexToleranceM: 0.001,
  artifact: {
    artifactId: 'graph-integration-artifact',
    contentSha256: 'b'.repeat(64),
    validationReportId: 'graph-integration-report',
    numericCeilingRationale: 'The synthetic source gap is measured below twenty metres.',
  },
}

function topologySegments(direction: 'both' | 'forward' = 'both'): RoadTopologySourceSegment[] {
  return [
    {
      id: 'source-a',
      sourceFeatureId: 'feature-a',
      officialSection: {
        authority: 'official', datasetId: 'public', roadNumber: 'A', sectionNumber: '01',
      },
      geometry: [
        { lat: 63.9998, lon: -21, zM: 10 },
        { lat: 64, lon: -21, zM: 10 },
      ],
      endpointLabels: { end: '(B-02)' },
      networkRole: 'assessment',
      roadPart: 'centreline',
      direction,
      lifecycle: 'active',
      eligibleRoutingProfiles: ['motor_vehicle'],
    },
    {
      id: 'target-b',
      sourceFeatureId: 'feature-b',
      officialSection: {
        authority: 'official', datasetId: 'public', roadNumber: 'B', sectionNumber: '02',
      },
      geometry: [
        { lat: 64.00005, lon: -21.01, zM: 10 },
        { lat: 64.00005, lon: -20.99, zM: 10 },
      ],
      endpointLabels: { start: '(A-01)' },
      networkRole: 'assessment',
      roadPart: 'centreline',
      direction,
      lifecycle: 'active',
      eligibleRoutingProfiles: ['motor_vehicle'],
    },
  ]
}

function graphInputs(
  direction: 'both' | 'forward' = 'both',
  sourceRole: 'assessment_public' | 'access_connector' = 'assessment_public',
): IcelandRoadGraphSegmentInput[] {
  return [
    {
      id: 'source-a', source: 'teskeid_fixture', sourceId: 'feature-a',
      geometry: [
        { lat: 63.9998, lon: -21, elevationM: 10 },
        { lat: 64, lon: -21, elevationM: 10 },
      ],
      roadClass: 'local', surface: 'paved', direction, networkRole: sourceRole,
    },
    {
      id: 'target-b', source: 'teskeid_fixture', sourceId: 'feature-b',
      geometry: [
        { lat: 64.00005, lon: -21.01, elevationM: 10 },
        { lat: 64.00005, lon: -20.99, elevationM: 10 },
      ],
      roadClass: 'trunk', surface: 'paved', direction, networkRole: 'assessment_public',
    },
  ]
}

function receiptBinding(direction: 'both' | 'forward' = 'both'): IcelandRoadGraphTopologyReceiptBinding {
  const result = reconcileSourceAttestedJunctionGaps(topologySegments(direction), topologyPolicy)
  expect(result.receipts).toHaveLength(1)
  return {
    receipt: result.receipts[0],
    sourceGraph: { segmentId: 'source-a', sourceId: 'feature-a', endpoint: 'end' },
    targetGraph: { segmentId: 'target-b', sourceId: 'feature-b', edgeIndex: 0, edgeFraction: 0.5 },
  }
}

function exactVertexTopologySegments(): RoadTopologySourceSegment[] {
  return [
    {
      ...topologySegments()[0],
      geometry: [
        { lat: 63.9998, lon: -21, zM: 0 },
        { lat: 64, lon: -21, zM: 0 },
      ],
    },
    {
      ...topologySegments()[1],
      geometry: [
        { lat: 64, lon: -21.01, zM: 33 },
        { lat: 64, lon: -21, zM: 33 },
        { lat: 64, lon: -20.99, zM: 33 },
      ],
      endpointLabels: undefined,
    },
  ]
}

function exactVertexGraphInputs(): IcelandRoadGraphSegmentInput[] {
  return [
    {
      ...graphInputs()[0],
      geometry: [
        { lat: 63.9998, lon: -21, elevationM: 0 },
        { lat: 64, lon: -21, elevationM: 0 },
      ],
    },
    {
      ...graphInputs()[1],
      geometry: [
        { lat: 64, lon: -21.01, elevationM: 33 },
        { lat: 64, lon: -21, elevationM: 33 },
        { lat: 64, lon: -20.99, elevationM: 33 },
      ],
    },
  ]
}

function exactVertexReceiptBinding(): IcelandRoadGraphTopologyReceiptBinding {
  const result = reconcileSourceAttestedJunctionGaps(exactVertexTopologySegments(), {
    ...topologyPolicy,
    policyId: 'graph-integration-exact-vertex-v2',
    allowSourceAttestedExactInteriorVertex: true,
  })
  expect(result.receipts).toHaveLength(1)
  return {
    receipt: result.receipts[0],
    sourceGraph: { segmentId: 'source-a', sourceId: 'feature-a', endpoint: 'end' },
    targetGraph: { segmentId: 'target-b', sourceId: 'feature-b', edgeIndex: 0, edgeFraction: 1 },
  }
}

const origin = { lat: 63.9998, lon: -21 }
const destination = { lat: 64.00005, lon: -20.99 }

describe('road graph topology receipt integration', () => {
  it('splits a target mid-segment and keeps connector distance out of assessment truth', () => {
    const withoutReceipt = buildIcelandRoadGraph(graphInputs(), { nodeSnapToleranceM: 1 })
    expect(findIcelandRoadGraphRoute(withoutReceipt, origin, destination, {
      profile: { objective: 'shortest' }, maxSnapDistanceM: 2,
    }).status).toBe('no_route')

    const binding = receiptBinding()
    const graph = buildIcelandRoadGraph(graphInputs(), {
      nodeSnapToleranceM: 1,
      topologyReconciliation: { bindings: [binding], invalidBindingBehavior: 'throw' },
    })
    const topologyEdges = graph.edges.filter(edge => edge.graphRole === 'topology_connector')
    expect(topologyEdges).toHaveLength(2)
    expect(topologyEdges[0]).toMatchObject({
      assessmentEligible: false,
      topologyDirectionAttested: true,
      topologyReceiptId: binding.receipt.id,
    })
    expect(topologyEdges[0]).not.toHaveProperty('sourceNetworkRole')
    expect(topologyEdges[0]).not.toHaveProperty('networkRole')
    expect(topologyEdges[0].topologyProvenanceKey).toContain('graph-integration-artifact')
    expect(graph.edges.filter(edge => edge.segmentId === 'target-b')).toHaveLength(4)

    const result = findIcelandRoadGraphRoute(graph, origin, destination, {
      profile: { objective: 'shortest', requirePaved: true }, maxSnapDistanceM: 2,
    })
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.route.segmentIds).toEqual(['source-a', 'target-b'])
    expect(result.route.topologyConnectorIds).toEqual([binding.receipt.id])
    expect(result.route.unassessedConnectorDistanceM).toBeGreaterThan(0)
    expect(result.route.distanceM).toBe(
      result.route.assessedDistanceM + result.route.unassessedConnectorDistanceM,
    )
    expect(result.route.surface.unknownM).toBe(0)
    expect(Math.abs(
      result.route.derivedSpeedDistanceM - result.route.assessedDistanceM,
    )).toBeLessThanOrEqual(1)
  })

  it('splits an exact named target vertex without inventing a non-zero road gap', () => {
    const inputs = exactVertexGraphInputs()
    const exactDestination = { lat: 64, lon: -20.99 }
    const withoutReceipt = buildIcelandRoadGraph(inputs, { nodeSnapToleranceM: 1 })
    expect(findIcelandRoadGraphRoute(withoutReceipt, origin, exactDestination, {
      profile: { objective: 'shortest' }, maxSnapDistanceM: 2,
    }).status).toBe('no_route')

    const binding = exactVertexReceiptBinding()
    expect(binding.receipt.targetAttestation).toEqual({
      kind: 'source_exact_interior_vertex',
      vertexIndex: 1,
    })
    const graph = buildIcelandRoadGraph(inputs, {
      nodeSnapToleranceM: 1,
      topologyReconciliation: { bindings: [binding], invalidBindingBehavior: 'throw' },
    })
    const topologyEdges = graph.edges.filter(edge => edge.graphRole === 'topology_connector')
    expect(topologyEdges).toHaveLength(2)
    expect(topologyEdges.every(edge => edge.lengthM === 0 && edge.assessmentEligible === false)).toBe(true)
    expect(graph.topologyReceiptIds).toEqual([binding.receipt.id])
    expect(graph.edges.filter(edge => edge.segmentId === 'target-b')).toHaveLength(4)

    for (const [from, to] of [[origin, exactDestination], [exactDestination, origin]] as const) {
      const result = findIcelandRoadGraphRoute(graph, from, to, {
        profile: { objective: 'shortest' }, maxSnapDistanceM: 2,
      })
      expect(result.status).toBe('ok')
      if (result.status !== 'ok') continue
      expect(result.route.segmentIds).toEqual(from === origin
        ? ['source-a', 'target-b']
        : ['target-b', 'source-a'])
      expect(result.route.topologyConnectorIds).toEqual([binding.receipt.id])
      expect(result.route.unassessedConnectorDistanceM).toBe(0)
    }
  })

  it('fails closed when an exact-vertex receipt is rebound as an edge-interior split', () => {
    const binding = exactVertexReceiptBinding()
    expect(() => buildIcelandRoadGraph(exactVertexGraphInputs(), {
      topologyReconciliation: {
        bindings: [{
          ...binding,
          receipt: {
            ...binding.receipt,
            targetSplit: { ...binding.receipt.targetSplit, location: 'interior' },
          },
        }],
        invalidBindingBehavior: 'throw',
      },
    })).toThrow('invalid_road_graph_topology_binding:exact_vertex_attestation')
  })

  it('fails closed when a receipt is rebound to the other source endpoint', () => {
    const binding = exactVertexReceiptBinding()
    expect(() => buildIcelandRoadGraph(exactVertexGraphInputs(), {
      topologyReconciliation: {
        bindings: [{
          ...binding,
          sourceGraph: { ...binding.sourceGraph, endpoint: 'start' },
        }],
        invalidBindingBehavior: 'throw',
      },
    })).toThrow('invalid_road_graph_topology_binding:source_identity_mismatch')
  })

  it('fails closed when a one-way receipt broadens its attested traversal', () => {
    const binding = receiptBinding('forward')
    expect(() => buildIcelandRoadGraph(graphInputs('forward'), {
      topologyReconciliation: {
        bindings: [{
          ...binding,
          receipt: {
            ...binding.receipt,
            connector: {
              ...binding.receipt.connector,
              allowedTraversal: ['source_to_target', 'target_to_source'],
            },
          },
        }],
        invalidBindingBehavior: 'throw',
      },
    })).toThrow('invalid_road_graph_topology_binding:direction_attestation')
  })

  it('validates topology traversal against the same accepted direction inference used by edges', () => {
    const sourceProvenanceKey = `assessment_public_roads=${'a'.repeat(64)}|road_surfaces=${'b'.repeat(64)}`
    const policy = {
      schemaVersion: 1 as const,
      policyId: 'topology-direction-policy',
      policyVersion: '1.0.0',
      generatorId: 'topology-direction-generator',
      generatorVersion: '1.0.0',
      minimumConfidenceBps: 9_000,
    }
    const attestation = createIcelandRoadDirectionInferenceAttestation({
      schemaVersion: 1,
      kind: 'inferred_both',
      segmentSourceId: 'feature-a',
      sourceProvenanceKey,
      policyId: policy.policyId,
      policyVersion: policy.policyVersion,
      generatorId: policy.generatorId,
      generatorVersion: policy.generatorVersion,
      evidenceArtifactId: 'topology-direction-evidence',
      evidenceContentSha256: 'c'.repeat(64),
      confidenceBps: 9_500,
      validFromIso: '2026-07-01T00:00:00.000Z',
      expiresAtIso: '2026-08-01T00:00:00.000Z',
    })
    const inputs = exactVertexGraphInputs()
    inputs[0] = {
      ...inputs[0],
      direction: 'unknown',
      directionStatus: 'unknown_missing',
      official: {
        provider: 'vegagerdin',
        sourceLayerId: 6,
        sourceObjectId: 1,
        sectionId: 10,
        roadPartCode: 1,
        roadPartNumber: '1',
        ownerCode: 0,
        roadClassCode: 1,
        directionCode: null,
        directionFieldState: 'null',
        inUseFromEpochMs: 0,
        outOfUseAtEpochMs: Date.parse('9999-12-31T00:00:00.000Z'),
      },
    }
    const graph = buildIcelandRoadGraph(inputs, {
      topologyReconciliation: {
        bindings: [exactVertexReceiptBinding()],
        invalidBindingBehavior: 'throw',
      },
      directionInference: {
        attestations: [attestation],
        evidenceArtifacts: [{
          schemaVersion: 1,
          artifactId: 'topology-direction-evidence',
          datasetId: 'topology-direction-dataset',
          datasetVersion: '2026-07',
          sourceUrl: 'https://example.test/topology-direction-evidence.json',
          effectiveAtIso: '2026-07-01T00:00:00.000Z',
          contentSha256: 'c'.repeat(64),
          policyId: policy.policyId,
          policyVersion: policy.policyVersion,
          generatorId: policy.generatorId,
          generatorVersion: policy.generatorVersion,
          licenseReviewId: 'topology-direction-license-review',
        }],
        sourceProvenanceKey,
        evaluatedAtIso: '2026-07-02T00:00:00.000Z',
        policy,
      },
    })
    expect(graph.edges.filter(edge => edge.graphRole === 'topology_connector')).toHaveLength(2)
    expect(graph.edges.filter(edge => edge.segmentId === 'source-a')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ directionBasis: 'inferred' }),
      ]),
    )
  })

  it('emits only the receipt-attested traversal direction', () => {
    const binding = receiptBinding('forward')
    expect(binding.receipt.connector.allowedTraversal).toEqual(['source_to_target'])
    const graph = buildIcelandRoadGraph(graphInputs('forward'), {
      nodeSnapToleranceM: 1,
      topologyReconciliation: { bindings: [binding], invalidBindingBehavior: 'throw' },
    })
    expect(graph.edges.filter(edge => edge.graphRole === 'topology_connector')).toHaveLength(1)
    expect(findIcelandRoadGraphRoute(graph, origin, destination, {
      profile: { objective: 'shortest' }, maxSnapDistanceM: 2,
    }).status).toBe('ok')
    expect(findIcelandRoadGraphRoute(graph, destination, origin, {
      profile: { objective: 'shortest' }, maxSnapDistanceM: 2,
    }).status).toBe('no_route')
  })

  it('does not turn an access-only source child into an internal shortcut', () => {
    const graph = buildIcelandRoadGraph(graphInputs('both', 'access_connector'), {
      nodeSnapToleranceM: 1,
      topologyReconciliation: {
        bindings: [receiptBinding()],
        invalidBindingBehavior: 'ignore',
      },
    })
    expect(graph.edges.some(edge => edge.graphRole === 'topology_connector')).toBe(false)
    expect(findIcelandRoadGraphRoute(graph, origin, destination, {
      profile: { objective: 'shortest' }, maxSnapDistanceM: 2,
    }).status).toBe('no_route')
  })

  it('fails instead of guessing a surface-child segment mapping', () => {
    const binding = receiptBinding()
    expect(() => buildIcelandRoadGraph(graphInputs(), {
      topologyReconciliation: {
        bindings: [{
          ...binding,
          targetGraph: { ...binding.targetGraph, segmentId: 'unmapped-surface-child' },
        }],
        invalidBindingBehavior: 'throw',
      },
    })).toThrow('invalid_road_graph_topology_binding:target_segment_missing')
  })
})
