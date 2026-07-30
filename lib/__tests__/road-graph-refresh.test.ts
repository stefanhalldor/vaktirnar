import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ORIGINAL_EXACT_VERTEX_V2_FLAG =
  process.env.TESKEID_ROAD_GRAPH_EXACT_VERTEX_V2_ENABLED

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
  ICELAND_GOLDEN_ROUTES: Array.from({ length: 20 }, (_, index) => ({ id: `route-${index}` })),
}))

vi.mock('@/lib/iceland-routes/roadGraphExactVertexV2Regression.server', () => ({
  auditExactVertexV2VidibakkiRoute: mocks.auditExactVertexV2,
}))

vi.mock('@/lib/iceland-routes/vegagerdinRoadGraphTopology', () => ({
  reconcileVegagerdinRoadGraphTopology: mocks.reconcileTopology,
  VEGAGERDIN_TOPOLOGY_RECONCILIATION_POLICY_ID_V1: 'vegagerdin-reciprocal-section-endpoints-v1',
  VEGAGERDIN_TOPOLOGY_RECONCILIATION_POLICY_ID_V2: 'vegagerdin-attested-section-junctions-v2',
}))

import {
  ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT,
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

const GOLDEN = Array.from({ length: 20 }, (_, index) => ({ id: `route-${index}`, status: 'ok' }))

function runtimeBuildContract(
  policyFingerprint: RoadGraphRuntimeBuildPolicyFingerprint =
    ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT,
) {
  return {
    schemaVersion: 1 as const,
    policyFingerprint,
    diagnostics: diagnostics(),
    goldenRoutePassCount: 20,
    goldenRouteTotalCount: 20,
    topologyReceiptIds: [],
  }
}

function enhancedPayload(
  policyFingerprint: RoadGraphRuntimeBuildPolicyFingerprint =
    ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT,
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
    process.env.TESKEID_ROAD_GRAPH_EXACT_VERTEX_V2_ENABLED = 'true'
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
      return
    }
    process.env.TESKEID_ROAD_GRAPH_EXACT_VERTEX_V2_ENABLED =
      ORIGINAL_EXACT_VERTEX_V2_FLAG
  })

  it('stages and atomically promotes only after validation passes', async () => {
    const result = await refreshRoadGraphSnapshot('admin')

    expect(result).toMatchObject({ status: 'ok', snapshotId: 'snapshot-new', goldenRoutePassCount: 20 })
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
      policyFingerprint: ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT,
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
      policyFingerprint: ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT,
    })
    expect(mocks.buildGraph).not.toHaveBeenCalled()
    expect(mocks.promote).not.toHaveBeenCalled()
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
          policyFingerprint: ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT,
        }),
      }),
    }))
    expect(mocks.promote).toHaveBeenCalledWith('snapshot-new')
  })

  it('forces the first rebuild when the same-source active v1 lacks the build-policy fingerprint', async () => {
    mocks.readActive.mockReset()
    mocks.readActive
      .mockResolvedValueOnce({ id: 'snapshot-old', sourceContentSha256: 'same', validation: {} })
      .mockResolvedValueOnce({ id: 'snapshot-new' })
    mocks.hashSegments.mockReturnValue('same')

    await expect(refreshRoadGraphSnapshot('cron')).resolves.toMatchObject({
      status: 'ok', snapshotId: 'snapshot-new',
    })
    expect(mocks.unchanged).not.toHaveBeenCalled()
    expect(mocks.stage).toHaveBeenCalledOnce()
    expect(mocks.promote).toHaveBeenCalledWith('snapshot-new')
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
      goldenRouteStatuses: Array(20).fill('ok'),
    }).ok).toBe(true)
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
      goldenRouteStatuses: Array(20).fill('ok'),
    })

    expect(result.ok).toBe(true)
    expect(result.largestComponentShare).toBeCloseTo(0.626559, 6)
    expect(result.checks.largestComponentShare).toBe(true)
    expect(result.checks.largestComponentShareStable).toBe(true)
  })

  it('rejects a bootstrap below the absolute connectivity floor', () => {
    const result = validateRoadGraphSnapshot({
      diagnostics: { ...diagnostics(), largestWeakComponentNodeCount: 817 },
      goldenRouteStatuses: Array(20).fill('ok'),
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
      goldenRouteStatuses: Array(20).fill('ok'),
    })

    expect(result.largestComponentShare).toBe(0.60)
    expect(result.checks.largestComponentShare).toBe(true)
    expect(result.ok).toBe(true)
  })

  it('requires all 20 golden-route results even when every supplied result passes', () => {
    const result = validateRoadGraphSnapshot({
      diagnostics: diagnostics(),
      goldenRouteStatuses: Array(19).fill('ok'),
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
      goldenRouteStatuses: Array(20).fill('ok'),
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
      goldenRouteStatuses: Array(20).fill('ok'),
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
      goldenRouteStatuses: Array(20).fill('ok'),
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
      goldenRouteStatuses: Array(20).fill('ok'),
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
      goldenRouteStatuses: Array(20).fill('ok'),
      previous: {
        id: 'old', segmentCount: 2_000, nodeCount: 1_363, edgeCount: 2_400,
        largestWeakComponentNodeCount: 1_300,
      },
    })
    expect(result.ok).toBe(false)
    expect(result.checks.segmentCountStable).toBe(false)
  })
})
