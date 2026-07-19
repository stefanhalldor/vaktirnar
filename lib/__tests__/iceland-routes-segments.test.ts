import { describe, it, expect } from 'vitest'
import { ICELAND_ROUTE_SEGMENTS, getIcelandSegment } from '@/lib/iceland-routes/segments'

const ASCII_SLUG_RE = /^[a-z0-9-]+$/

describe('ICELAND_ROUTE_SEGMENTS', () => {
  it('all segment IDs are ASCII slug-safe', () => {
    for (const seg of ICELAND_ROUTE_SEGMENTS) {
      expect(
        ASCII_SLUG_RE.test(seg.id),
        `Segment ID "${seg.id}" contains non-ASCII or non-slug characters`,
      ).toBe(true)
    }
  })

  it('all segment IDs are unique', () => {
    const ids = ICELAND_ROUTE_SEGMENTS.map(s => s.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  it('every segment with empty geometry is marked verified: false', () => {
    for (const seg of ICELAND_ROUTE_SEGMENTS) {
      if (seg.geometry.length === 0) {
        expect(
          seg.verified,
          `Segment "${seg.id}" has empty geometry but verified=true`,
        ).toBe(false)
      }
    }
  })

  it('every segment has a non-empty name', () => {
    for (const seg of ICELAND_ROUTE_SEGMENTS) {
      expect(seg.name.trim().length).toBeGreaterThan(0)
    }
  })
})

describe('getIcelandSegment', () => {
  it('returns the Hólmavík segment by ASCII ID', () => {
    const seg = getIcelandSegment('holmavik-sudurleid')
    expect(seg).toBeDefined()
    expect(seg?.id).toBe('holmavik-sudurleid')
    expect(seg?.name).toContain('Hólmavík')
  })

  it('returns the ring-road-vik-west segment', () => {
    const seg = getIcelandSegment('ring-road-vik-west')
    expect(seg).toBeDefined()
    expect(seg?.routeNumbers).toContain('1')
  })

  it('returns the Öxi segment with seasonal suitability', () => {
    const seg = getIcelandSegment('oxi-axarvegur')
    expect(seg).toBeDefined()
    expect(seg?.suitability).toBe('seasonal_or_unknown')
  })

  it('returns undefined for an unknown ID', () => {
    expect(getIcelandSegment('does-not-exist')).toBeUndefined()
  })
})
