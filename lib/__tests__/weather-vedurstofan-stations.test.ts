import { describe, it, expect } from 'vitest'
import {
  VEDURSTOFAN_STATIONS,
  mapRoutePointToVedurstofanStation,
  getUniqueStationIdsForRoute,
  type VedurstofanStation,
} from '@/lib/weather/providers/vedurstofanStations'

// ── Station list integrity ────────────────────────────────────────────────────

describe('VEDURSTOFAN_STATIONS list integrity', () => {
  it('all station longitudes are negative (Iceland is west of Greenwich)', () => {
    for (const station of VEDURSTOFAN_STATIONS) {
      expect(station.lon).toBeLessThan(0)
    }
  })

  it('all station latitudes are within Iceland bounds (63–67°N)', () => {
    for (const station of VEDURSTOFAN_STATIONS) {
      expect(station.lat).toBeGreaterThan(63)
      expect(station.lat).toBeLessThan(67)
    }
  })

  it('all station IDs are non-empty strings', () => {
    for (const station of VEDURSTOFAN_STATIONS) {
      expect(typeof station.stationId).toBe('string')
      expect(station.stationId.length).toBeGreaterThan(0)
    }
  })

  it('no duplicate station IDs', () => {
    const ids = VEDURSTOFAN_STATIONS.map(s => s.stationId)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  it('default station list only contains verified coordinates', () => {
    for (const station of VEDURSTOFAN_STATIONS) {
      expect(station.coordinatesVerified).toBe(true)
    }
  })

  it('includes route-focused coverage stations for routes 1, 41, 48 and 51', () => {
    const ids = new Set(VEDURSTOFAN_STATIONS.map(s => s.stationId))
    expect(VEDURSTOFAN_STATIONS.length).toBeGreaterThanOrEqual(25)
    for (const expectedId of [
      '31363', // Reykjanesbraut / Route 41
      '31572', // Akrafjall / Route 51
      '31579', // Kjalarnes / Route 48 approach
      '31392', // Hellisheiði / Route 1
      '36049', // Reynisfjall / south coast Route 1
      '5544',  // Höfn / southeast Route 1
      '3471',  // Akureyri / north Route 1
      '32097', // Holtavörðuheiði / west Route 1
    ]) {
      expect(ids.has(expectedId)).toBe(true)
    }
  })
})

// ── Verified station coordinates ──────────────────────────────────────────────

describe('verified station coordinates', () => {
  it('keeps known official station coordinates in WGS84 with negative longitude', () => {
    const knownStations = [
      { stationId: '31475', lat: 64.0797, lon: -21.9029 }, // Garðabær - Kauptún
      { stationId: '31392', lat: 64.0188, lon: -21.3424 }, // Hellisheiði
      { stationId: '571', lat: 65.2830, lon: -14.4025 },  // Egilsstaðaflugvöllur
      { stationId: '5544', lat: 64.2691, lon: -15.2135 }, // Höfn í Hornafirði
    ]

    for (const expected of knownStations) {
      const station = VEDURSTOFAN_STATIONS.find(s => s.stationId === expected.stationId)
      expect(station).toBeDefined()
      expect(station!.lat).toBeCloseTo(expected.lat, 3)
      expect(station!.lon).toBeCloseTo(expected.lon, 3)
      expect(station!.coordinatesVerified).toBe(true)
    }
  })
})

// ── mapRoutePointToVedurstofanStation ─────────────────────────────────────────

describe('mapRoutePointToVedurstofanStation', () => {
  it('returns null for empty station list', () => {
    const result = mapRoutePointToVedurstofanStation({ lat: 64.0, lon: -21.3 }, [])
    expect(result).toBeNull()
  })

  it('maps a point at exact station coordinates with near-zero distance', () => {
    const result = mapRoutePointToVedurstofanStation({ lat: 64.0188, lon: -21.3424 })
    expect(result).not.toBeNull()
    expect(result!.station.stationId).toBe('31392')
    expect(result!.distanceFromRoutePointM).toBeLessThan(10)
  })

  it("returns 'good' confidence for a point within 5 km of Hellisheiði", () => {
    // ~0.02° lat ≈ 2.2 km north of Hellisheiði
    const result = mapRoutePointToVedurstofanStation({ lat: 64.038, lon: -21.3424 })
    expect(result!.station.stationId).toBe('31392')
    expect(result!.confidence).toBe('good')
  })

  it("returns 'ok' confidence for a point 5–15 km from nearest station", () => {
    // ~0.1° lat ≈ 11 km north of Hellisheiði — still closer to Hellisheiði than others
    const result = mapRoutePointToVedurstofanStation({ lat: 64.12, lon: -21.3424 })
    expect(result!.station.stationId).toBe('31392')
    expect(result!.confidence).toBe('ok')
    expect(result!.distanceFromRoutePointM).toBeGreaterThan(5_000)
    expect(result!.distanceFromRoutePointM).toBeLessThanOrEqual(15_000)
  })

  it("returns 'weak' confidence for a point 15–50 km from nearest station", () => {
    // ~0.3° lat ≈ 33 km north of Hellisheiði
    const result = mapRoutePointToVedurstofanStation({ lat: 64.32, lon: -21.3424 })
    expect(result!.confidence).toBe('weak')
    expect(result!.distanceFromRoutePointM).toBeGreaterThan(15_000)
    expect(result!.distanceFromRoutePointM).toBeLessThanOrEqual(50_000)
  })

  it("returns 'unavailable' confidence for a point far from all stations", () => {
    // Remote area with no nearby stations — middle of Sprengisandur
    const result = mapRoutePointToVedurstofanStation({ lat: 64.7, lon: -18.0 })
    expect(result!.confidence).toBe('unavailable')
    expect(result!.distanceFromRoutePointM).toBeGreaterThan(50_000)
  })

  it('selects the nearest of multiple stations', () => {
    const twoStations: VedurstofanStation[] = [
      { stationId: 'A', stationName: 'Station A', lat: 64.0, lon: -21.0, owner: 'X', coordinatesVerified: false },
      { stationId: 'B', stationName: 'Station B', lat: 65.0, lon: -21.0, owner: 'X', coordinatesVerified: false },
    ]
    // Point closer to A
    const resultA = mapRoutePointToVedurstofanStation({ lat: 64.1, lon: -21.0 }, twoStations)
    expect(resultA!.station.stationId).toBe('A')

    // Point closer to B
    const resultB = mapRoutePointToVedurstofanStation({ lat: 64.9, lon: -21.0 }, twoStations)
    expect(resultB!.station.stationId).toBe('B')
  })

  it('distanceFromRoutePointM is rounded to whole metres', () => {
    const result = mapRoutePointToVedurstofanStation({ lat: 64.02, lon: -21.34 })
    expect(Number.isInteger(result!.distanceFromRoutePointM)).toBe(true)
  })

  it('maps representative route points to the expected expanded stations', () => {
    const points = [
      { point: { lat: 64.0027, lon: -22.2296 }, stationId: '31363' }, // Reykjanesbraut
      { point: { lat: 64.3105, lon: -21.9660 }, stationId: '31572' }, // Akrafjall
      { point: { lat: 63.9355, lon: -20.9707 }, stationId: '6300' },  // Selfoss
      { point: { lat: 63.4521, lon: -19.0378 }, stationId: '36049' }, // Reynisfjall
      { point: { lat: 65.6961, lon: -18.1113 }, stationId: '3471' },  // Akureyri
      { point: { lat: 64.9899, lon: -21.0576 }, stationId: '32097' }, // Holtavörðuheiði
    ]

    for (const { point, stationId } of points) {
      const result = mapRoutePointToVedurstofanStation(point)
      expect(result!.station.stationId).toBe(stationId)
      expect(result!.confidence).toBe('good')
    }
  })
})

// ── getUniqueStationIdsForRoute ───────────────────────────────────────────────

describe('getUniqueStationIdsForRoute', () => {
  it('returns empty array for empty route points', () => {
    expect(getUniqueStationIdsForRoute([])).toEqual([])
  })

  it('returns empty array for empty station list', () => {
    const result = getUniqueStationIdsForRoute([{ lat: 64.0, lon: -21.0 }], [])
    expect(result).toEqual([])
  })

  it('deduplicates station IDs when multiple route points map to the same station', () => {
    // Two nearby points that both map to Hellisheiði
    const pts = [
      { lat: 64.0188, lon: -21.3424 },
      { lat: 64.02, lon: -21.35 },
    ]
    const ids = getUniqueStationIdsForRoute(pts)
    expect(ids).toHaveLength(1)
    expect(ids[0]).toBe('31392')
  })

  it('excludes points with unavailable confidence from the result', () => {
    // One point near Hellisheiði (good), one far from all stations (unavailable)
    const pts = [
      { lat: 64.0188, lon: -21.3424 }, // near Hellisheiði
      { lat: 64.7, lon: -18.0 },       // middle of nowhere
    ]
    const ids = getUniqueStationIdsForRoute(pts)
    expect(ids).toContain('31392')
    // Result should not contain any station mapped from the remote point
    // (it may appear if a station happens to be nearest AND within 50km — the
    //  remote point test case is specifically chosen to be > 50km from all stations)
    expect(ids).toHaveLength(1)
  })

  it('returns multiple unique station IDs for a route spanning different stations', () => {
    const pts = [
      { lat: 64.0188, lon: -21.3424 }, // Hellisheiði area → 31392
      { lat: 65.2833, lon: -14.4017 }, // Egilsstaðir area → 571
    ]
    const ids = getUniqueStationIdsForRoute(pts)
    expect(ids).toContain('31392')
    expect(ids).toContain('571')
    expect(ids).toHaveLength(2)
  })
})
