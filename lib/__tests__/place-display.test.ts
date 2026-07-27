import { describe, expect, it } from 'vitest'
import {
  getPlaceAccessibleLabel,
  getPlaceSecondaryLabel,
} from '@/lib/places/display'

describe('place display identity', () => {
  it('uses the official postal locality before the broader municipality', () => {
    const place = {
      name: 'Hella',
      formattedAddress: 'Hella, 611 Grímsey',
      postalCode: '611',
      postalLocality: 'Grímsey',
      municipality: 'Akureyrarbær',
      placeType: 'address' as const,
    }

    expect(getPlaceSecondaryLabel(place)).toBe('611 Grímsey · Akureyrarbær')
    expect(getPlaceAccessibleLabel(place, 'Staðfang')).toBe(
      'Hella, Staðfang, 611 Grímsey · Akureyrarbær',
    )
  })

  it('shows the canonical postcode label for a settlement without duplicating context', () => {
    expect(getPlaceSecondaryLabel({
      name: 'Hella',
      formattedAddress: '850 Hella',
      postalCode: '850',
      postalLocality: 'Hella',
      municipality: 'Rangárþing ytra',
    })).toBe('850 Hella · Rangárþing ytra')
  })

  it('removes a repeated primary name from legacy formatted addresses', () => {
    expect(getPlaceSecondaryLabel({
      name: 'Hella',
      formattedAddress: 'Hella, 250 Suðurnesjabær',
    })).toBe('250 Suðurnesjabær')
  })

  it('does not strip a primary name that is only a word prefix', () => {
    expect(getPlaceSecondaryLabel({
      name: 'Hella',
      formattedAddress: 'Helland, Noregur',
    })).toBe('Helland, Noregur')
  })

  it('keeps a localized nearby label visible for an exact device/map point', () => {
    expect(getPlaceSecondaryLabel({
      name: 'Núverandi staðsetning',
      formattedAddress: 'Nálægt Hella, 611 Grímsey',
      placeType: 'point',
      postalCode: '611',
      postalLocality: 'Grímsey',
      municipality: 'Akureyrarbær',
    })).toBe('Nálægt Hella, 611 Grímsey')
  })
})
