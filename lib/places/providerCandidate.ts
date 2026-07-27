import type { PlaceCandidate } from '@/lib/weather/provider.types'
import { validateIcelandicCoords } from '@/lib/weather/coords'
import type { PlaceRoutingReference } from './types'

export type ConfirmedLocationInput = {
  name: string
  lat: number
  lon: number
  formattedAddress?: string
  source?: string
  sourceId?: string
  googlePlaceId?: string
  routingRef?: PlaceRoutingReference
  /** Transitional field accepted only for legacy or explicitly Google input. */
  placeId?: string
}

function optionalBoundedString(value: unknown, maxLength: number): value is string | undefined {
  return value === undefined || (
    typeof value === 'string' &&
    value.trim().length <= maxLength
  )
}

/** Legacy clients occasionally sent primitive, non-string IDs. Ignore them safely. */
function optionalProviderIdentifier(value: unknown): boolean {
  return value === undefined || value === null ||
    typeof value === 'number' || typeof value === 'boolean' ||
    (typeof value === 'string' && value.trim().length <= 500)
}

export function isConfirmedLocationInput(raw: unknown): raw is ConfirmedLocationInput {
  if (!raw || typeof raw !== 'object') return false
  const value = raw as Record<string, unknown>
  const routingRef = value.routingRef
  const validRoutingRef = routingRef === undefined || (
    typeof routingRef === 'object' && routingRef !== null &&
    (routingRef as Record<string, unknown>).provider === 'google' &&
    optionalBoundedString((routingRef as Record<string, unknown>).placeId, 500) &&
    typeof (routingRef as Record<string, unknown>).placeId === 'string' &&
    Boolean(((routingRef as Record<string, unknown>).placeId as string).trim())
  )
  return validRoutingRef && (
    typeof value.name === 'string' &&
    value.name.trim().length > 0 &&
    value.name.trim().length <= 160 &&
    typeof value.lat === 'number' &&
    typeof value.lon === 'number' &&
    validateIcelandicCoords(value.lat, value.lon) &&
    optionalBoundedString(value.formattedAddress, 300) &&
    optionalBoundedString(value.source, 40) &&
    optionalBoundedString(value.sourceId, 160) &&
    optionalProviderIdentifier(value.googlePlaceId) &&
    optionalProviderIdentifier(value.placeId)
  )
}

function normalizeOptionalId(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  return trimmed && trimmed.length <= 500 ? trimmed : undefined
}

/**
 * Keeps public-directory identity separate from routing-provider identity.
 * HMS, device, saved and static locations always route by their WGS84 coords.
 * Legacy input without a source may still carry the old Google `placeId`.
 */
export function toWeatherPlaceCandidate(location: ConfirmedLocationInput): PlaceCandidate {
  const source = location.source?.trim()
  const googlePlaceId = source === 'google'
    ? normalizeOptionalId(
        location.routingRef?.provider === 'google'
          ? location.routingRef.placeId
          : location.googlePlaceId ?? location.placeId,
      )
    : source
      ? undefined
      : normalizeOptionalId(
          location.routingRef?.provider === 'google'
            ? location.routingRef.placeId
            : location.googlePlaceId ?? location.placeId,
        )

  return {
    placeId: googlePlaceId ?? 'confirmed',
    displayName: location.name.trim(),
    formattedAddress: (location.formattedAddress ?? location.name).trim(),
    lat: location.lat,
    lon: location.lon,
  }
}
