import { buildIcelandRoadGraph } from './roadGraph'
import {
  ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_EXACT_VERTEX_V2,
  ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_ENDPOINT_JUNCTION_V3,
  ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_HUB_ENDPOINT_V4,
  ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_RECIPROCAL_V1,
  type RoadGraphRuntimeBuildPolicyFingerprint,
} from './roadGraphSnapshotFormat'
import type { IcelandRoadGraph, IcelandRoadGraphSegmentInput } from './roadGraphTypes'
import {
  reconcileVegagerdinRoadGraphTopology,
  VEGAGERDIN_TOPOLOGY_RECONCILIATION_POLICY_ID_V1,
  VEGAGERDIN_TOPOLOGY_RECONCILIATION_POLICY_ID_V2,
  VEGAGERDIN_TOPOLOGY_RECONCILIATION_POLICY_ID_V3,
  VEGAGERDIN_TOPOLOGY_RECONCILIATION_POLICY_ID_V4,
  type VegagerdinRoadGraphTopologyResult,
  type VegagerdinTopologyReconciliationPolicyId,
} from './vegagerdinRoadGraphTopology'

export interface EnhancedRoadGraphSnapshotMaterialization {
  graph: IcelandRoadGraph
  topology: VegagerdinRoadGraphTopologyResult
}

function topologyPolicyIdForFingerprint(
  fingerprint: RoadGraphRuntimeBuildPolicyFingerprint,
): VegagerdinTopologyReconciliationPolicyId {
  if (fingerprint === ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_RECIPROCAL_V1) {
    return VEGAGERDIN_TOPOLOGY_RECONCILIATION_POLICY_ID_V1
  }
  if (fingerprint === ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_EXACT_VERTEX_V2) {
    return VEGAGERDIN_TOPOLOGY_RECONCILIATION_POLICY_ID_V2
  }
  if (fingerprint === ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_ENDPOINT_JUNCTION_V3) {
    return VEGAGERDIN_TOPOLOGY_RECONCILIATION_POLICY_ID_V3
  }
  if (fingerprint === ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_HUB_ENDPOINT_V4) {
    return VEGAGERDIN_TOPOLOGY_RECONCILIATION_POLICY_ID_V4
  }
  throw new Error('road_graph_runtime_build_policy_unsupported')
}

/**
 * One deterministic enhanced-v1 materializer shared by refresh validation and
 * the user-facing snapshot reader. The fingerprint chooses the exact topology
 * semantics that the immutable snapshot contract was validated against.
 */
export function materializeEnhancedRoadGraphSnapshotV1(input: {
  segments: readonly IcelandRoadGraphSegmentInput[]
  nodeSnapToleranceM: number
  sourceContentSha256: string
  policyFingerprint: RoadGraphRuntimeBuildPolicyFingerprint
}): EnhancedRoadGraphSnapshotMaterialization {
  const topology = reconcileVegagerdinRoadGraphTopology({
    segments: input.segments,
    nodeSnapToleranceM: input.nodeSnapToleranceM,
    policyId: topologyPolicyIdForFingerprint(input.policyFingerprint),
    artifact: {
      artifactId: 'vegagerdin-road-graph-snapshot-source',
      contentSha256: input.sourceContentSha256,
      validationReportId: 'road-graph-snapshot-validation',
    },
  })
  const graph = buildIcelandRoadGraph(input.segments, {
    nodeSnapToleranceM: input.nodeSnapToleranceM,
    routingDirectionPolicy: 'bidirectional',
    missingDirectionPolicy: 'provisional_bidirectional',
    ...(topology.bindings.length > 0 && topology.receipts[0]
      ? {
          topologyReconciliation: {
            bindings: topology.bindings,
            sectionLedger: topology.sectionLedger,
            receiptLedger: topology.receipts,
            policyId: topology.policyId,
            provenance: topology.receipts[0].provenance,
            invalidBindingBehavior: 'throw' as const,
          },
        }
      : {}),
  })
  return { graph, topology }
}
