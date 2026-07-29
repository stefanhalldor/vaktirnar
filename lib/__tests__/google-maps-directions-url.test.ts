import { describe, expect, it } from 'vitest'

import { buildGoogleMapsDirectionsUrl } from '@/lib/iceland-routes/googleMapsDirectionsUrl'

describe('buildGoogleMapsDirectionsUrl', () => {
  it('builds a keyless driving-navigation URL from exact coordinates', () => {
    const href = buildGoogleMapsDirectionsUrl({
      origin: { lat: 64.146582123456, lon: -21.942635987654 },
      destination: { lat: 63.933008765432, lon: -20.997120123456 },
    })

    expect(href).not.toBeNull()
    const url = new URL(href!)
    expect(url.origin).toBe('https://www.google.com')
    expect(url.pathname).toBe('/maps/dir/')
    expect(url.searchParams.get('api')).toBe('1')
    expect(url.searchParams.get('origin')).toBe('64.146582123456,-21.942635987654')
    expect(url.searchParams.get('destination')).toBe('63.933008765432,-20.997120123456')
    expect(url.searchParams.get('travelmode')).toBe('driving')
    expect(url.searchParams.get('dir_action')).toBe('navigate')
    expect(url.searchParams.has('key')).toBe(false)
  })

  it.each([
    [{ lat: Number.NaN, lon: -21.9 }, { lat: 64.1, lon: -21.8 }],
    [{ lat: 64.1, lon: Number.POSITIVE_INFINITY }, { lat: 64.2, lon: -21.8 }],
    [{ lat: 90.000001, lon: 0 }, { lat: 64.2, lon: -21.8 }],
    [{ lat: 64.1, lon: -180.000001 }, { lat: 64.2, lon: -21.8 }],
    [{ lat: 64.1, lon: -21.9 }, { lat: -90.000001, lon: 0 }],
    [{ lat: 64.1, lon: -21.9 }, { lat: 0, lon: 180.000001 }],
  ])('fails closed for invalid coordinates', (origin, destination) => {
    expect(buildGoogleMapsDirectionsUrl({ origin, destination })).toBeNull()
  })
})
