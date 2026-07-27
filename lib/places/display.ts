import { normalizePlaceSearchText } from './normalize'

export type PlaceDisplayType = 'settlement' | 'address' | 'point'

export type PlaceDisplayValue = {
  name: string
  formattedAddress?: string
  postalCode?: string
  postalLocality?: string
  municipality?: string
  placeType?: PlaceDisplayType
}

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function sameText(first: string | null, second: string | null): boolean {
  return Boolean(
    first && second && normalizePlaceSearchText(first) === normalizePlaceSearchText(second),
  )
}

/**
 * Builds the compact, provider-neutral context shown below a place name.
 * Postal locality is preferred over municipality because e.g. postal code 611
 * belongs to Grímsey even though the municipality is Akureyrarbær.
 */
export function getPlaceSecondaryLabel(place: PlaceDisplayValue): string | null {
  const name = clean(place.name)
  const formattedAddress = clean(place.formattedAddress)

  // A device/map point remains the exact selected coordinate. Its nearby
  // reverse-geocoded label is display context and must not be replaced by
  // postcode metadata belonging to that nearby directory entry.
  if (
    place.placeType === 'point' &&
    formattedAddress &&
    !sameText(formattedAddress, name)
  ) {
    return formattedAddress
  }

  const postalCode = clean(place.postalCode)
  const postalLocality = clean(place.postalLocality)
  const municipality = clean(place.municipality)
  const parts: string[] = []

  if (postalLocality) {
    parts.push([postalCode, postalLocality].filter(Boolean).join(' '))
    if (
      municipality &&
      !sameText(municipality, postalLocality) &&
      !sameText(municipality, name)
    ) {
      parts.push(municipality)
    }
  } else if (postalCode && municipality) {
    parts.push(`${postalCode} ${municipality}`)
  } else if (postalCode) {
    parts.push(postalCode)
  } else if (municipality && !sameText(municipality, name)) {
    parts.push(municipality)
  }

  if (parts.length > 0) return parts.join(' · ')

  if (!formattedAddress || sameText(formattedAddress, name)) return null

  // HMS historically formatted named properties as "Hella, 611 ...". The
  // primary line already says Hella, so do not repeat it in the context line.
  const remainderAfterName = name ? formattedAddress.slice(name.length) : ''
  if (
    name &&
    normalizePlaceSearchText(formattedAddress).startsWith(normalizePlaceSearchText(name)) &&
    /^[\s,·\-–—]/u.test(remainderAfterName)
  ) {
    const remainder = remainderAfterName
      .replace(/^[\s,·\-–—]+/u, '')
      .trim()
    if (remainder) return remainder
  }

  return formattedAddress
}

export function getPlaceAccessibleLabel(
  place: PlaceDisplayValue,
  placeTypeLabel?: string | null,
): string {
  return [place.name.trim(), clean(placeTypeLabel ?? undefined), getPlaceSecondaryLabel(place)]
    .filter((value): value is string => Boolean(value))
    .join(', ')
}
