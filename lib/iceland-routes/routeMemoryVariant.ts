import type { RouteOption } from '@/lib/weather/provider.types'
import type { RouteMemoryLookupResult, RouteMemoryVariant } from '@/lib/iceland-routes/routeMemory.server'
import { buildRouteMemoryKey } from '@/lib/iceland-routes/routePlaceNormalization'

export type RouteMemoryVariantIdentity = {
  key: string
  label: string | null
}

const CURATED_ROUTE_LABEL = /^CURATED_[A-Z0-9_]{1,120}$/
const SAFE_PROVIDER_VARIANT_KEY = /^(google|mapbox|teskeid):(-?\d{1,5})$/
const MIN_ROUTE_INDEX = -10_000
const MAX_ROUTE_INDEX = 10_000

/**
 * Build a stable, non-sensitive route-memory identity.
 *
 * Google route IDs contain sampled coordinates, so they must never be used in
 * durable route-memory keys. Curated labels are already public constants;
 * ordinary alternatives use provider + provider route index.
 */
export function routeMemoryVariantIdentity(
  route: Pick<RouteOption, 'provider' | 'routeIndex' | 'labels'>,
): RouteMemoryVariantIdentity {
  const curatedLabel = route.labels.find(label => CURATED_ROUTE_LABEL.test(label)) ?? null
  return curatedLabel
    ? { key: curatedLabel, label: curatedLabel }
    : { key: `${route.provider}:${route.routeIndex}`, label: null }
}

function publicRouteMemoryVariant(variant: RouteMemoryVariant): RouteMemoryVariant | null {
  const curatedLabel = variant.routeVariantLabel && CURATED_ROUTE_LABEL.test(variant.routeVariantLabel)
    ? variant.routeVariantLabel
    : CURATED_ROUTE_LABEL.test(variant.routeVariantKey)
      ? variant.routeVariantKey
      : null

  if (curatedLabel) {
    return {
      ...variant,
      routeVariantKey: curatedLabel,
      routeVariantLabel: curatedLabel,
    }
  }

  if (variant.routeVariantKey === 'default') {
    return { ...variant, routeVariantLabel: null }
  }

  const providerMatch = SAFE_PROVIDER_VARIANT_KEY.exec(variant.routeVariantKey)
  if (!providerMatch) return null

  const routeIndex = Number(providerMatch[2])
  const canonicalKey = `${providerMatch[1]}:${routeIndex}`
  if (
    !Number.isInteger(routeIndex) ||
    routeIndex < MIN_ROUTE_INDEX ||
    routeIndex > MAX_ROUTE_INDEX ||
    canonicalKey !== variant.routeVariantKey
  ) {
    return null
  }

  return { ...variant, routeVariantLabel: null }
}

/**
 * Fail closed before route-memory is returned by the public lookup API.
 *
 * Historic Google route IDs embedded sampled coordinates in both the variant
 * key and route key. Only explicitly non-sensitive identities are returned;
 * the route key is rebuilt from normalized public place keys so legacy stored
 * values can never cross the API boundary.
 */
export function sanitizePublicRouteMemoryLookup(
  result: RouteMemoryLookupResult,
  fromPlaceKey: string,
  toPlaceKey: string,
): RouteMemoryLookupResult {
  if (result.status !== 'resolved') return result

  const variants = result.variants
    .map(publicRouteMemoryVariant)
    .filter((variant): variant is RouteMemoryVariant => variant !== null)

  if (variants.length === 0) {
    return { status: 'miss', fromPlaceKey, toPlaceKey }
  }

  return {
    ...result,
    routeKey: buildRouteMemoryKey(fromPlaceKey, toPlaceKey, variants[0].routeVariantKey),
    variants,
  }
}
