import { describe, it, expect } from 'vitest'
import {
  isVestmannaeyjarDestination,
  VESTMANNAEYJAR_BBOX,
  FERRY_PORTS,
  ferryPortsAreValid,
} from '@/lib/weather/ferryPorts'
import { validateIcelandicCoords } from '@/lib/weather/coords'

// ── isVestmannaeyjarDestination ───────────────────────────────────────────────

describe('isVestmannaeyjarDestination', () => {
  it('returns true for coordinates in the centre of Heimaey', () => {
    // Vestmannaeyjar town centre: approx 63.44°N 20.27°W
    expect(isVestmannaeyjarDestination({ lat: 63.44, lon: -20.27 })).toBe(true)
  })

  it('returns true for coordinates at the southern edge of the bbox', () => {
    expect(isVestmannaeyjarDestination({ lat: VESTMANNAEYJAR_BBOX.minLat, lon: -20.25 })).toBe(true)
  })

  it('returns true for coordinates at the northern edge of the bbox', () => {
    expect(isVestmannaeyjarDestination({ lat: VESTMANNAEYJAR_BBOX.maxLat, lon: -20.25 })).toBe(true)
  })

  it('returns false for Þorlákshöfn (mainland, north of bbox)', () => {
    expect(isVestmannaeyjarDestination({ lat: 63.848, lon: -21.363 })).toBe(false)
  })

  it('returns false for Landeyjahöfn (mainland, north of bbox)', () => {
    expect(isVestmannaeyjarDestination({ lat: 63.557, lon: -20.064 })).toBe(false)
  })

  it('returns false for Reykjavík', () => {
    expect(isVestmannaeyjarDestination({ lat: 64.135, lon: -21.895 })).toBe(false)
  })

  it('returns false for Selfoss', () => {
    expect(isVestmannaeyjarDestination({ lat: 63.934, lon: -20.994 })).toBe(false)
  })

  it('returns false for random mainland coordinate', () => {
    expect(isVestmannaeyjarDestination({ lat: 65.0, lon: -18.5 })).toBe(false)
  })

  it('returns false for coords just outside the bbox even if name contains Vestmannaeyjar', () => {
    // Detection is coordinate-only — text is not a trigger
    expect(isVestmannaeyjarDestination({
      lat: 63.51, // just above maxLat
      lon: -20.25,
      name: 'Vestmannaeyjar',
    })).toBe(false)
  })

  it('returns false for mainland coords with a matching name (Vestmannaeyjar hotel/business)', () => {
    expect(isVestmannaeyjarDestination({
      lat: 64.135,
      lon: -21.895,
      name: 'Hótel Vestmannaeyjar',
      formattedAddress: 'Vestmannaeyjar, Reykjavík, Iceland',
    })).toBe(false)
  })

  it('returns false for mainland coords with formattedAddress containing Heimaey', () => {
    expect(isVestmannaeyjarDestination({
      lat: 63.934,
      lon: -20.994,
      name: 'Guesthouse Heimaey',
      formattedAddress: 'Heimaey Street, Selfoss, Iceland',
    })).toBe(false)
  })

  it('returns false for a mainland place whose name does not match', () => {
    expect(isVestmannaeyjarDestination({
      lat: 64.135,
      lon: -21.895,
      name: 'Reykjavík',
      formattedAddress: 'Reykjavík, Iceland',
    })).toBe(false)
  })
})

// ── Ferry port coordinates ────────────────────────────────────────────────────

describe('FERRY_PORTS', () => {
  it('all ferry ports have valid Icelandic coordinates', () => {
    expect(ferryPortsAreValid()).toBe(true)
  })

  it('Landeyjahöfn coordinates validate individually', () => {
    const p = FERRY_PORTS.landeyjahofn
    expect(validateIcelandicCoords(p.lat, p.lon)).toBe(true)
  })

  it('Þorlákshöfn coordinates validate individually', () => {
    const p = FERRY_PORTS.thorlakshofn
    expect(validateIcelandicCoords(p.lat, p.lon)).toBe(true)
  })

  it('ferry port coordinates are NOT inside the Vestmannaeyjar bbox', () => {
    for (const p of Object.values(FERRY_PORTS)) {
      expect(isVestmannaeyjarDestination({ lat: p.lat, lon: p.lon })).toBe(false)
    }
  })
})
