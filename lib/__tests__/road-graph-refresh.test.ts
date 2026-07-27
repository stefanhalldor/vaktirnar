import { beforeEach, describe, expect, it, vi } from 'vitest'

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

import {
  refreshRoadGraphSnapshot,
  validateRoadGraphSnapshot,
} from '@/lib/iceland-routes/roadGraphRefresh.server'

const SEGMENTS = [{
  id: '1', source: 'vegagerdin', sourceId: '1',
  geometry: [{ lat: 64, lon: -22 }, { lat: 65, lon: -21 }],
  roadClass: 'trunk', surface: 'paved', direction: 'both',
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
  }
}

const GOLDEN = Array.from({ length: 20 }, (_, index) => ({ id: `route-${index}`, status: 'ok' }))

describe('road graph snapshot refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
    mocks.stage.mockResolvedValue(undefined)
    mocks.promote.mockResolvedValue(undefined)
    mocks.prune.mockResolvedValue(undefined)
    mocks.fail.mockResolvedValue(undefined)
  })

  it('stages and atomically promotes only after validation passes', async () => {
    const result = await refreshRoadGraphSnapshot('admin')

    expect(result).toMatchObject({ status: 'ok', snapshotId: 'snapshot-new', goldenRoutePassCount: 20 })
    expect(mocks.stage).toHaveBeenCalledOnce()
    expect(mocks.promote).toHaveBeenCalledWith('snapshot-new')
    expect(mocks.fail).not.toHaveBeenCalled()
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
    mocks.readActive.mockResolvedValue({ id: 'snapshot-old', sourceContentSha256: 'same' })
    mocks.hashSegments.mockReturnValue('same')

    await expect(refreshRoadGraphSnapshot('cron')).resolves.toEqual({
      status: 'skipped', reason: 'unchanged', activeSnapshotId: 'snapshot-old',
    })
    expect(mocks.unchanged).toHaveBeenCalledWith(expect.objectContaining({ activeSnapshotId: 'snapshot-old' }))
    expect(mocks.buildGraph).not.toHaveBeenCalled()
    expect(mocks.promote).not.toHaveBeenCalled()
  })

  it('rebuilds unchanged source when the active immutable object is corrupt', async () => {
    mocks.readActive.mockReset()
    mocks.readActive
      .mockResolvedValueOnce({ id: 'snapshot-old', sourceContentSha256: 'same' })
      .mockResolvedValueOnce({ id: 'snapshot-new' })
    mocks.hashSegments.mockReturnValue('same')
    mocks.readPayload.mockRejectedValue(new Error('missing object'))

    await expect(refreshRoadGraphSnapshot('cron')).resolves.toMatchObject({
      status: 'ok', snapshotId: 'snapshot-new',
    })
    expect(mocks.buildGraph).toHaveBeenCalledOnce()
    expect(mocks.promote).toHaveBeenCalledWith('snapshot-new')
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
