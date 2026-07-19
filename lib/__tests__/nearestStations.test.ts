/**
 * Unit tests for lib/weather/nearestStations.ts
 *
 * Covers: haversine formula correctness, nearest-N selection,
 * tie-breaking by stationId, exclusion of incomplete candidates.
 */

import { describe, it, expect } from 'vitest'
import { haversineDistanceM, findNearestStations } from '@/lib/weather/nearestStations'

// ── haversineDistanceM ────────────────────────────────────────────────────────

describe('haversineDistanceM', () => {
  it('returns 0 for identical coordinates', () => {
    expect(haversineDistanceM({ lat: 64.0, lon: -21.9 }, { lat: 64.0, lon: -21.9 })).toBe(0)
  })

  it('returns approximate distance between Reykjavik and Akureyri (~247 km straight-line)', () => {
    // Reykjavik: 64.14, -21.89 / Akureyri: 65.68, -18.1
    const d = haversineDistanceM({ lat: 64.14, lon: -21.89 }, { lat: 65.68, lon: -18.1 })
    expect(d).toBeGreaterThan(240_000)
    expect(d).toBeLessThan(260_000)
  })

  it('is symmetric', () => {
    const a = { lat: 64.0, lon: -21.9 }
    const b = { lat: 65.5, lon: -18.0 }
    expect(haversineDistanceM(a, b)).toBeCloseTo(haversineDistanceM(b, a), 0)
  })

  it('returns a positive value for distinct points', () => {
    const d = haversineDistanceM({ lat: 64.0, lon: -21.0 }, { lat: 64.1, lon: -21.0 })
    expect(d).toBeGreaterThan(0)
  })
})

// ── findNearestStations ───────────────────────────────────────────────────────

const REF = { lat: 64.0, lon: -21.9 } // near Reykjavik

const CANDIDATES = [
  { stationId: 'S1', name: 'Near', lat: 64.01, lon: -21.9 },   // ~1.1 km
  { stationId: 'S2', name: 'Mid',  lat: 64.1,  lon: -21.9 },   // ~11 km
  { stationId: 'S3', name: 'Far',  lat: 64.5,  lon: -21.9 },   // ~55 km
  { stationId: 'S4', name: 'VFar', lat: 65.0,  lon: -21.9 },   // ~111 km
]

describe('findNearestStations', () => {
  it('returns the N closest stations sorted ascending by distance', () => {
    const result = findNearestStations(REF, CANDIDATES, 3)
    expect(result).toHaveLength(3)
    expect(result[0].stationId).toBe('S1')
    expect(result[1].stationId).toBe('S2')
    expect(result[2].stationId).toBe('S3')
  })

  it('returns all candidates when n >= candidates.length', () => {
    const result = findNearestStations(REF, CANDIDATES, 10)
    expect(result).toHaveLength(4)
  })

  it('returns empty array for empty candidates', () => {
    expect(findNearestStations(REF, [], 3)).toEqual([])
  })

  it('returns empty array when n = 0', () => {
    expect(findNearestStations(REF, CANDIDATES, 0)).toEqual([])
  })

  it('excludes candidates with null lat', () => {
    const withNull = [
      ...CANDIDATES,
      { stationId: 'SX', name: 'NoLat', lat: null, lon: -21.9 },
    ]
    const result = findNearestStations(REF, withNull, 10)
    expect(result.find(s => s.stationId === 'SX')).toBeUndefined()
  })

  it('excludes candidates with null lon', () => {
    const withNull = [
      ...CANDIDATES,
      { stationId: 'SY', name: 'NoLon', lat: 64.0, lon: null },
    ]
    const result = findNearestStations(REF, withNull, 10)
    expect(result.find(s => s.stationId === 'SY')).toBeUndefined()
  })

  it('excludes candidates with null stationId', () => {
    const withNull = [
      ...CANDIDATES,
      { stationId: null, name: 'NoId', lat: 64.0, lon: -21.9 },
    ]
    const result = findNearestStations(REF, withNull, 10)
    expect(result).toHaveLength(4)
  })

  it('breaks ties by stationId alphabetical order', () => {
    // Two stations at same coordinates as REF — distance = 0 for both
    const tied = [
      { stationId: 'ZZZ', name: 'TieZ', lat: REF.lat, lon: REF.lon },
      { stationId: 'AAA', name: 'TieA', lat: REF.lat, lon: REF.lon },
    ]
    const result = findNearestStations(REF, tied, 2)
    expect(result[0].stationId).toBe('AAA')
    expect(result[1].stationId).toBe('ZZZ')
  })

  it('attaches correct distanceM to each result', () => {
    const result = findNearestStations(REF, CANDIDATES, 1)
    expect(result[0].distanceM).toBeGreaterThan(0)
    expect(result[0].distanceM).toBeLessThan(5_000) // S1 is ~1.1 km away
  })

  it('result includes stationId, name, lat, lon, distanceM', () => {
    const result = findNearestStations(REF, CANDIDATES, 1)
    expect(result[0]).toMatchObject({
      stationId: 'S1',
      name: 'Near',
      lat: 64.01,
      lon: -21.9,
    })
    expect(typeof result[0].distanceM).toBe('number')
  })
})
