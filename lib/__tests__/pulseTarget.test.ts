/**
 * Unit tests for lib/weather/pulseTarget.ts
 *
 * Covers: adapter helpers, href builder output, and provider dispatch.
 */

import { describe, it, expect } from 'vitest'
import {
  vedurstofanStationTarget,
  vegagerdinStationTarget,
  vedurstofanPulseHref,
  vegagerdinPulseHref,
  weatherPulseTargetHref,
} from '@/lib/weather/pulseTarget'

// ── Adapter helpers ────────────────────────────────────────────────────────────

describe('vedurstofanStationTarget', () => {
  it('sets provider, targetType, targetId, targetName', () => {
    const t = vedurstofanStationTarget('31392', 'Akureyri')
    expect(t.provider).toBe('vedurstofan')
    expect(t.targetType).toBe('vedurstofan_station')
    expect(t.targetId).toBe('31392')
    expect(t.targetName).toBe('Akureyri')
  })

  it('carries lat/lon when provided', () => {
    const t = vedurstofanStationTarget('31392', 'Akureyri', { lat: 65.68, lon: -18.1 })
    expect(t.lat).toBe(65.68)
    expect(t.lon).toBe(-18.1)
  })

  it('defaults lat/lon to null when omitted', () => {
    const t = vedurstofanStationTarget('31392', 'Akureyri')
    expect(t.lat).toBeNull()
    expect(t.lon).toBeNull()
  })
})

describe('vegagerdinStationTarget', () => {
  it('sets provider, targetType, targetId, targetName', () => {
    const t = vegagerdinStationTarget('V1234', 'Hellisheiði')
    expect(t.provider).toBe('vegagerdin')
    expect(t.targetType).toBe('vegagerdin_station')
    expect(t.targetId).toBe('V1234')
    expect(t.targetName).toBe('Hellisheiði')
  })

  it('carries lat/lon when provided', () => {
    const t = vegagerdinStationTarget('V1234', 'Hellisheiði', { lat: 64.03, lon: -21.39 })
    expect(t.lat).toBe(64.03)
    expect(t.lon).toBe(-21.39)
  })

  it('defaults lat/lon to null when omitted', () => {
    const t = vegagerdinStationTarget('V1234', 'Hellisheiði')
    expect(t.lat).toBeNull()
    expect(t.lon).toBeNull()
  })
})

// ── vedurstofanPulseHref ───────────────────────────────────────────────────────

describe('vedurstofanPulseHref', () => {
  it('returns base path without returnTo when omitted', () => {
    expect(vedurstofanPulseHref('31392')).toBe('/auth-mvp/vedrid/puls/stod/31392')
  })

  it('appends encoded returnTo when provided', () => {
    const href = vedurstofanPulseHref('31392', '/auth-mvp/vedrid')
    expect(href).toBe('/auth-mvp/vedrid/puls/stod/31392?returnTo=%2Fauth-mvp%2Fvedrid')
  })

  it('encodes complex returnTo with query params', () => {
    const returnTo = '/auth-mvp/vedrid/elta-vedrid?stationId=31392'
    const href = vedurstofanPulseHref('31392', returnTo)
    expect(href).toBe(
      `/auth-mvp/vedrid/puls/stod/31392?returnTo=${encodeURIComponent(returnTo)}`
    )
  })

  it('returns base path when returnTo is empty string', () => {
    expect(vedurstofanPulseHref('31392', '')).toBe('/auth-mvp/vedrid/puls/stod/31392')
  })
})

// ── vegagerdinPulseHref ───────────────────────────────────────────────────────

describe('vegagerdinPulseHref', () => {
  it('returns base path without returnTo when omitted', () => {
    expect(vegagerdinPulseHref('V1234')).toBe('/auth-mvp/vedrid/puls/vegagerdin/stod/V1234')
  })

  it('appends encoded returnTo when provided', () => {
    const href = vegagerdinPulseHref('V1234', '/auth-mvp/vedrid')
    expect(href).toBe('/auth-mvp/vedrid/puls/vegagerdin/stod/V1234?returnTo=%2Fauth-mvp%2Fvedrid')
  })

  it('encodes complex returnTo with query params', () => {
    const returnTo = '/auth-mvp/vedrid?foo=bar'
    const href = vegagerdinPulseHref('V1234', returnTo)
    expect(href).toBe(
      `/auth-mvp/vedrid/puls/vegagerdin/stod/V1234?returnTo=${encodeURIComponent(returnTo)}`
    )
  })

  it('returns base path when returnTo is empty string', () => {
    expect(vegagerdinPulseHref('V1234', '')).toBe('/auth-mvp/vedrid/puls/vegagerdin/stod/V1234')
  })
})

// ── weatherPulseTargetHref ────────────────────────────────────────────────────

describe('weatherPulseTargetHref', () => {
  it('dispatches to vedurstofanPulseHref for vedurstofan provider', () => {
    const target = vedurstofanStationTarget('31392', 'Akureyri')
    expect(weatherPulseTargetHref(target)).toBe('/auth-mvp/vedrid/puls/stod/31392')
  })

  it('passes returnTo through for vedurstofan provider', () => {
    const target = vedurstofanStationTarget('31392', 'Akureyri')
    expect(weatherPulseTargetHref(target, '/auth-mvp/vedrid')).toBe(
      '/auth-mvp/vedrid/puls/stod/31392?returnTo=%2Fauth-mvp%2Fvedrid'
    )
  })

  it('dispatches to vegagerdinPulseHref for vegagerdin provider', () => {
    const target = vegagerdinStationTarget('V1234', 'Hellisheiði')
    expect(weatherPulseTargetHref(target)).toBe('/auth-mvp/vedrid/puls/vegagerdin/stod/V1234')
  })

  it('passes returnTo through for vegagerdin provider', () => {
    const target = vegagerdinStationTarget('V1234', 'Hellisheiði')
    expect(weatherPulseTargetHref(target, '/auth-mvp/vedrid')).toBe(
      '/auth-mvp/vedrid/puls/vegagerdin/stod/V1234?returnTo=%2Fauth-mvp%2Fvedrid'
    )
  })
})
