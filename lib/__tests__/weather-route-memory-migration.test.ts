/**
 * Static checks for sql/86_weather_route_memory.sql
 *
 * Verifies security and schema properties without running SQL.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

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
