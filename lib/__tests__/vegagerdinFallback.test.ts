import { describe, it, expect } from 'vitest'
import { vegagerdinHasNoUsableLayer } from '@/lib/weather/vegagerdinFallback'

describe('vegagerdinHasNoUsableLayer', () => {
  const OK_WITH_STATIONS = { status: 'ok', stations: [{}] } as const
  const OK_EMPTY = { status: 'ok', stations: [] } as const
  const UNAVAILABLE = { status: 'unavailable', stations: [] } as const

  // Still loading — never fall back mid-load.
  it('returns false when still loading', () => {
    expect(vegagerdinHasNoUsableLayer({
      loading: true,
      restricted: false,
      loadError: false,
      data: null,
    })).toBe(false)
  })

  it('returns false when loading even if also restricted', () => {
    expect(vegagerdinHasNoUsableLayer({
      loading: true,
      restricted: true,
      loadError: false,
      data: null,
    })).toBe(false)
  })

  // Access-restricted — no usable layer.
  it('returns true when restricted and not loading', () => {
    expect(vegagerdinHasNoUsableLayer({
      loading: false,
      restricted: true,
      loadError: false,
      data: null,
    })).toBe(true)
  })

  // Load error — no usable layer.
  it('returns true when loadError and not loading', () => {
    expect(vegagerdinHasNoUsableLayer({
      loading: false,
      restricted: false,
      loadError: true,
      data: null,
    })).toBe(true)
  })

  // Data never arrived (null after settle) — no usable layer.
  it('returns true when data is null after settling', () => {
    expect(vegagerdinHasNoUsableLayer({
      loading: false,
      restricted: false,
      loadError: false,
      data: null,
    })).toBe(true)
  })

  // Cache returned unavailable status — no usable layer.
  it('returns true when status is unavailable', () => {
    expect(vegagerdinHasNoUsableLayer({
      loading: false,
      restricted: false,
      loadError: false,
      data: UNAVAILABLE,
    })).toBe(true)
  })

  // Cache returned ok but empty stations — no usable layer.
  it('returns true when status ok but stations is empty', () => {
    expect(vegagerdinHasNoUsableLayer({
      loading: false,
      restricted: false,
      loadError: false,
      data: OK_EMPTY,
    })).toBe(true)
  })

  // Has data with stations — usable layer exists.
  it('returns false when status ok with at least one station', () => {
    expect(vegagerdinHasNoUsableLayer({
      loading: false,
      restricted: false,
      loadError: false,
      data: OK_WITH_STATIONS,
    })).toBe(false)
  })
})
