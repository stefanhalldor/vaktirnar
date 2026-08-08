import { describe, expect, it } from 'vitest'
import {
  buildIcelandRoadGraph,
  findIcelandRoadGraphRoute,
  haversineDistanceM,
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
  allowSourceAttestedExactTargetEndpoint: false,
  allowSourceAttestedHubEndpointGap: false,
  useReliableElevationForEndpointJunctions: false,
  reciprocalReferenceTargetsEndpoint: false,
  maximumEndpointJunctionTurnDeg: 90,
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
    targetGraph: {
      segmentId: 'target-b', sourceId: 'feature-b', topologyEdgeIndex: 0,
      edgeIndex: 0, edgeFraction: 0.5,
    },
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
    targetGraph: {
      segmentId: 'target-b', sourceId: 'feature-b', topologyEdgeIndex: 0,
      edgeIndex: 0, edgeFraction: 1,
    },
  }
}

function topologyReconciliationOptions(
  binding: IcelandRoadGraphTopologyReceiptBinding,
  receiptLedger: readonly IcelandRoadGraphTopologyReceiptBinding['receipt'][] = [binding.receipt],
  inputs: readonly IcelandRoadGraphSegmentInput[] = graphInputs(),
) {
  const sections = new Map<string, {
    sourceFeatureId: string
    officialSection: IcelandRoadGraphTopologyReceiptBinding['receipt']['sourceSection']
  }>()
  for (const receipt of receiptLedger) {
    sections.set(receipt.sourceSegmentId, {
      sourceFeatureId: receipt.sourceFeatureId,
      officialSection: receipt.sourceSection,
    })
    sections.set(receipt.targetSegmentId, {
      sourceFeatureId: receipt.targetFeatureId,
      officialSection: receipt.targetSection,
    })
  }
  return {
    bindings: [binding],
    sectionLedger: [...sections.entries()].map(([topologySegmentId, section]) => ({
      topologySegmentId,
      sourceFeatureId: section.sourceFeatureId,
      officialSection: section.officialSection,
      graphEdges: inputs
        .filter(input => input.sourceId === section.sourceFeatureId
          && (input.id === topologySegmentId || input.sourceId === topologySegmentId))
        .flatMap(input => input.geometry.slice(0, -1).map((_, edgeIndex) => ({
          segmentId: input.id,
          sourceId: input.sourceId,
          edgeIndex,
        }))),
    })),
    receiptLedger,
    policyId: binding.receipt.policyId,
    provenance: binding.receipt.provenance,
    invalidBindingBehavior: 'throw' as const,
  }
}

const hubPolicy: RoadTopologyReconciliationPolicy = {
  ...topologyPolicy,
  policyId: 'graph-integration-v4',
  maximumGapDistanceM: 50,
  maximumGapApproachDifferenceDeg: 35,
  allowSourceAttestedExactTargetEndpoint: true,
  allowSourceAttestedHubEndpointGap: true,
  useReliableElevationForEndpointJunctions: true,
  reciprocalReferenceTargetsEndpoint: true,
}

function hubTopologySegments(): RoadTopologySourceSegment[] {
  const hub = { lat: 64, lon: -21, zM: 10 }
  return [
    {
      ...topologySegments()[0],
      id: 'hub-source-a', sourceFeatureId: 'hub-feature-a',
      officialSection: {
        authority: 'official', datasetId: 'public', roadNumber: 'A', sectionNumber: '01',
      },
      geometry: [
        { lat: 63.999, lon: -21, zM: 10 },
        { lat: 63.99935, lon: -21, zM: 10 },
        { lat: 63.9997, lon: -21, zM: 10 },
      ],
      endpointLabels: { end: '(B-02)' },
    },
    {
      ...topologySegments()[1],
      id: 'hub-target-b', sourceFeatureId: 'hub-feature-b',
      officialSection: {
        authority: 'official', datasetId: 'public', roadNumber: 'B', sectionNumber: '02',
      },
      geometry: [
        hub,
        { lat: 64, lon: -20.9995, zM: 10 },
        { lat: 64, lon: -20.999, zM: 10 },
      ],
      endpointLabels: { start: '(C-03)' },
    },
    {
      ...topologySegments()[1],
      id: 'hub-evidence-c', sourceFeatureId: 'hub-feature-c',
      officialSection: {
        authority: 'official', datasetId: 'public', roadNumber: 'C', sectionNumber: '03',
      },
      geometry: [{ lat: 64.001, lon: -21, zM: 10 }, hub],
      endpointLabels: { end: '(B-02)' },
    },
  ]
}

function hubGraphInputs(): IcelandRoadGraphSegmentInput[] {
  return hubTopologySegments().map(segment => ({
    id: segment.id,
    source: 'teskeid_fixture' as const,
    sourceId: segment.sourceFeatureId,
    geometry: segment.geometry.map(point => ({
      lat: point.lat,
      lon: point.lon,
      ...(point.zM === undefined ? {} : { elevationM: point.zM }),
    })),
    roadClass: 'local' as const,
    surface: 'paved' as const,
    direction: 'both' as const,
    networkRole: 'assessment_public' as const,
  }))
}

function hubReceiptFixture() {
  const result = reconcileSourceAttestedJunctionGaps(hubTopologySegments(), hubPolicy)
  const receipt = result.receipts.find(candidate => (
    candidate.targetAttestation.kind === 'source_attested_hub_endpoint'
  ))
  expect(receipt).toBeDefined()
  if (!receipt) throw new Error('missing_hub_receipt_fixture')
  const binding: IcelandRoadGraphTopologyReceiptBinding = {
    receipt,
    sourceGraph: {
      segmentId: 'hub-source-a', sourceId: 'hub-feature-a', endpoint: 'end',
    },
    targetGraph: {
      segmentId: 'hub-target-b', sourceId: 'hub-feature-b',
      topologyEdgeIndex: receipt.targetSplit.edgeIndex,
      edgeIndex: 0, edgeFraction: 0,
    },
  }
  return { binding, receiptLedger: result.receipts }
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
      topologyReconciliation: topologyReconciliationOptions(binding),
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
      topologyReconciliation: topologyReconciliationOptions(binding, [binding.receipt], inputs),
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
    const rebound = {
      ...binding,
      receipt: {
        ...binding.receipt,
        targetSplit: { ...binding.receipt.targetSplit, location: 'interior' as const },
      },
    }
    expect(() => buildIcelandRoadGraph(exactVertexGraphInputs(), {
      topologyReconciliation: topologyReconciliationOptions(
        rebound,
        [rebound.receipt],
        exactVertexGraphInputs(),
      ),
    })).toThrow('invalid_road_graph_topology_binding:invalid_receipt_ledger')
  })

  it('fails closed when a receipt is rebound to the other source endpoint', () => {
    const binding = exactVertexReceiptBinding()
    expect(() => buildIcelandRoadGraph(exactVertexGraphInputs(), {
      topologyReconciliation: {
        ...topologyReconciliationOptions(
          binding,
          [binding.receipt],
          exactVertexGraphInputs(),
        ),
        bindings: [{
          ...binding,
          sourceGraph: { ...binding.sourceGraph, endpoint: 'start' },
        }],
      },
    })).toThrow('invalid_road_graph_topology_binding:source_identity_mismatch')
  })

  it('fails closed when a one-way receipt broadens its attested traversal', () => {
    const binding = receiptBinding('forward')
    const broadened = {
      ...binding,
      receipt: {
        ...binding.receipt,
        connector: {
          ...binding.receipt.connector,
          allowedTraversal: ['source_to_target', 'target_to_source'] as const,
        },
      },
    }
    expect(() => buildIcelandRoadGraph(graphInputs('forward'), {
      topologyReconciliation: topologyReconciliationOptions(broadened),
    })).toThrow('invalid_road_graph_topology_binding:invalid_receipt_ledger')
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
    const exactVertexBinding = exactVertexReceiptBinding()
    const graph = buildIcelandRoadGraph(inputs, {
      topologyReconciliation: topologyReconciliationOptions(
        exactVertexBinding,
        [exactVertexBinding.receipt],
        inputs,
      ),
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
      topologyReconciliation: topologyReconciliationOptions(binding),
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
    const binding = receiptBinding()
    const graph = buildIcelandRoadGraph(graphInputs('both', 'access_connector'), {
      nodeSnapToleranceM: 1,
      topologyReconciliation: {
        ...topologyReconciliationOptions(binding),
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
        ...topologyReconciliationOptions(binding),
        bindings: [{
          ...binding,
          targetGraph: { ...binding.targetGraph, segmentId: 'unmapped-surface-child' },
        }],
      },
    })).toThrow('invalid_road_graph_topology_binding:target_segment_missing')
  })

  it('accepts a v4 hub binding only with its complete independent receipt ledger', () => {
    const { binding, receiptLedger } = hubReceiptFixture()
    const graph = buildIcelandRoadGraph(hubGraphInputs(), {
      nodeSnapToleranceM: 1,
      topologyReconciliation: topologyReconciliationOptions(
        binding, receiptLedger, hubGraphInputs(),
      ),
    })

    expect(graph.topologyReceiptIds).toEqual([binding.receipt.id])
    expect(graph.edges.filter(edge => edge.graphRole === 'topology_connector')).toHaveLength(2)
  })

  it('binds section endpoints across multiple surface children, never to an interior seam', () => {
    const { binding, receiptLedger } = hubReceiptFixture()
    const splitIds = new Set(['hub-source-a', 'hub-target-b'])
    const inputs = hubGraphInputs().flatMap(input => {
      if (!splitIds.has(input.id)) return [input]
      return [
        { ...input, id: `${input.id}:surface-0`, geometry: input.geometry.slice(0, 2) },
        { ...input, id: `${input.id}:surface-1`, geometry: input.geometry.slice(1) },
      ]
    })
    const baseOptions = topologyReconciliationOptions(
      binding,
      receiptLedger,
      hubGraphInputs(),
    )
    const sectionLedger = baseOptions.sectionLedger.map(section => (
      splitIds.has(section.topologySegmentId)
        ? {
            ...section,
            graphEdges: [0, 1].map(surfaceIndex => ({
              segmentId: `${section.topologySegmentId}:surface-${surfaceIndex}`,
              sourceId: section.sourceFeatureId,
              edgeIndex: 0,
            })),
          }
        : section
    ))
    const honestBinding: IcelandRoadGraphTopologyReceiptBinding = {
      ...binding,
      sourceGraph: {
        ...binding.sourceGraph,
        segmentId: 'hub-source-a:surface-1',
      },
      targetGraph: {
        ...binding.targetGraph,
        segmentId: 'hub-target-b:surface-0',
      },
    }
    const honestOptions = { ...baseOptions, bindings: [honestBinding], sectionLedger }

    expect(() => buildIcelandRoadGraph(inputs, {
      nodeSnapToleranceM: 1,
      topologyReconciliation: honestOptions,
    })).not.toThrow()
    expect(() => buildIcelandRoadGraph(inputs, {
      topologyReconciliation: {
        ...honestOptions,
        bindings: [{
          ...honestBinding,
          sourceGraph: {
            ...honestBinding.sourceGraph,
            segmentId: 'hub-source-a:surface-0',
          },
        }],
      },
    })).toThrow('invalid_road_graph_topology_binding:source_identity_mismatch')
    expect(() => buildIcelandRoadGraph(inputs, {
      topologyReconciliation: {
        ...honestOptions,
        bindings: [{
          ...honestBinding,
          targetGraph: {
            ...honestBinding.targetGraph,
            segmentId: 'hub-target-b:surface-1',
          },
        }],
      },
    })).toThrow('invalid_road_graph_topology_binding:source_identity_mismatch')

    const evidenceId = binding.receipt.targetAttestation.kind === 'source_attested_hub_endpoint'
      ? binding.receipt.targetAttestation.hubReceiptIds[0]
      : ''
    const evidence = receiptLedger.find(receipt => receipt.id === evidenceId)
    const forgedTargetPoint = inputs.find(input => input.id === 'hub-target-b:surface-0')!
      .geometry[1]
    expect(evidence?.targetSegmentId).toBe('hub-target-b')
    if (!evidence) throw new Error('missing_foundational_receipt_fixture')
    const forgedConnectorEnd = {
      lat: forgedTargetPoint.lat,
      lon: forgedTargetPoint.lon,
      ...(forgedTargetPoint.elevationM === undefined
        ? {}
        : { zM: forgedTargetPoint.elevationM }),
    }
    const forgedEvidence = {
      ...evidence,
      targetSplit: {
        ...evidence.targetSplit,
        edgeIndex: 0,
        edgeFraction: 1,
        location: 'end',
        point: forgedConnectorEnd,
      },
      connector: {
        ...evidence.connector,
        geometry: [evidence.connector.geometry[0], forgedConnectorEnd],
        lengthM: haversineDistanceM(evidence.connector.geometry[0], forgedConnectorEnd),
      },
    } as IcelandRoadGraphTopologyReceiptBinding['receipt']
    expect(() => buildIcelandRoadGraph(inputs, {
      topologyReconciliation: {
        ...honestOptions,
        receiptLedger: receiptLedger.map(receipt => (
          receipt.id === forgedEvidence.id ? forgedEvidence : receipt
        )),
      },
    })).toThrow('invalid_road_graph_topology_binding:hub_evidence_mismatch')
  })

  it('rejects missing, self-referential and wrong-contract v4 hub evidence', () => {
    const { binding, receiptLedger } = hubReceiptFixture()
    expect(() => buildIcelandRoadGraph(hubGraphInputs(), {
      topologyReconciliation: topologyReconciliationOptions(
        binding, [binding.receipt], hubGraphInputs(),
      ),
    })).toThrow('invalid_road_graph_topology_binding:hub_evidence_mismatch')

    const selfAttested = {
      ...binding,
      receipt: {
        ...binding.receipt,
        targetAttestation: {
          ...binding.receipt.targetAttestation,
          hubReceiptIds: [binding.receipt.id],
        },
      },
    } as IcelandRoadGraphTopologyReceiptBinding
    expect(() => buildIcelandRoadGraph(hubGraphInputs(), {
      topologyReconciliation: topologyReconciliationOptions(selfAttested, [
        ...receiptLedger.filter(receipt => receipt.id !== binding.receipt.id),
        selfAttested.receipt,
      ], hubGraphInputs()),
    })).toThrow('invalid_road_graph_topology_binding:hub_evidence_mismatch')

    const cyclicEvidenceId = 'forged-hub-evidence'
    const cyclicEvidence = {
      ...binding.receipt,
      id: cyclicEvidenceId,
      connector: {
        ...binding.receipt.connector,
        id: `${cyclicEvidenceId}:connector`,
      },
      targetAttestation: {
        ...binding.receipt.targetAttestation,
        hubReceiptIds: [binding.receipt.id],
      },
    } as IcelandRoadGraphTopologyReceiptBinding['receipt']
    const cyclicBinding = {
      ...binding,
      receipt: {
        ...binding.receipt,
        targetAttestation: {
          ...binding.receipt.targetAttestation,
          hubReceiptIds: [cyclicEvidenceId],
        },
      },
    } as IcelandRoadGraphTopologyReceiptBinding
    expect(() => buildIcelandRoadGraph(hubGraphInputs(), {
      topologyReconciliation: topologyReconciliationOptions(cyclicBinding, [
        ...receiptLedger.filter(receipt => receipt.id !== binding.receipt.id),
        cyclicBinding.receipt,
        cyclicEvidence,
      ], hubGraphInputs()),
    })).toThrow('invalid_road_graph_topology_binding:hub_evidence_mismatch')

    const wrongEndpoint = {
      ...binding,
      receipt: {
        ...binding.receipt,
        targetAttestation: {
          ...binding.receipt.targetAttestation,
          endpoint: 'end' as const,
        },
      },
    } as IcelandRoadGraphTopologyReceiptBinding
    expect(() => buildIcelandRoadGraph(hubGraphInputs(), {
      topologyReconciliation: topologyReconciliationOptions(wrongEndpoint, [
        ...receiptLedger.filter(receipt => receipt.id !== binding.receipt.id),
        wrongEndpoint.receipt,
      ], hubGraphInputs()),
    })).toThrow('invalid_road_graph_topology_binding:invalid_receipt_ledger')

    expect(() => buildIcelandRoadGraph(hubGraphInputs(), {
      topologyReconciliation: {
        ...topologyReconciliationOptions(binding, receiptLedger, hubGraphInputs()),
        policyId: 'forged-policy',
      },
    })).toThrow('invalid_road_graph_topology_binding:invalid_receipt_ledger')
  })

  it('rejects non-finite receipt values and endpoint bindings to an interior edge', () => {
    const { binding, receiptLedger } = hubReceiptFixture()
    const nonFinite = {
      ...binding,
      receipt: {
        ...binding.receipt,
        connector: { ...binding.receipt.connector, lengthM: Number.NaN },
      },
    }
    expect(() => buildIcelandRoadGraph(hubGraphInputs(), {
      topologyReconciliation: topologyReconciliationOptions(nonFinite, [
        ...receiptLedger.filter(receipt => receipt.id !== binding.receipt.id),
        nonFinite.receipt,
      ], hubGraphInputs()),
    })).toThrow('invalid_road_graph_topology_binding:invalid_receipt_ledger')

    const repeatedHubInputs = hubGraphInputs().map(input => input.id === 'hub-target-b'
      ? {
          ...input,
          geometry: [
            input.geometry[0], input.geometry[1], input.geometry[0],
            { lat: 64, lon: -20.998, elevationM: 10 },
          ],
        }
      : input)
    expect(() => buildIcelandRoadGraph(repeatedHubInputs, {
      topologyReconciliation: topologyReconciliationOptions({
        ...binding,
        targetGraph: { ...binding.targetGraph, edgeIndex: 2 },
      }, receiptLedger, repeatedHubInputs),
    })).toThrow('invalid_road_graph_topology_binding:source_identity_mismatch')

    expect(() => buildIcelandRoadGraph(hubGraphInputs(), {
      topologyReconciliation: topologyReconciliationOptions({
        ...binding,
        targetGraph: { ...binding.targetGraph, topologyEdgeIndex: 1 },
      }, receiptLedger, hubGraphInputs()),
    })).toThrow('invalid_road_graph_topology_binding:target_projection_range')
  })
})
