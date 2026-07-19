import { describe, it, expect } from 'vitest'
import {
  parseOverviewSelection,
  overviewSelectionUrl,
  overviewSelectionKey,
} from '@/lib/weather/overviewSelectionUrl'

describe('parseOverviewSelection', () => {
  it('returns null when stationId is absent', () => {
    const params = new URLSearchParams('')
    expect(parseOverviewSelection(params)).toBeNull()
  })

  it('returns selection with explicit provider', () => {
    const params = new URLSearchParams('provider=vegagerdin&stationId=V1234')
    expect(parseOverviewSelection(params)).toEqual({ provider: 'vegagerdin', stationId: 'V1234' })
  })

  it('falls back to vedurstofan for legacy URLs with only stationId', () => {
    const params = new URLSearchParams('stationId=31392')
    expect(parseOverviewSelection(params)).toEqual({ provider: 'vedurstofan', stationId: '31392' })
  })

  it('returns vedurstofan when provider is explicit vedurstofan', () => {
    const params = new URLSearchParams('provider=vedurstofan&stationId=31392')
    expect(parseOverviewSelection(params)).toEqual({ provider: 'vedurstofan', stationId: '31392' })
  })
})

describe('overviewSelectionUrl', () => {
  it('adds provider and stationId to a plain pathname', () => {
    const result = overviewSelectionUrl('/vedrid', { provider: 'vegagerdin', stationId: 'V1234' })
    expect(result).toBe('/vedrid?provider=vegagerdin&stationId=V1234')
  })

  it('adds provider and stationId to a full URL base', () => {
    const result = overviewSelectionUrl(
      'https://example.com/vedrid?foo=bar',
      { provider: 'vedurstofan', stationId: '31392' }
    )
    expect(result).toBe('/vedrid?foo=bar&provider=vedurstofan&stationId=31392')
  })

  it('clears stationId and provider when selection is null', () => {
    const result = overviewSelectionUrl(
      '/vedrid?provider=vegagerdin&stationId=V1234',
      null
    )
    expect(result).toBe('/vedrid')
  })

  it('replaces existing stationId and provider with new selection', () => {
    const result = overviewSelectionUrl(
      '/vedrid?provider=vedurstofan&stationId=31392',
      { provider: 'vegagerdin', stationId: 'V9999' }
    )
    expect(result).toBe('/vedrid?provider=vegagerdin&stationId=V9999')
  })

  it('preserves unrelated query params when clearing selection', () => {
    const result = overviewSelectionUrl(
      '/vedrid?tab=map&provider=vegagerdin&stationId=V1234',
      null
    )
    expect(result).toBe('/vedrid?tab=map')
  })
})

describe('overviewSelectionKey', () => {
  it('returns empty string for null', () => {
    expect(overviewSelectionKey(null)).toBe('')
  })

  it('returns composite key for a selection', () => {
    expect(overviewSelectionKey({ provider: 'vegagerdin', stationId: 'V1234' })).toBe('vegagerdin:V1234')
  })

  it('differentiates providers with the same stationId', () => {
    const key1 = overviewSelectionKey({ provider: 'vedurstofan', stationId: '100' })
    const key2 = overviewSelectionKey({ provider: 'vegagerdin', stationId: '100' })
    expect(key1).not.toBe(key2)
  })
})
