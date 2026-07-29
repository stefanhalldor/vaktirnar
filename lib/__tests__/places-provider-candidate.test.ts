import { describe, expect, it } from 'vitest'
import {
  isConfirmedLocationInput,
  toWeatherPlaceCandidate,
} from '@/lib/places/providerCandidate'

const BASE = {
  name: 'Laugavegur 10',
  formattedAddress: 'Laugavegur 10, 101 Reykjavík',
  lat: 64.145,
  lon: -21.93,
}

describe('toWeatherPlaceCandidate', () => {
  it.each(['hms', 'device', 'saved', 'static'])(
    'routes %s locations by WGS84 coordinates, never by a provider place ID',
    source => {
      const candidate = toWeatherPlaceCandidate({
        ...BASE,
        source,
        sourceId: 'hms-public-id',
        // A transitional field must not become a Google waypoint for a
        // provider-neutral source, even if a caller accidentally carries it.
        placeId: 'HEINUM-must-not-go-to-google',
      })

      expect(candidate.placeId).toBe('confirmed')
      expect(candidate.lat).toBe(BASE.lat)
      expect(candidate.lon).toBe(BASE.lon)
    },
  )

  it('passes an explicitly Google-scoped identifier to the Google route adapter', () => {
    const candidate = toWeatherPlaceCandidate({
      ...BASE,
      source: 'google',
      googlePlaceId: 'ChIJexplicitGooglePlace',
    })

    expect(candidate.placeId).toBe('ChIJexplicitGooglePlace')
  })

  it('supports the canonical Google routing reference during the transition', () => {
    const candidate = toWeatherPlaceCandidate({
      ...BASE,
      source: 'google',
      routingRef: { provider: 'google', placeId: 'ChIJroutingReference' },
    })

    expect(candidate.placeId).toBe('ChIJroutingReference')
  })

  it('never trusts a provider routing reference attached to an HMS location', () => {
    const candidate = toWeatherPlaceCandidate({
      ...BASE,
      source: 'hms',
      sourceId: '0000123',
      routingRef: { provider: 'google', placeId: 'HEINUM-must-not-route' },
    })

    expect(candidate.placeId).toBe('confirmed')
  })

  it('keeps legacy source-less Google place IDs working during migration', () => {
    const candidate = toWeatherPlaceCandidate({
      ...BASE,
      placeId: 'ChIJlegacyGooglePlace',
    })

    expect(candidate.placeId).toBe('ChIJlegacyGooglePlace')
  })
})

describe('isConfirmedLocationInput', () => {
  it('accepts a bounded provider-neutral HMS location', () => {
    expect(isConfirmedLocationInput({
      ...BASE,
      source: 'hms',
      sourceId: 'HEINUM-123',
    })).toBe(true)
  })

  it('accepts structured assessment metadata used by the route scope resolver', () => {
    expect(isConfirmedLocationInput({
      ...BASE,
      source: 'hms',
      sourceId: 'HEINUM-123',
      placeType: 'address',
      postalCode: '851',
      postalLocality: 'Hella, dreifbýli',
    })).toBe(true)
  })

  it.each([
    { ...BASE, lat: Number.NaN },
    { ...BASE, lat: 51.5, lon: -0.12 },
    { ...BASE, name: '' },
    { ...BASE, name: 'x'.repeat(161) },
    { ...BASE, sourceId: 'x'.repeat(161) },
    { ...BASE, placeType: 'farm' },
    { ...BASE, postalCode: '85' },
    { ...BASE, postalLocality: 'x'.repeat(161) },
    { ...BASE, routingRef: { provider: 'hms', placeId: 'not-google' } },
  ])('rejects malformed or unbounded input %#', input => {
    expect(isConfirmedLocationInput(input)).toBe(false)
  })
})
