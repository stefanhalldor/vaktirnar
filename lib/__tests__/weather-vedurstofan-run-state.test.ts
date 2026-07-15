import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

// ── Fluent proxy mock ─────────────────────────────────────────────────────────
// Returns itself for any method call, except maybeSingle which is controllable.
// filterCalls records each chained method call so tests can assert query contracts.
// The `then: undefined` guard prevents Vitest from treating the proxy as a Promise.

const mockMaybeSingle = vi.fn()
const filterCalls: Array<{ method: string; args: unknown[] }> = []

function makeFluentProxy(): object {
  return new Proxy({}, {
    get(_target, prop: string) {
      if (prop === 'maybeSingle') return mockMaybeSingle
      if (prop === 'then') return undefined
      return (...args: unknown[]) => {
        filterCalls.push({ method: prop as string, args })
        return makeFluentProxy()
      }
    },
  })
}

vi.mock('@/lib/supabase/admin', () => ({
  getAdmin: () => ({
    from: () => makeFluentProxy(),
  }),
}))

vi.mock('@/lib/weather/providers/vedurstofanStationsRegistry', () => ({
  VEDURSTOFAN_STATIONS_REGISTRY: [],
}))

import {
  getVedurstofanRunState,
  insertVedurstofanRunningRow,
} from '@/lib/weather/providers/vedurstofan.server'

beforeEach(() => {
  vi.clearAllMocks()
  filterCalls.length = 0
})

// ── getVedurstofanRunState ────────────────────────────────────────────────────

describe('getVedurstofanRunState', () => {
  it('returns alreadyFresh when a run has result_atime matching the expected cycle', async () => {
    // First maybeSingle (alreadyFresh query) returns a row
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: 1 } })

    const result = await getVedurstofanRunState('2026-07-12T09:00:00Z')

    expect(result.state).toBe('alreadyFresh')
    // Should short-circuit after the first query
    expect(mockMaybeSingle).toHaveBeenCalledTimes(1)
  })

  it('does NOT return alreadyFresh when result_atime is stale (DB returns no matching row)', async () => {
    // alreadyFresh query: no row (stale result_atime did not satisfy gte filter)
    mockMaybeSingle.mockResolvedValueOnce({ data: null })
    // running query: no row
    mockMaybeSingle.mockResolvedValueOnce({ data: null })
    // recentlyAttempted query: no row
    mockMaybeSingle.mockResolvedValueOnce({ data: null })

    const result = await getVedurstofanRunState('2026-07-12T09:00:00Z')

    expect(result.state).toBe('available')
    expect(mockMaybeSingle).toHaveBeenCalledTimes(3)
  })

  it('returns running when a running row exists for the expected cycle', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null })      // not fresh
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: 42 } }) // running row found

    const result = await getVedurstofanRunState('2026-07-12T09:00:00Z')

    expect(result.state).toBe('running')
    expect(mockMaybeSingle).toHaveBeenCalledTimes(2)
  })

  it('returns recentlyAttempted when a manual run finished within the cooldown window', async () => {
    const recentIso = new Date(Date.now() - 60_000).toISOString()
    mockMaybeSingle.mockResolvedValueOnce({ data: null })                           // not fresh
    mockMaybeSingle.mockResolvedValueOnce({ data: null })                           // not running
    mockMaybeSingle.mockResolvedValueOnce({ data: { finished_at: recentIso } })     // recently attempted

    const result = await getVedurstofanRunState('2026-07-12T09:00:00Z')

    expect(result.state).toBe('recentlyAttempted')
    if (result.state === 'recentlyAttempted') {
      expect(result.lastAttemptIso).toBe(recentIso)
    }
    expect(mockMaybeSingle).toHaveBeenCalledTimes(3)
  })

  it('returns available when no relevant runs exist', async () => {
    mockMaybeSingle
      .mockResolvedValueOnce({ data: null })
      .mockResolvedValueOnce({ data: null })
      .mockResolvedValueOnce({ data: null })

    const result = await getVedurstofanRunState('2026-07-12T09:00:00Z')

    expect(result.state).toBe('available')
  })

  it('returns available (fail-open) on DB error', async () => {
    mockMaybeSingle.mockRejectedValueOnce(new Error('DB connection refused'))

    const result = await getVedurstofanRunState('2026-07-12T09:00:00Z')

    expect(result.state).toBe('available')
  })

  it('alreadyFresh query filters by result_atime, not finished_at', async () => {
    // First query returns a row (alreadyFresh path)
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: 1 } })

    await getVedurstofanRunState('2026-07-12T09:00:00Z')

    // Collect all column names passed to not() and gte() in the first query
    const columnArgs = filterCalls
      .filter(c => c.method === 'not' || c.method === 'gte')
      .map(c => c.args[0] as string)

    expect(columnArgs).toContain('result_atime')
    expect(columnArgs).not.toContain('finished_at')
  })
})

// ── insertVedurstofanRunningRow ───────────────────────────────────────────────

describe('insertVedurstofanRunningRow', () => {
  it('returns the inserted row id on success', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: 7 } })

    const result = await insertVedurstofanRunningRow('2026-07-12T09:00:00Z', 'manual', 'user-abc')

    expect(result).toBe(7)
  })

  it('returns null when unique index conflict prevents duplicate running row', async () => {
    // Simulate unique constraint violation (concurrent request already inserted)
    mockMaybeSingle.mockRejectedValueOnce(Object.assign(new Error('duplicate key value'), { code: '23505' }))

    const result = await insertVedurstofanRunningRow('2026-07-12T09:00:00Z', 'manual', 'user-abc')

    expect(result).toBeNull()
  })

  it('returns null when insert returns no data', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null })

    const result = await insertVedurstofanRunningRow('2026-07-12T09:00:00Z', 'manual', 'user-abc')

    expect(result).toBeNull()
  })
})
