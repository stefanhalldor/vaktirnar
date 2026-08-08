import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ORIGINAL_EXACT_VERTEX_V2_FLAG =
  process.env.TESKEID_ROAD_GRAPH_EXACT_VERTEX_V2_ENABLED
const ORIGINAL_ENDPOINT_JUNCTION_V3_FLAG =
  process.env.TESKEID_ROAD_GRAPH_ENDPOINT_JUNCTION_V3_ENABLED
const ORIGINAL_HUB_ENDPOINT_V4_FLAG =
  process.env.TESKEID_ROAD_GRAPH_HUB_ENDPOINT_V4_ENABLED

const mocks = vi.hoisted(() => ({
  begin: vi.fn(),
  unchanged: vi.fn(),
  fail: vi.fn(),
  promote: vi.fn(),
  prune: vi.fn(),
  readActive: vi.fn(),
  readPayload: vi.fn(),
  stage: vi.fn(),
  hashSegments: vi.fn(),
  fetchSegments: vi.fn(),
  buildGraph: vi.fn(),
  analyzeGraph: vi.fn(),
  auditGolden: vi.fn(),
  auditExactVertexV2: vi.fn(),
  reconcileTopology: vi.fn(),
}))

vi.mock('@/lib/iceland-routes/roadGraphSnapshotStore.server', () => ({
  beginRoadGraphSnapshotRefresh: mocks.begin,
  completeUnchangedRoadGraphRefresh: mocks.unchanged,
  failRoadGraphSnapshot: mocks.fail,
  promoteRoadGraphSnapshot: mocks.promote,
  pruneRoadGraphSnapshotHistory: mocks.prune,
  readActiveRoadGraphSnapshotMetadata: mocks.readActive,
  readRoadGraphSnapshotPayload: mocks.readPayload,
  stageRoadGraphSnapshot: mocks.stage,
  hashRoadGraphSnapshotSegments: mocks.hashSegments,
}))

vi.mock('@/lib/iceland-routes/vegagerdinRoadGraphSource.server', () => ({
  fetchVegagerdinRoadGraphSegments: mocks.fetchSegments,
}))

vi.mock('@/lib/iceland-routes/roadGraph', () => ({
  buildIcelandRoadGraph: mocks.buildGraph,
  analyzeIcelandRoadGraph: mocks.analyzeGraph,
}))

vi.mock('@/lib/iceland-routes/goldenRoutes', () => ({
  auditIcelandGoldenRoutes: mocks.auditGolden,
  ICELAND_GOLDEN_ROUTES: Array.from({ length: 23 }, (_, index) => ({
    id: `route-${index}`, minKm: 10, maxKm: 200,
  })),
}))

vi.mock('@/lib/iceland-routes/roadGraphExactVertexV2Regression.server', () => ({
  auditExactVertexV2VidibakkiRoute: mocks.auditExactVertexV2,
}))

vi.mock('@/lib/iceland-routes/vegagerdinRoadGraphTopology', () => ({
  reconcileVegagerdinRoadGraphTopology: mocks.reconcileTopology,
  VEGAGERDIN_TOPOLOGY_RECONCILIATION_POLICY_ID_V1: 'vegagerdin-reciprocal-section-endpoints-v1',
  VEGAGERDIN_TOPOLOGY_RECONCILIATION_POLICY_ID_V2: 'vegagerdin-attested-section-junctions-v2',
  VEGAGERDIN_TOPOLOGY_RECONCILIATION_POLICY_ID_V3: 'vegagerdin-attested-endpoint-junctions-v3',
  VEGAGERDIN_TOPOLOGY_RECONCILIATION_POLICY_ID_V4: 'vegagerdin-source-attested-hub-endpoint-gaps-v4',
}))

import {
  ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_ENDPOINT_JUNCTION_V3,
  ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_EXACT_VERTEX_V2,
  ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_HUB_ENDPOINT_V4,
  ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_RECIPROCAL_V1,
  type RoadGraphRuntimeBuildPolicyFingerprint,
} from '@/lib/iceland-routes/roadGraphSnapshotFormat'

import {
  refreshRoadGraphSnapshot,
  validateRoadGraphSnapshot,
} from '@/lib/iceland-routes/roadGraphRefresh.server'

const SOURCE_ID = 'vegagerdin:layer-6:section-10:road-part-1:road-part-number-1'
const SEGMENTS = [{
  id: `${SOURCE_ID}:geometry-0`, source: 'vegagerdin', sourceId: SOURCE_ID,
  geometry: [{ lat: 64, lon: -22 }, { lat: 65, lon: -21 }],
  roadClass: 'trunk', surface: 'paved', direction: 'both',
  directionStatus: 'authoritative_both',
  networkRole: 'assessment_public',
  official: {
    provider: 'vegagerdin', sourceLayerId: 6, sourceObjectId: 1, sectionId: 10,
    sectionNumber: '01', sectionStartLabel: 'A', sectionEndLabel: 'B',
    roadPartCode: 1, roadPartNumber: '1', ownerCode: 0, roadClassCode: 1,
    directionCode: 2, directionFieldState: 'integer', inUseFromEpochMs: 0,
    outOfUseAtEpochMs: Date.parse('9999-12-31T00:00:00.000Z'),
  },
}]

function diagnostics(segmentCount = 1_226) {
  return {
    segmentCount,
    nodeCount: 1_363,
    edgeCount: 2_400,
    weakComponentCount: 3,
    largestWeakComponentNodeCount: 1_300,
    isolatedNodeCount: 0,
    surfaceEdgeCounts: { paved: 2_100, gravel: 300, mixed: 0, unknown: 0 },
    derivedSpeedEdgeCount: 2_400,
    topologyConnectorEdgeCount: 0,
  }
}

const GOLDEN = Array.from({ length: 23 }, (_, index) => ({ id: `route-${index}`, status: 'ok' }))

function goldenAudits(distanceKm: number, reverseDistanceKm = distanceKm) {
  return Array.from({ length: 23 }, (_, index) => ({
    id: `route-${index}`,
    from: 'from',
    to: 'to',
    minKm: 10,
    maxKm: 200,
    fromName: 'From',
    toName: 'To',
    status: 'ok' as const,
    distanceKm,
    reverseDistanceKm,
    airDistanceKm: Math.max(1, distanceKm / 2),
    roadToAirRatio: 2,
    directionalDistanceDeltaM: Math.abs(distanceKm - reverseDistanceKm) * 1_000,
    durationMinutes: distanceKm,
    segmentCount: 1,
    pavedKm: distanceKm,
    gravelKm: 0,
    mixedKm: 0,
    unknownKm: 0,
    originSnapM: 10,
    destinationSnapM: 10,
    reverseOriginSnapM: 10,
    reverseDestinationSnapM: 10,
  }))
}

function runtimeBuildContract(
  policyFingerprint: RoadGraphRuntimeBuildPolicyFingerprint =
    ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_EXACT_VERTEX_V2,
) {
  return {
    schemaVersion: 1 as const,
    policyFingerprint,
    diagnostics: diagnostics(),
    goldenRoutePassCount: 23,
    goldenRouteTotalCount: 23,
    topologyReceiptIds: [],
  }
}

function enhancedPayload(
  policyFingerprint: RoadGraphRuntimeBuildPolicyFingerprint =
    ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_EXACT_VERTEX_V2,
) {
  return {
    schemaVersion: 1 as const,
    source: 'vegagerdin' as const,
    sourceFetchedAtIso: '2026-07-30T00:00:00.000Z',
    nodeSnapToleranceM: 20,
    runtimeBuildContract: runtimeBuildContract(policyFingerprint),
    segments: SEGMENTS,
  }
}

describe('road graph snapshot refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.readActive.mockReset()
    process.env.TESKEID_ROAD_GRAPH_EXACT_VERTEX_V2_ENABLED = 'true'
    delete process.env.TESKEID_ROAD_GRAPH_ENDPOINT_JUNCTION_V3_ENABLED
    delete process.env.TESKEID_ROAD_GRAPH_HUB_ENDPOINT_V4_ENABLED
    mocks.begin.mockResolvedValue('snapshot-new')
    mocks.readActive
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'snapshot-new' })
    mocks.fetchSegments.mockResolvedValue(SEGMENTS)
    mocks.hashSegments.mockReturnValue('new-source-hash')
    mocks.readPayload.mockResolvedValue({
      schemaVersion: 1,
      source: 'vegagerdin',
      sourceFetchedAtIso: '2026-07-26T15:00:00.000Z',
      nodeSnapToleranceM: 20,
      segments: SEGMENTS,
    })
    mocks.buildGraph.mockReturnValue({ graph: true })
    mocks.analyzeGraph.mockReturnValue(diagnostics())
    mocks.auditGolden.mockReturnValue(GOLDEN)
    mocks.auditExactVertexV2.mockReturnValue({
      status: 'ok',
      receiptId: 'vidibakki-receipt',
      forwardDistanceM: 536_146,
      reverseDistanceM: 536_146,
      forwardGeometryDistanceM: 534_179,
      reverseGeometryDistanceM: 534_179,
      vidibakkiSnapDistanceM: 442,
      isafjordurSnapDistanceM: 202,
    })
    mocks.reconcileTopology.mockReturnValue({
      policyId: 'vegagerdin-attested-section-junctions-v2',
      candidates: [], receipts: [], bindings: [], topologySegmentCount: 1,
    })
    mocks.stage.mockResolvedValue(undefined)
    mocks.promote.mockResolvedValue(undefined)
    mocks.prune.mockResolvedValue(undefined)
    mocks.fail.mockResolvedValue(undefined)
  })

  afterEach(() => {
    if (ORIGINAL_EXACT_VERTEX_V2_FLAG === undefined) {
      delete process.env.TESKEID_ROAD_GRAPH_EXACT_VERTEX_V2_ENABLED
    } else {
      process.env.TESKEID_ROAD_GRAPH_EXACT_VERTEX_V2_ENABLED =
        ORIGINAL_EXACT_VERTEX_V2_FLAG
    }
    if (ORIGINAL_ENDPOINT_JUNCTION_V3_FLAG === undefined) {
      delete process.env.TESKEID_ROAD_GRAPH_ENDPOINT_JUNCTION_V3_ENABLED
    } else {
      process.env.TESKEID_ROAD_GRAPH_ENDPOINT_JUNCTION_V3_ENABLED =
        ORIGINAL_ENDPOINT_JUNCTION_V3_FLAG
    }
    if (ORIGINAL_HUB_ENDPOINT_V4_FLAG === undefined) {
      delete process.env.TESKEID_ROAD_GRAPH_HUB_ENDPOINT_V4_ENABLED
    } else {
      process.env.TESKEID_ROAD_GRAPH_HUB_ENDPOINT_V4_ENABLED =
        ORIGINAL_HUB_ENDPOINT_V4_FLAG
    }
  })

  it('stages and atomically promotes only after validation passes', async () => {
    const result = await refreshRoadGraphSnapshot('admin')

    expect(result).toMatchObject({ status: 'ok', snapshotId: 'snapshot-new', goldenRoutePassCount: 23 })
    expect(mocks.stage).toHaveBeenCalledOnce()
    expect(mocks.promote).toHaveBeenCalledWith('snapshot-new')
    expect(mocks.fail).not.toHaveBeenCalled()
  })

  it('keeps the reciprocal-v1 writer and skips the v2 canary until the flag is enabled', async () => {
    delete process.env.TESKEID_ROAD_GRAPH_EXACT_VERTEX_V2_ENABLED

    await expect(refreshRoadGraphSnapshot('cron')).resolves.toMatchObject({
      status: 'ok',
      policyFingerprint: ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_RECIPROCAL_V1,
    })
    expect(mocks.reconcileTopology).toHaveBeenCalledWith(expect.objectContaining({
      policyId: 'vegagerdin-reciprocal-section-endpoints-v1',
    }))
    expect(mocks.auditExactVertexV2).not.toHaveBeenCalled()
  })

  it('stores legacy diagnostics in metadata while binding enhanced diagnostics in the payload', async () => {
    const enhancedDiagnostics = {
      ...diagnostics(),
      edgeCount: 2_402,
      topologyConnectorEdgeCount: 2,
    }
    const legacyDiagnostics = diagnostics()
    mocks.analyzeGraph
      .mockReturnValueOnce(enhancedDiagnostics)
      .mockReturnValueOnce(legacyDiagnostics)

    await expect(refreshRoadGraphSnapshot('admin')).resolves.toMatchObject({
      status: 'ok', edgeCount: 2_402,
    })

    expect(mocks.stage).toHaveBeenCalledWith(expect.objectContaining({
      diagnostics: legacyDiagnostics,
      payload: expect.objectContaining({
        runtimeBuildContract: expect.objectContaining({ diagnostics: enhancedDiagnostics }),
      }),
      validation: expect.objectContaining({
        runtimeBuildContract: expect.objectContaining({ diagnostics: enhancedDiagnostics }),
        legacyRuntimeDiagnostics: legacyDiagnostics,
      }),
    }))
  })

  it('does no source work when another refresh owns the database lease', async () => {
    mocks.begin.mockResolvedValue(null)
    await expect(refreshRoadGraphSnapshot('cron')).resolves.toEqual({
      status: 'skipped', reason: 'already_running',
    })
    expect(mocks.fetchSegments).not.toHaveBeenCalled()
  })

  it('records an unchanged run without rebuilding or promoting', async () => {
    mocks.readActive.mockReset()
    const payload = enhancedPayload()
    mocks.readActive.mockResolvedValue({
      id: 'snapshot-old', sourceContentSha256: 'same',
      validation: { runtimeBuildContract: payload.runtimeBuildContract },
    })
    mocks.hashSegments.mockReturnValue('same')
    mocks.readPayload.mockResolvedValue(payload)

    await expect(refreshRoadGraphSnapshot('cron')).resolves.toEqual({
      status: 'skipped', reason: 'unchanged', activeSnapshotId: 'snapshot-old',
      policyFingerprint: ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_EXACT_VERTEX_V2,
    })
    expect(mocks.unchanged).toHaveBeenCalledWith(expect.objectContaining({ activeSnapshotId: 'snapshot-old' }))
    expect(mocks.buildGraph).not.toHaveBeenCalled()
    expect(mocks.promote).not.toHaveBeenCalled()
  })

  it('keeps reciprocal-v1 unchanged during the reader-first rollout stage', async () => {
    delete process.env.TESKEID_ROAD_GRAPH_EXACT_VERTEX_V2_ENABLED
    mocks.readActive.mockReset()
    const payload = enhancedPayload(ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_RECIPROCAL_V1)
    mocks.readActive.mockResolvedValue({
      id: 'snapshot-old', sourceContentSha256: 'same',
      validation: { runtimeBuildContract: payload.runtimeBuildContract },
    })
    mocks.hashSegments.mockReturnValue('same')
    mocks.readPayload.mockResolvedValue(payload)

    await expect(refreshRoadGraphSnapshot('cron')).resolves.toEqual({
      status: 'skipped', reason: 'unchanged', activeSnapshotId: 'snapshot-old',
      policyFingerprint: ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_RECIPROCAL_V1,
    })
    expect(mocks.buildGraph).not.toHaveBeenCalled()
    expect(mocks.promote).not.toHaveBeenCalled()
  })

  it('never downgrades an active exact-vertex-v2 snapshot when the rollout flag is absent', async () => {
    delete process.env.TESKEID_ROAD_GRAPH_EXACT_VERTEX_V2_ENABLED
    mocks.readActive.mockReset()
    const payload = enhancedPayload()
    mocks.readActive.mockResolvedValue({
      id: 'snapshot-v2', sourceContentSha256: 'same',
      validation: { runtimeBuildContract: payload.runtimeBuildContract },
    })
    mocks.hashSegments.mockReturnValue('same')
    mocks.readPayload.mockResolvedValue(payload)

    await expect(refreshRoadGraphSnapshot('cron')).resolves.toEqual({
      status: 'skipped', reason: 'unchanged', activeSnapshotId: 'snapshot-v2',
      policyFingerprint: ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_EXACT_VERTEX_V2,
    })
    expect(mocks.buildGraph).not.toHaveBeenCalled()
    expect(mocks.promote).not.toHaveBeenCalled()
  })

  it('never downgrades an active endpoint-junction-v3 snapshot when its rollout flag is absent', async () => {
    delete process.env.TESKEID_ROAD_GRAPH_ENDPOINT_JUNCTION_V3_ENABLED
    mocks.readActive.mockReset()
    const payload = enhancedPayload(
      ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_ENDPOINT_JUNCTION_V3,
    )
    mocks.readActive.mockResolvedValue({
      id: 'snapshot-v3', sourceContentSha256: 'same',
      validation: { runtimeBuildContract: payload.runtimeBuildContract },
    })
    mocks.hashSegments.mockReturnValue('same')
    mocks.readPayload.mockResolvedValue(payload)

    await expect(refreshRoadGraphSnapshot('cron')).resolves.toEqual({
      status: 'skipped', reason: 'unchanged', activeSnapshotId: 'snapshot-v3',
      policyFingerprint: ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_ENDPOINT_JUNCTION_V3,
    })
    expect(mocks.buildGraph).not.toHaveBeenCalled()
    expect(mocks.promote).not.toHaveBeenCalled()
  })

  it('writes v3 only behind its reader-first flag and records legacy audit failure without gating v3', async () => {
    process.env.TESKEID_ROAD_GRAPH_ENDPOINT_JUNCTION_V3_ENABLED = 'true'
    const failedLegacyGolden = GOLDEN.map((route, index) => ({
      ...route,
      status: index === 0 ? 'distance_out_of_range' : 'ok',
    }))
    mocks.auditGolden
      .mockReturnValueOnce(GOLDEN)
      .mockReturnValueOnce(failedLegacyGolden)
    mocks.reconcileTopology.mockReturnValue({
      policyId: 'vegagerdin-attested-endpoint-junctions-v3',
      candidates: [], receipts: [], bindings: [], topologySegmentCount: 1,
    })

    await expect(refreshRoadGraphSnapshot('admin')).resolves.toMatchObject({
      status: 'ok',
      policyFingerprint: ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_ENDPOINT_JUNCTION_V3,
    })
    expect(mocks.reconcileTopology).toHaveBeenCalledWith(expect.objectContaining({
      policyId: 'vegagerdin-attested-endpoint-junctions-v3',
    }))
    expect(mocks.stage).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({
        runtimeBuildContract: expect.objectContaining({
          policyFingerprint: ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_ENDPOINT_JUNCTION_V3,
        }),
      }),
      goldenRoutes: GOLDEN,
      validation: expect.objectContaining({
        legacyRuntimeCompatible: false,
        legacyRuntimeCompatibilityRequired: false,
        publicationRuntimeCompatible: true,
      }),
    }))
  })

  it('never downgrades an active hub-endpoint-v4 snapshot when its rollout flag is absent', async () => {
    delete process.env.TESKEID_ROAD_GRAPH_HUB_ENDPOINT_V4_ENABLED
    mocks.readActive.mockReset()
    const payload = enhancedPayload(ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_HUB_ENDPOINT_V4)
    mocks.readActive.mockResolvedValue({
      id: 'snapshot-v4', sourceContentSha256: 'same',
      validation: { runtimeBuildContract: payload.runtimeBuildContract },
    })
    mocks.hashSegments.mockReturnValue('same')
    mocks.readPayload.mockResolvedValue(payload)

    await expect(refreshRoadGraphSnapshot('cron')).resolves.toEqual({
      status: 'skipped', reason: 'unchanged', activeSnapshotId: 'snapshot-v4',
      policyFingerprint: ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_HUB_ENDPOINT_V4,
    })
    expect(mocks.buildGraph).not.toHaveBeenCalled()
    expect(mocks.promote).not.toHaveBeenCalled()
  })

  it('writes v4 only behind its reader-first flag and does not gate on the legacy graph', async () => {
    process.env.TESKEID_ROAD_GRAPH_HUB_ENDPOINT_V4_ENABLED = 'true'
    const failedLegacyGolden = GOLDEN.map((route, index) => ({
      ...route,
      status: index === 0 ? 'distance_out_of_range' : 'ok',
    }))
    mocks.auditGolden
      .mockReturnValueOnce(GOLDEN)
      .mockReturnValueOnce(failedLegacyGolden)
    mocks.reconcileTopology.mockReturnValue({
      policyId: 'vegagerdin-source-attested-hub-endpoint-gaps-v4',
      candidates: [], receipts: [], bindings: [], topologySegmentCount: 1,
    })

    await expect(refreshRoadGraphSnapshot('admin')).resolves.toMatchObject({
      status: 'ok',
      policyFingerprint: ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_HUB_ENDPOINT_V4,
    })
    expect(mocks.reconcileTopology).toHaveBeenCalledWith(expect.objectContaining({
      policyId: 'vegagerdin-source-attested-hub-endpoint-gaps-v4',
    }))
    expect(mocks.stage).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({
        runtimeBuildContract: expect.objectContaining({
          policyFingerprint: ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_HUB_ENDPOINT_V4,
        }),
      }),
      goldenRoutes: GOLDEN,
      validation: expect.objectContaining({
        legacyRuntimeCompatibilityRequired: false,
        publicationRuntimeCompatible: true,
      }),
    }))
  })

  it('materializes a pre-v179 v2 LKG with its own policy and blocks a large first v4 drift', async () => {
    process.env.TESKEID_ROAD_GRAPH_HUB_ENDPOINT_V4_ENABLED = 'true'
    mocks.readActive.mockReset()
    const payload = enhancedPayload(ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_EXACT_VERTEX_V2)
    mocks.readActive.mockResolvedValue({
      id: 'snapshot-v2', sourceContentSha256: 'old-source',
      validation: { runtimeBuildContract: payload.runtimeBuildContract },
      segmentCount: 1_226, nodeCount: 1_363, edgeCount: 2_400,
      largestWeakComponentNodeCount: 1_300,
    })
    mocks.readPayload.mockResolvedValue(payload)
    mocks.hashSegments.mockReturnValue('new-source')
    mocks.auditGolden
      .mockReturnValueOnce(goldenAudits(100))
      .mockReturnValueOnce(goldenAudits(130))
    mocks.reconcileTopology.mockImplementation(({ policyId }) => ({
      policyId, candidates: [], receipts: [], bindings: [], topologySegmentCount: 1,
    }))

    await expect(refreshRoadGraphSnapshot('admin')).resolves.toEqual({
      status: 'error', reason: 'snapshot_validation_failed',
    })
    expect(mocks.reconcileTopology).toHaveBeenNthCalledWith(1, expect.objectContaining({
      policyId: 'vegagerdin-attested-section-junctions-v2',
    }))
    expect(mocks.reconcileTopology).toHaveBeenNthCalledWith(2, expect.objectContaining({
      policyId: 'vegagerdin-source-attested-hub-endpoint-gaps-v4',
    }))
    expect(mocks.fail).toHaveBeenCalledWith(
      'snapshot-new',
      'snapshot_validation_failed',
      expect.objectContaining({
        previousGoldenRouteBaselineSource: 'active_payload',
        checks: expect.objectContaining({ goldenRouteDistancesStable: false }),
      }),
    )
    expect(mocks.stage).not.toHaveBeenCalled()
  })

  it('rejects a re-materialized LKG that no longer matches its immutable runtime contract', async () => {
    process.env.TESKEID_ROAD_GRAPH_HUB_ENDPOINT_V4_ENABLED = 'true'
    mocks.readActive.mockReset()
    const payload = enhancedPayload(ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_EXACT_VERTEX_V2)
    mocks.readActive.mockResolvedValue({
      id: 'snapshot-v2', sourceContentSha256: 'old-source',
      validation: { runtimeBuildContract: payload.runtimeBuildContract },
      segmentCount: 1_226, nodeCount: 1_363, edgeCount: 2_400,
      largestWeakComponentNodeCount: 1_300,
    })
    mocks.readPayload.mockResolvedValue(payload)
    mocks.hashSegments.mockReturnValue('new-source')
    mocks.analyzeGraph.mockReturnValueOnce({ ...diagnostics(), edgeCount: 2_401 })
    mocks.reconcileTopology.mockImplementation(({ policyId }) => ({
      policyId, candidates: [], receipts: [], bindings: [], topologySegmentCount: 1,
    }))

    await expect(refreshRoadGraphSnapshot('admin')).resolves.toEqual({
      status: 'error', reason: 'active_snapshot_enhanced_diagnostics_mismatch',
    })
    expect(mocks.auditGolden).not.toHaveBeenCalled()
    expect(mocks.stage).not.toHaveBeenCalled()
    expect(mocks.promote).not.toHaveBeenCalled()
  })

  it('rejects a re-materialized LKG when its topology receipt ids drift', async () => {
    process.env.TESKEID_ROAD_GRAPH_HUB_ENDPOINT_V4_ENABLED = 'true'
    mocks.readActive.mockReset()
    const payload = enhancedPayload(ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_EXACT_VERTEX_V2)
    mocks.readActive.mockResolvedValue({
      id: 'snapshot-v2', sourceContentSha256: 'old-source',
      validation: { runtimeBuildContract: payload.runtimeBuildContract },
      segmentCount: 1_226, nodeCount: 1_363, edgeCount: 2_400,
      largestWeakComponentNodeCount: 1_300,
    })
    mocks.readPayload.mockResolvedValue(payload)
    mocks.hashSegments.mockReturnValue('new-source')
    mocks.buildGraph.mockReturnValueOnce({ graph: true, topologyReceiptIds: ['drifted-receipt'] })
    mocks.reconcileTopology.mockImplementation(({ policyId }) => ({
      policyId, candidates: [], receipts: [], bindings: [], topologySegmentCount: 1,
    }))

    await expect(refreshRoadGraphSnapshot('admin')).resolves.toEqual({
      status: 'error', reason: 'active_snapshot_enhanced_diagnostics_mismatch',
    })
    expect(mocks.auditGolden).not.toHaveBeenCalled()
    expect(mocks.stage).not.toHaveBeenCalled()
    expect(mocks.promote).not.toHaveBeenCalled()
  })

  it('rejects a re-materialized LKG when the same golden matrix contradicts its runtime contract', async () => {
    process.env.TESKEID_ROAD_GRAPH_HUB_ENDPOINT_V4_ENABLED = 'true'
    mocks.readActive.mockReset()
    const payload = enhancedPayload(ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_EXACT_VERTEX_V2)
    payload.runtimeBuildContract.goldenRoutePassCount = 22
    payload.runtimeBuildContract.goldenRouteTotalCount = 22
    mocks.readActive.mockResolvedValue({
      id: 'snapshot-v2', sourceContentSha256: 'old-source',
      validation: { runtimeBuildContract: payload.runtimeBuildContract },
      segmentCount: 1_226, nodeCount: 1_363, edgeCount: 2_400,
      largestWeakComponentNodeCount: 1_300,
    })
    mocks.readPayload.mockResolvedValue(payload)
    mocks.hashSegments.mockReturnValue('new-source')
    mocks.auditGolden.mockReturnValueOnce(goldenAudits(100))
    mocks.reconcileTopology.mockImplementation(({ policyId }) => ({
      policyId, candidates: [], receipts: [], bindings: [], topologySegmentCount: 1,
    }))

    await expect(refreshRoadGraphSnapshot('admin')).resolves.toEqual({
      status: 'error', reason: 'active_snapshot_enhanced_golden_mismatch',
    })
    expect(mocks.auditGolden).toHaveBeenCalledOnce()
    expect(mocks.stage).not.toHaveBeenCalled()
    expect(mocks.promote).not.toHaveBeenCalled()
  })

  it('bootstraps a 21-route enhanced LKG and lets absolute gates repair a route with no numeric baseline', async () => {
    process.env.TESKEID_ROAD_GRAPH_HUB_ENDPOINT_V4_ENABLED = 'true'
    mocks.readActive.mockReset()
    const payload = enhancedPayload(ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_EXACT_VERTEX_V2)
    payload.runtimeBuildContract.goldenRoutePassCount = 21
    payload.runtimeBuildContract.goldenRouteTotalCount = 21
    mocks.readActive
      .mockResolvedValueOnce({
        id: 'snapshot-v2', sourceContentSha256: 'old-source',
        validation: { runtimeBuildContract: payload.runtimeBuildContract },
        segmentCount: 1_226, nodeCount: 1_363, edgeCount: 2_400,
        largestWeakComponentNodeCount: 1_300,
      })
      .mockResolvedValueOnce({ id: 'snapshot-new' })
    mocks.readPayload.mockResolvedValue(payload)
    mocks.hashSegments.mockReturnValue('new-source')
    const legacyAudit = goldenAudits(100).map((route, index) => (
      index === 3
        ? { ...route, status: 'no_route' as const, distanceKm: null, reverseDistanceKm: null }
        : route
    ))
    mocks.auditGolden
      .mockReturnValueOnce(legacyAudit)
      .mockReturnValueOnce(goldenAudits(100))
    mocks.reconcileTopology.mockImplementation(({ policyId }) => ({
      policyId, candidates: [], receipts: [], bindings: [], topologySegmentCount: 1,
    }))

    await expect(refreshRoadGraphSnapshot('admin')).resolves.toMatchObject({
      status: 'ok',
      snapshotId: 'snapshot-new',
      policyFingerprint: ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_HUB_ENDPOINT_V4,
    })
    expect(mocks.auditGolden).toHaveBeenCalledTimes(3)
    expect(mocks.stage).toHaveBeenCalledWith(expect.objectContaining({
      validation: expect.objectContaining({
        previousGoldenRouteBaselineSource: 'active_payload',
        checks: expect.objectContaining({ goldenRouteDistancesStable: true }),
      }),
    }))
    expect(mocks.promote).toHaveBeenCalledWith('snapshot-new')
  })

  it('re-materializes an incomplete stored LKG matrix instead of trusting a partial baseline', async () => {
    process.env.TESKEID_ROAD_GRAPH_HUB_ENDPOINT_V4_ENABLED = 'true'
    mocks.readActive.mockReset()
    const payload = enhancedPayload(ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_EXACT_VERTEX_V2)
    mocks.readActive.mockResolvedValue({
      id: 'snapshot-v2', sourceContentSha256: 'old-source',
      validation: {
        runtimeBuildContract: payload.runtimeBuildContract,
        goldenRoutes: goldenAudits(100).slice(0, 22),
      },
      segmentCount: 1_226, nodeCount: 1_363, edgeCount: 2_400,
      largestWeakComponentNodeCount: 1_300,
    })
    mocks.readPayload.mockResolvedValue(payload)
    mocks.hashSegments.mockReturnValue('new-source')
    mocks.auditGolden
      .mockReturnValueOnce(goldenAudits(100))
      .mockReturnValueOnce(goldenAudits(130))
    mocks.reconcileTopology.mockImplementation(({ policyId }) => ({
      policyId, candidates: [], receipts: [], bindings: [], topologySegmentCount: 1,
    }))

    await expect(refreshRoadGraphSnapshot('admin')).resolves.toEqual({
      status: 'error', reason: 'snapshot_validation_failed',
    })
    expect(mocks.fail).toHaveBeenCalledWith(
      'snapshot-new',
      'snapshot_validation_failed',
      expect.objectContaining({
        previousGoldenRouteBaselineSource: 'active_payload',
        checks: expect.objectContaining({ goldenRouteDistancesStable: false }),
      }),
    )
  })

  it('re-materializes a forward-only stored matrix instead of treating it as a complete LKG', async () => {
    process.env.TESKEID_ROAD_GRAPH_HUB_ENDPOINT_V4_ENABLED = 'true'
    mocks.readActive.mockReset()
    const payload = enhancedPayload(ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_EXACT_VERTEX_V2)
    const forwardOnly = goldenAudits(100).map(route => ({
      id: route.id,
      status: route.status,
      distanceKm: route.distanceKm,
    }))
    mocks.readActive.mockResolvedValue({
      id: 'snapshot-v2', sourceContentSha256: 'old-source',
      validation: {
        runtimeBuildContract: payload.runtimeBuildContract,
        goldenRoutes: forwardOnly,
      },
      segmentCount: 1_226, nodeCount: 1_363, edgeCount: 2_400,
      largestWeakComponentNodeCount: 1_300,
    })
    mocks.readPayload.mockResolvedValue(payload)
    mocks.hashSegments.mockReturnValue('new-source')
    mocks.auditGolden
      .mockReturnValueOnce(goldenAudits(100))
      .mockReturnValueOnce(goldenAudits(130))
    mocks.reconcileTopology.mockImplementation(({ policyId }) => ({
      policyId, candidates: [], receipts: [], bindings: [], topologySegmentCount: 1,
    }))

    await expect(refreshRoadGraphSnapshot('admin')).resolves.toEqual({
      status: 'error', reason: 'snapshot_validation_failed',
    })
    expect(mocks.auditGolden).toHaveBeenCalledTimes(2)
    expect(mocks.fail).toHaveBeenCalledWith(
      'snapshot-new',
      'snapshot_validation_failed',
      expect.objectContaining({
        previousGoldenRouteBaselineSource: 'active_payload',
        checks: expect.objectContaining({ goldenRouteDistancesStable: false }),
      }),
    )
  })

  it('fails closed on same-source v2 payload metadata drift instead of selecting v1', async () => {
    delete process.env.TESKEID_ROAD_GRAPH_EXACT_VERTEX_V2_ENABLED
    mocks.readActive.mockReset()
    mocks.readActive.mockResolvedValue({
      id: 'snapshot-v2', sourceContentSha256: 'same', validation: {},
    })
    mocks.hashSegments.mockReturnValue('same')
    mocks.readPayload.mockResolvedValue(enhancedPayload())

    await expect(refreshRoadGraphSnapshot('cron')).resolves.toEqual({
      status: 'error', reason: 'active_snapshot_runtime_contract_mismatch',
    })
    expect(mocks.fetchSegments).not.toHaveBeenCalled()
    expect(mocks.stage).not.toHaveBeenCalled()
    expect(mocks.promote).not.toHaveBeenCalled()
  })

  it('fails closed on changed-source v2 payload metadata drift instead of downgrading', async () => {
    delete process.env.TESKEID_ROAD_GRAPH_EXACT_VERTEX_V2_ENABLED
    mocks.readActive.mockReset()
    mocks.readActive.mockResolvedValue({
      id: 'snapshot-v2', sourceContentSha256: 'old-source', validation: {},
    })
    mocks.hashSegments.mockReturnValue('new-source')
    mocks.readPayload.mockResolvedValue(enhancedPayload())

    await expect(refreshRoadGraphSnapshot('cron')).resolves.toEqual({
      status: 'error', reason: 'active_snapshot_runtime_contract_mismatch',
    })
    expect(mocks.fetchSegments).not.toHaveBeenCalled()
    expect(mocks.stage).not.toHaveBeenCalled()
    expect(mocks.promote).not.toHaveBeenCalled()
  })

  it('rebuilds unchanged source when the active snapshot uses reciprocal-v1 topology', async () => {
    mocks.readActive.mockReset()
    const payload = enhancedPayload(ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_RECIPROCAL_V1)
    mocks.readActive
      .mockResolvedValueOnce({
        id: 'snapshot-old', sourceContentSha256: 'same',
        validation: { runtimeBuildContract: payload.runtimeBuildContract },
      })
      .mockResolvedValueOnce({ id: 'snapshot-new' })
    mocks.hashSegments.mockReturnValue('same')
    mocks.readPayload.mockResolvedValue(payload)

    await expect(refreshRoadGraphSnapshot('admin')).resolves.toMatchObject({
      status: 'ok', snapshotId: 'snapshot-new',
    })
    expect(mocks.unchanged).not.toHaveBeenCalled()
    expect(mocks.reconcileTopology).toHaveBeenCalledWith(expect.objectContaining({
      policyId: 'vegagerdin-attested-section-junctions-v2',
    }))
    expect(mocks.stage).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({
        runtimeBuildContract: expect.objectContaining({
          policyFingerprint: ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_EXACT_VERTEX_V2,
        }),
      }),
    }))
    expect(mocks.promote).toHaveBeenCalledWith('snapshot-new')
  })

  it('forces the first rebuild when the same-source active v1 lacks the build-policy fingerprint', async () => {
    mocks.readActive.mockReset()
    mocks.readActive
      .mockResolvedValueOnce({
        id: 'snapshot-old', sourceContentSha256: 'same', validation: {},
        segmentCount: 1_226, nodeCount: 1_363, edgeCount: 2_400,
        weakComponentCount: 3, largestWeakComponentNodeCount: 1_300,
        goldenRoutePassCount: 21, goldenRouteTotalCount: 21,
      })
      .mockResolvedValueOnce({ id: 'snapshot-new' })
    mocks.hashSegments.mockReturnValue('same')

    await expect(refreshRoadGraphSnapshot('cron')).resolves.toMatchObject({
      status: 'ok', snapshotId: 'snapshot-new',
    })
    expect(mocks.unchanged).not.toHaveBeenCalled()
    expect(mocks.stage).toHaveBeenCalledOnce()
    expect(mocks.promote).toHaveBeenCalledWith('snapshot-new')
  })

  it('does not use a versionless v1 distance baseline when legacy metadata no longer matches', async () => {
    mocks.readActive.mockReset()
    mocks.readActive.mockResolvedValueOnce({
      id: 'snapshot-old', sourceContentSha256: 'old-source', validation: {},
      segmentCount: 1_226, nodeCount: 1_363, edgeCount: 2_399,
      weakComponentCount: 3, largestWeakComponentNodeCount: 1_300,
      goldenRoutePassCount: 21, goldenRouteTotalCount: 21,
    })
    mocks.hashSegments.mockReturnValue('new-source')

    await expect(refreshRoadGraphSnapshot('cron')).resolves.toEqual({
      status: 'error', reason: 'active_snapshot_diagnostics_mismatch',
    })
    expect(mocks.auditGolden).not.toHaveBeenCalled()
    expect(mocks.stage).not.toHaveBeenCalled()
    expect(mocks.promote).not.toHaveBeenCalled()
  })

  it('fails closed when the active immutable object cannot be verified', async () => {
    mocks.readActive.mockReset()
    mocks.readActive
      .mockResolvedValueOnce({ id: 'snapshot-old', sourceContentSha256: 'same' })
    mocks.hashSegments.mockReturnValue('same')
    mocks.readPayload.mockRejectedValue(new Error('missing object'))

    await expect(refreshRoadGraphSnapshot('cron')).resolves.toEqual({
      status: 'error', reason: 'active_snapshot_payload_invalid',
    })
    expect(mocks.fetchSegments).not.toHaveBeenCalled()
    expect(mocks.stage).not.toHaveBeenCalled()
    expect(mocks.promote).not.toHaveBeenCalled()
  })

  it('keeps the active snapshot untouched when a golden route fails', async () => {
    mocks.auditGolden.mockReturnValue([{ id: 'broken', status: 'no_route' }])

    await expect(refreshRoadGraphSnapshot('admin')).resolves.toEqual({
      status: 'error', reason: 'snapshot_validation_failed',
    })
    expect(mocks.stage).not.toHaveBeenCalled()
    expect(mocks.promote).not.toHaveBeenCalled()
    expect(mocks.fail).toHaveBeenCalledWith(
      'snapshot-new',
      'snapshot_validation_failed',
      expect.objectContaining({
        failedGoldenRouteIds: ['broken'],
        diagnostics: diagnostics(),
        goldenRoutePassCount: 0,
        goldenRouteTotalCount: 1,
        thresholds: expect.objectContaining({
          minLargestComponentShare: 0.60,
          minRelativeLargestComponentShare: 0.90,
        }),
      }),
    )
  })

  it('blocks exact-vertex-v2 promotion when the Víðibakki corridor regresses', async () => {
    mocks.auditExactVertexV2.mockReturnValue({
      status: 'corridor_mismatch',
      receiptId: 'vidibakki-receipt',
      forwardDistanceM: 583_184,
      reverseDistanceM: 583_184,
      forwardGeometryDistanceM: 581_000,
      reverseGeometryDistanceM: 581_000,
      vidibakkiSnapDistanceM: 2_737,
      isafjordurSnapDistanceM: 202,
    })

    await expect(refreshRoadGraphSnapshot('admin')).resolves.toEqual({
      status: 'error', reason: 'snapshot_validation_failed',
    })
    expect(mocks.stage).not.toHaveBeenCalled()
    expect(mocks.promote).not.toHaveBeenCalled()
    expect(mocks.fail).toHaveBeenCalledWith(
      'snapshot-new',
      'snapshot_validation_failed',
      expect.objectContaining({
        exactVertexV2Regression: expect.objectContaining({ status: 'corridor_mismatch' }),
      }),
    )
  })

  it('never stages or promotes when the exact v1 publication payload is not parseable', async () => {
    mocks.fetchSegments.mockResolvedValue([{
      ...SEGMENTS[0],
      id: 'malformed-noncanonical-id',
    }])

    await expect(refreshRoadGraphSnapshot('admin')).resolves.toEqual({
      status: 'error', reason: 'snapshot_publish_payload_invalid',
    })
    expect(mocks.stage).not.toHaveBeenCalled()
    expect(mocks.promote).not.toHaveBeenCalled()
  })

  it('marks the claimed run failed when the official source fetch fails', async () => {
    mocks.fetchSegments.mockRejectedValue(new Error('provider detail must not leak'))
    await expect(refreshRoadGraphSnapshot('cron')).resolves.toEqual({
      status: 'error', reason: 'refresh_failed',
    })
    expect(mocks.fail).toHaveBeenCalledWith('snapshot-new', 'refresh_failed', {})
  })
})

describe('validateRoadGraphSnapshot', () => {
  it('accepts healthy diagnostics and all golden routes', () => {
    expect(validateRoadGraphSnapshot({
      diagnostics: diagnostics(),
      goldenRouteStatuses: Array(23).fill('ok'),
    }).ok).toBe(true)
  })

  it('accepts a golden-route distance change inside the 15% LKG budget', () => {
    const result = validateRoadGraphSnapshot({
      diagnostics: diagnostics(),
      goldenRouteStatuses: Array(23).fill('ok'),
      goldenRoutes: goldenAudits(114),
      previous: {
        id: 'old', segmentCount: 1_226, nodeCount: 1_363, edgeCount: 2_400,
        largestWeakComponentNodeCount: 1_300,
        goldenRoutes: goldenAudits(100),
      },
    })

    expect(result.checks.goldenRouteDistancesStable).toBe(true)
    expect(result.ok).toBe(true)
  })

  it('rejects a golden-route distance change outside the 15% LKG budget', () => {
    const result = validateRoadGraphSnapshot({
      diagnostics: diagnostics(),
      goldenRouteStatuses: Array(23).fill('ok'),
      goldenRoutes: goldenAudits(116),
      previous: {
        id: 'old', segmentCount: 1_226, nodeCount: 1_363, edgeCount: 2_400,
        largestWeakComponentNodeCount: 1_300,
        goldenRoutes: goldenAudits(100),
      },
    })

    expect(result.checks.goldenRouteDistancesStable).toBe(false)
    expect(result.ok).toBe(false)
  })

  it('checks a legacy forward-only baseline instead of treating it as absent', () => {
    const legacyForwardOnly = goldenAudits(100).map(route => ({
      id: route.id,
      status: route.status,
      distanceKm: route.distanceKm,
    }))
    const result = validateRoadGraphSnapshot({
      diagnostics: diagnostics(),
      goldenRouteStatuses: Array(23).fill('ok'),
      goldenRoutes: goldenAudits(116),
      previous: {
        id: 'old', segmentCount: 1_226, nodeCount: 1_363, edgeCount: 2_400,
        largestWeakComponentNodeCount: 1_300,
        goldenRoutes: legacyForwardOnly,
      },
    })

    expect(result.checks.goldenRouteDistancesStable).toBe(false)
    expect(result.ok).toBe(false)
  })

  it('allows an in-bounds repair when the LKG itself is outside the tightened bounds', () => {
    const result = validateRoadGraphSnapshot({
      diagnostics: diagnostics(),
      goldenRouteStatuses: Array(23).fill('ok'),
      goldenRoutes: goldenAudits(100),
      previous: {
        id: 'old', segmentCount: 1_226, nodeCount: 1_363, edgeCount: 2_400,
        largestWeakComponentNodeCount: 1_300,
        goldenRoutes: goldenAudits(220),
      },
    })

    expect(result.checks.goldenRouteDistancesStable).toBe(true)
    expect(result.ok).toBe(true)
  })

  it('accepts the measured live bootstrap connectivity baseline', () => {
    const result = validateRoadGraphSnapshot({
      diagnostics: {
        ...diagnostics(),
        nodeCount: 1_363,
        edgeCount: 2_452,
        weakComponentCount: 199,
        largestWeakComponentNodeCount: 854,
      },
      goldenRouteStatuses: Array(23).fill('ok'),
    })

    expect(result.ok).toBe(true)
    expect(result.largestComponentShare).toBeCloseTo(0.626559, 6)
    expect(result.checks.largestComponentShare).toBe(true)
    expect(result.checks.largestComponentShareStable).toBe(true)
  })

  it('rejects a bootstrap below the absolute connectivity floor', () => {
    const result = validateRoadGraphSnapshot({
      diagnostics: { ...diagnostics(), largestWeakComponentNodeCount: 817 },
      goldenRouteStatuses: Array(23).fill('ok'),
    })

    expect(result.ok).toBe(false)
    expect(result.checks.largestComponentShare).toBe(false)
    expect(result.checks.largestComponentShareStable).toBe(true)
  })

  it('accepts the exact 60% absolute connectivity boundary', () => {
    const result = validateRoadGraphSnapshot({
      diagnostics: {
        ...diagnostics(),
        nodeCount: 1_000,
        largestWeakComponentNodeCount: 600,
      },
      goldenRouteStatuses: Array(23).fill('ok'),
    })

    expect(result.largestComponentShare).toBe(0.60)
    expect(result.checks.largestComponentShare).toBe(true)
    expect(result.ok).toBe(true)
  })

  it('requires all 23 golden-route results even when every supplied result passes', () => {
    const result = validateRoadGraphSnapshot({
      diagnostics: diagnostics(),
      goldenRouteStatuses: Array(22).fill('ok'),
    })

    expect(result.ok).toBe(false)
    expect(result.checks.allGoldenRoutesPass).toBe(false)
  })

  it('rejects a snapshot that still contains unresolved official surface edges', () => {
    const result = validateRoadGraphSnapshot({
      diagnostics: {
        ...diagnostics(),
        surfaceEdgeCounts: { paved: 2_398, gravel: 0, mixed: 1, unknown: 1 },
      },
      goldenRouteStatuses: Array(23).fill('ok'),
    })

    expect(result.ok).toBe(false)
    expect(result.checks.officialSurfaceCoverage).toBe(false)
  })

  it('rejects material connectivity drift relative to the active snapshot', () => {
    const result = validateRoadGraphSnapshot({
      // The raw largest component grows, but its normalized share collapses
      // from 75% to 62.5%. This guards against comparing raw node counts.
      diagnostics: {
        ...diagnostics(),
        nodeCount: 1_600,
        largestWeakComponentNodeCount: 1_000,
      },
      goldenRouteStatuses: Array(23).fill('ok'),
      previous: {
        id: 'old', segmentCount: 1_226, nodeCount: 1_200, edgeCount: 2_400,
        largestWeakComponentNodeCount: 900,
      },
    })

    expect(result.checks.largestComponentShare).toBe(true)
    expect(result.checks.largestComponentShareStable).toBe(false)
    expect(result.ok).toBe(false)
  })

  it('accepts a small connectivity change relative to the active snapshot', () => {
    const result = validateRoadGraphSnapshot({
      // The raw largest component shrinks, but its normalized share remains
      // within 90% of the active baseline.
      diagnostics: {
        ...diagnostics(),
        nodeCount: 1_300,
        largestWeakComponentNodeCount: 850,
      },
      goldenRouteStatuses: Array(23).fill('ok'),
      previous: {
        id: 'old', segmentCount: 1_226, nodeCount: 1_500, edgeCount: 2_400,
        largestWeakComponentNodeCount: 1_000,
      },
    })

    expect(result.checks.largestComponentShare).toBe(true)
    expect(result.checks.largestComponentShareStable).toBe(true)
    expect(result.ok).toBe(true)
  })

  it('accepts the measured reciprocal-v1 to strict exact-vertex-v2 topology expansion', () => {
    const result = validateRoadGraphSnapshot({
      diagnostics: {
        ...diagnostics(),
        nodeCount: 2_009,
        edgeCount: 4_400,
        weakComponentCount: 29,
        largestWeakComponentNodeCount: 1_935,
        derivedSpeedEdgeCount: 3_752,
        topologyConnectorEdgeCount: 648,
        surfaceEdgeCounts: { paved: 3_500, gravel: 252, mixed: 0, unknown: 0 },
      },
      goldenRouteStatuses: Array(23).fill('ok'),
      previous: {
        id: 'reciprocal-v1',
        segmentCount: 1_226,
        nodeCount: 1_692,
        edgeCount: 3_132,
        largestWeakComponentNodeCount: 1_117,
      },
    })

    expect(result.ok).toBe(true)
    expect(result.checks.nodeCountStable).toBe(true)
    expect(result.checks.edgeCountStable).toBe(true)
    expect(result.checks.largestComponentShareStable).toBe(true)
  })

  it('rejects a suspicious count collapse relative to the active snapshot', () => {
    const result = validateRoadGraphSnapshot({
      diagnostics: diagnostics(1_050),
      goldenRouteStatuses: Array(23).fill('ok'),
      previous: {
        id: 'old', segmentCount: 2_000, nodeCount: 1_363, edgeCount: 2_400,
        largestWeakComponentNodeCount: 1_300,
      },
    })
    expect(result.ok).toBe(false)
    expect(result.checks.segmentCountStable).toBe(false)
  })
})
