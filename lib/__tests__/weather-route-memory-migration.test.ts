/**
 * Static checks for sql/86_weather_route_memory.sql
 *
 * Verifies security and schema properties without running SQL.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { dedupeRouteVariants } from '@/lib/iceland-routes/routeMemory.server'

const sql = readFileSync(
  join(process.cwd(), 'sql/86_weather_route_memory.sql'),
  'utf8',
)

describe('sql/86_weather_route_memory.sql — static checks', () => {
  it('wraps in a transaction', () => {
    expect(sql).toMatch(/^begin;/m)
    expect(sql).toMatch(/^commit;/m)
  })

  it('creates weather_route_memory_routes table', () => {
    expect(sql).toMatch(/create table if not exists public\.weather_route_memory_routes/)
  })

  it('creates weather_route_memory_stations table', () => {
    expect(sql).toMatch(/create table if not exists public\.weather_route_memory_stations/)
  })

  it('routes table has unique constraint on route_key', () => {
    expect(sql).toMatch(/unique \(route_key\)|route_key.*unique/)
  })

  it('stations table has composite primary key', () => {
    expect(sql).toMatch(/primary key \(route_id, provider, station_id\)/)
  })

  it('stations table references routes with cascade delete', () => {
    expect(sql).toMatch(/references public\.weather_route_memory_routes\(id\) on delete cascade/)
  })

  it('enables RLS on both tables', () => {
    const rlsMatches = sql.match(/enable row level security/g)
    expect(rlsMatches?.length).toBe(2)
  })

  it('revokes access from anon on routes table', () => {
    // Each revoke is on its own line: "revoke all on public.weather_route_memory_routes  from anon;"
    expect(sql).toMatch(/revoke all on public\.weather_route_memory_routes[\s\S]{0,30}from[\s\S]{0,20}anon/)
  })

  it('revokes access from authenticated on routes table', () => {
    expect(sql).toMatch(/revoke all on public\.weather_route_memory_routes[\s\S]{0,30}from[\s\S]{0,30}authenticated/)
  })

  it('revokes access from anon on stations table', () => {
    expect(sql).toMatch(/revoke all on public\.weather_route_memory_stations[\s\S]{0,30}from[\s\S]{0,20}anon/)
  })

  it('revokes access from authenticated on stations table', () => {
    expect(sql).toMatch(/revoke all on public\.weather_route_memory_stations[\s\S]{0,30}from[\s\S]{0,30}authenticated/)
  })

  it('grants service_role access to routes table', () => {
    expect(sql).toMatch(/grant select, insert, update, delete\s+on public\.weather_route_memory_routes\s+to service_role/)
  })

  it('grants service_role access to stations table', () => {
    expect(sql).toMatch(/grant select, insert, update, delete\s+on public\.weather_route_memory_stations\s+to service_role/)
  })

  it('does not grant anything to anon', () => {
    const grantLines = sql.split('\n').filter(l => l.trim().startsWith('grant'))
    expect(grantLines.every(l => !l.includes('anon'))).toBe(true)
  })

  it('does not grant anything to authenticated', () => {
    const grantLines = sql.split('\n').filter(l => l.trim().startsWith('grant'))
    expect(grantLines.every(l => !l.includes('authenticated'))).toBe(true)
  })

  it('includes rollback instructions in comments', () => {
    expect(sql).toMatch(/Rollback/)
    expect(sql).toMatch(/DROP TABLE IF EXISTS public\.weather_route_memory_stations/)
    expect(sql).toMatch(/DROP TABLE IF EXISTS public\.weather_route_memory_routes/)
  })

  it('has DO NOT RUN warning', () => {
    expect(sql).toMatch(/DO NOT RUN/)
  })

  it('providers check constraint includes vedurstofan and vegagerdin only', () => {
    expect(sql).toMatch(/provider in \('vedurstofan', 'vegagerdin'\)/)
  })

  it('source check constraint includes ferdalagid only', () => {
    expect(sql).toMatch(/source in \('ferdalagid'\)/)
  })

  it('does not store user_id column', () => {
    expect(sql).not.toMatch(/\buser_id\b/)
  })
})

// ── Route-memory variant union ────────────────────────────────────────────────

describe('route-memory variant union — overview station aggregation', () => {
  type Variant = { vedurstofanStationIds: string[]; vegagerdinStationIds: string[] }

  function unionVariants(variants: Variant[]) {
    return {
      vedurstofanIds: new Set(variants.flatMap(v => v.vedurstofanStationIds)),
      vegagerdinIds: new Set(variants.flatMap(v => v.vegagerdinStationIds)),
    }
  }

  it('unions vedurstofan station IDs across two disjoint variants', () => {
    const variants: Variant[] = [
      { vedurstofanStationIds: ['A', 'B'], vegagerdinStationIds: [] },
      { vedurstofanStationIds: ['C'], vegagerdinStationIds: [] },
    ]
    const { vedurstofanIds } = unionVariants(variants)
    expect(vedurstofanIds).toEqual(new Set(['A', 'B', 'C']))
  })

  it('unions vegagerdin station IDs across two disjoint variants', () => {
    const variants: Variant[] = [
      { vedurstofanStationIds: [], vegagerdinStationIds: ['X'] },
      { vedurstofanStationIds: [], vegagerdinStationIds: ['Y', 'Z'] },
    ]
    const { vegagerdinIds } = unionVariants(variants)
    expect(vegagerdinIds).toEqual(new Set(['X', 'Y', 'Z']))
  })

  it('keeps providers independent — vedurstofan and vegagerdin do not cross-contaminate', () => {
    const variants: Variant[] = [
      { vedurstofanStationIds: ['V1'], vegagerdinStationIds: ['G1'] },
      { vedurstofanStationIds: ['V2'], vegagerdinStationIds: ['G2'] },
    ]
    const { vedurstofanIds, vegagerdinIds } = unionVariants(variants)
    expect(vedurstofanIds).toEqual(new Set(['V1', 'V2']))
    expect(vegagerdinIds).toEqual(new Set(['G1', 'G2']))
    expect([...vedurstofanIds].some(id => vegagerdinIds.has(id))).toBe(false)
  })

  it('deduplicates station IDs that appear in multiple variants', () => {
    const variants: Variant[] = [
      { vedurstofanStationIds: ['A', 'B'], vegagerdinStationIds: [] },
      { vedurstofanStationIds: ['B', 'C'], vegagerdinStationIds: [] },
    ]
    const { vedurstofanIds } = unionVariants(variants)
    expect(vedurstofanIds.size).toBe(3)
    expect(vedurstofanIds).toEqual(new Set(['A', 'B', 'C']))
  })

  it('handles a single variant the same as before', () => {
    const variants: Variant[] = [
      { vedurstofanStationIds: ['S1', 'S2'], vegagerdinStationIds: ['G1'] },
    ]
    const { vedurstofanIds, vegagerdinIds } = unionVariants(variants)
    expect(vedurstofanIds).toEqual(new Set(['S1', 'S2']))
    expect(vegagerdinIds).toEqual(new Set(['G1']))
  })
})

// ── Route-memory variant dedupe ───────────────────────────────────────────────

type TestVariant = Parameters<typeof dedupeRouteVariants>[0][number]

function makeVariant(overrides: Partial<TestVariant> & Pick<TestVariant, 'routeVariantKey'>): TestVariant {
  return {
    routeVariantLabel: null,
    lastSeenAt: '2026-01-01T00:00:00Z',
    usageCount: 1,
    vedurstofanStationIds: [],
    vegagerdinStationIds: [],
    routeCautionIds: [],
    ...overrides,
  }
}

describe('dedupeRouteVariants', () => {
  it('returns a single variant unchanged', () => {
    const v = makeVariant({ routeVariantKey: 'CURATED_AVOID_OXI', routeVariantLabel: 'CURATED_AVOID_OXI', vedurstofanStationIds: ['A', 'B'] })
    expect(dedupeRouteVariants([v])).toEqual([v])
  })

  it('collapses two rows with the same CURATED_ label into one', () => {
    const older = makeVariant({ routeVariantKey: 'google-id-1', routeVariantLabel: 'CURATED_AVOID_OXI', vedurstofanStationIds: ['A'] })
    const newer = makeVariant({ routeVariantKey: 'google-id-2', routeVariantLabel: 'CURATED_AVOID_OXI', vedurstofanStationIds: ['A', 'B'], lastSeenAt: '2026-06-01T00:00:00Z' })
    const result = dedupeRouteVariants([older, newer])
    expect(result).toHaveLength(1)
    expect(result[0].vedurstofanStationIds).toEqual(['A', 'B'])
  })

  it('keeps distinct CURATED_ labels as separate pills', () => {
    const oxi = makeVariant({ routeVariantKey: 'CURATED_AVOID_OXI', routeVariantLabel: 'CURATED_AVOID_OXI', vedurstofanStationIds: ['A'] })
    const helli = makeVariant({ routeVariantKey: 'CURATED_VIA_HELLISHEIDI', routeVariantLabel: 'CURATED_VIA_HELLISHEIDI', vedurstofanStationIds: ['B'] })
    const result = dedupeRouteVariants([oxi, helli])
    expect(result).toHaveLength(2)
  })

  it('prefers the row with more total station IDs when labels match', () => {
    const sparse = makeVariant({ routeVariantKey: 'k1', routeVariantLabel: 'CURATED_AVOID_OXI', vedurstofanStationIds: ['A'], vegagerdinStationIds: [] })
    const rich = makeVariant({ routeVariantKey: 'k2', routeVariantLabel: 'CURATED_AVOID_OXI', vedurstofanStationIds: ['A', 'B'], vegagerdinStationIds: ['G1'] })
    const result = dedupeRouteVariants([sparse, rich])
    expect(result).toHaveLength(1)
    expect(result[0].vedurstofanStationIds).toEqual(['A', 'B'])
    expect(result[0].vegagerdinStationIds).toEqual(['G1'])
  })

  it('breaks ties by most recent lastSeenAt', () => {
    const older = makeVariant({ routeVariantKey: 'k1', routeVariantLabel: 'CURATED_AVOID_OXI', vedurstofanStationIds: ['A'], lastSeenAt: '2026-01-01T00:00:00Z' })
    const newer = makeVariant({ routeVariantKey: 'k2', routeVariantLabel: 'CURATED_AVOID_OXI', vedurstofanStationIds: ['B'], lastSeenAt: '2026-07-01T00:00:00Z' })
    const result = dedupeRouteVariants([older, newer])
    expect(result).toHaveLength(1)
    expect(result[0].vedurstofanStationIds).toEqual(['B'])
  })

  it('groups non-curated variants by routeVariantKey, not label', () => {
    const a = makeVariant({ routeVariantKey: 'google-route-abc', routeVariantLabel: null })
    const b = makeVariant({ routeVariantKey: 'google-route-xyz', routeVariantLabel: null })
    const result = dedupeRouteVariants([a, b])
    expect(result).toHaveLength(2)
  })

  it('does not merge a curated and a non-curated variant even if keys differ', () => {
    const curated = makeVariant({ routeVariantKey: 'CURATED_AVOID_OXI', routeVariantLabel: 'CURATED_AVOID_OXI' })
    const raw = makeVariant({ routeVariantKey: 'google-other', routeVariantLabel: null })
    const result = dedupeRouteVariants([curated, raw])
    expect(result).toHaveLength(2)
  })

  // Phase 2: non-curated subset dominance
  it('drops a non-curated variant whose stations are an exact subset of a curated variant', () => {
    const curated = makeVariant({
      routeVariantKey: 'CURATED_VIA_HELLISHEIDI',
      routeVariantLabel: 'CURATED_VIA_HELLISHEIDI',
      vedurstofanStationIds: ['A', 'B', 'C'],
      vegagerdinStationIds: ['G1'],
    })
    const generic = makeVariant({
      routeVariantKey: 'google-leид-1',
      routeVariantLabel: null,
      vedurstofanStationIds: ['A', 'B'],
      vegagerdinStationIds: [],
    })
    const result = dedupeRouteVariants([curated, generic])
    expect(result).toHaveLength(1)
    expect(result[0].routeVariantLabel).toBe('CURATED_VIA_HELLISHEIDI')
  })

  it('keeps a non-curated variant whose stations are NOT a subset of any curated variant', () => {
    const curated = makeVariant({
      routeVariantKey: 'CURATED_VIA_HELLISHEIDI',
      routeVariantLabel: 'CURATED_VIA_HELLISHEIDI',
      vedurstofanStationIds: ['A', 'B'],
      vegagerdinStationIds: [],
    })
    const generic = makeVariant({
      routeVariantKey: 'google-leið-extra',
      routeVariantLabel: null,
      vedurstofanStationIds: ['A', 'Z'],  // Z not in curated
      vegagerdinStationIds: [],
    })
    const result = dedupeRouteVariants([curated, generic])
    expect(result).toHaveLength(2)
  })

  it('drops a non-curated variant with zero stations when a sibling variant has stations (Phase 3)', () => {
    const curated = makeVariant({
      routeVariantKey: 'CURATED_AVOID_OXI',
      routeVariantLabel: 'CURATED_AVOID_OXI',
      vedurstofanStationIds: ['A', 'B'],
    })
    const empty = makeVariant({ routeVariantKey: 'google-empty', routeVariantLabel: null })
    const result = dedupeRouteVariants([curated, empty])
    expect(result).toHaveLength(1)
    expect(result[0].routeVariantLabel).toBe('CURATED_AVOID_OXI')
  })

  it('keeps all variants when every variant has zero stations (Phase 3 no-op)', () => {
    const a = makeVariant({ routeVariantKey: 'google-a', routeVariantLabel: null })
    const b = makeVariant({ routeVariantKey: 'google-b', routeVariantLabel: null })
    const result = dedupeRouteVariants([a, b])
    expect(result).toHaveLength(2)
  })

  it('drops only the zero-station variant when mixed with non-empty sibling (Phase 3)', () => {
    const rich = makeVariant({
      routeVariantKey: 'google-rich',
      routeVariantLabel: null,
      vedurstofanStationIds: ['X', 'Y'],
    })
    const empty = makeVariant({ routeVariantKey: 'google-empty', routeVariantLabel: null })
    const result = dedupeRouteVariants([rich, empty])
    expect(result).toHaveLength(1)
    expect(result[0].routeVariantKey).toBe('google-rich')
  })

  it('preserves routeCautionIds on variants that survive deduplication', () => {
    const curated = makeVariant({
      routeVariantKey: 'CURATED_AVOID_OXI',
      routeVariantLabel: 'CURATED_AVOID_OXI',
      vedurstofanStationIds: ['A', 'B'],
      routeCautionIds: ['oxi'],
    })
    const result = dedupeRouteVariants([curated])
    expect(result).toHaveLength(1)
    expect(result[0].routeCautionIds).toEqual(['oxi'])
  })
})
