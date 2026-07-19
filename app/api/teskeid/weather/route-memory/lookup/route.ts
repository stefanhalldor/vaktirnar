import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkFeatureAccess } from '@/lib/loans/guard'
import { normalizePlaceForMemory } from '@/lib/iceland-routes/routePlaceNormalization'
import { lookupRouteMemoryBidirectional } from '@/lib/iceland-routes/routeMemory.server'
import type { RouteMemoryLookupResult } from '@/lib/iceland-routes/routeMemory.server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, max-age=0, must-revalidate',
} as const

/**
 * POST /api/teskeid/weather/route-memory/lookup
 *
 * Look up stored route-memory for a from/to place pair.
 * Returns exact provider station IDs that were matched on a previous /ferdalagid
 * calculation for this normalized route. /vedrid uses these to filter its map.
 *
 * Input (JSON body):
 *   fromName: string              — place display name, e.g. "Reykjavík"
 *   fromFormattedAddress?: string — formatted address, e.g. "Melás 8, Garðabær"
 *   toName: string
 *   toFormattedAddress?: string
 *
 * Output:
 *   { status: 'miss' }
 *   { status: 'resolved', routeKey, routeLabel, variants: [...] }
 *
 * Access: open to all callers (station IDs are not individually sensitive).
 * Provider station IDs for access-restricted providers are stripped when the caller
 * does not have the corresponding feature access, matching the contract of the
 * provider's own API endpoint.
 */
export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ status: 'miss' }, { headers: NO_STORE_HEADERS })
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ status: 'miss' }, { headers: NO_STORE_HEADERS })
  }

  const b = body as Record<string, unknown>
  const fromName = typeof b.fromName === 'string' ? b.fromName.trim() : ''
  const toName = typeof b.toName === 'string' ? b.toName.trim() : ''
  const fromFormattedAddress = typeof b.fromFormattedAddress === 'string'
    ? b.fromFormattedAddress.trim()
    : undefined
  const toFormattedAddress = typeof b.toFormattedAddress === 'string'
    ? b.toFormattedAddress.trim()
    : undefined

  if (!fromName || !toName) {
    return NextResponse.json({ status: 'miss' }, { headers: NO_STORE_HEADERS })
  }

  const fromNorm = normalizePlaceForMemory(fromName, fromFormattedAddress)
  const toNorm = normalizePlaceForMemory(toName, toFormattedAddress)

  if (!fromNorm || !toNorm) {
    return NextResponse.json({ status: 'miss' }, { headers: NO_STORE_HEADERS })
  }

  // Check provider access and strip station IDs from the response for restricted providers.
  // Mirrors the access contracts of the provider-specific API endpoints.
  let vedurstofanAccessible = true
  let vegagerdinAccessible = true

  if (
    process.env.WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED === 'true' ||
    process.env.WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED === 'true'
  ) {
    try {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.email) {
        if (process.env.WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED === 'true') {
          vedurstofanAccessible = await checkFeatureAccess(user.id, user.email, 'weather-provider-vedurstofan')
        }
        if (process.env.WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED === 'true') {
          vegagerdinAccessible = await checkFeatureAccess(user.id, user.email, 'weather-provider-vegagerdin')
        }
      } else {
        if (process.env.WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED === 'true') vedurstofanAccessible = false
        if (process.env.WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED === 'true') vegagerdinAccessible = false
      }
    } catch {
      if (process.env.WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED === 'true') vedurstofanAccessible = false
      if (process.env.WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED === 'true') vegagerdinAccessible = false
    }
  }

  const result = await lookupRouteMemoryBidirectional(fromNorm.key, toNorm.key)

  if ((!vedurstofanAccessible || !vegagerdinAccessible) && result.status === 'resolved') {
    const gated: RouteMemoryLookupResult = {
      ...result,
      variants: result.variants.map(v => ({
        ...v,
        vedurstofanStationIds: vedurstofanAccessible ? v.vedurstofanStationIds : [],
        vegagerdinStationIds: vegagerdinAccessible ? v.vegagerdinStationIds : [],
      })),
    }
    return NextResponse.json(gated, { headers: NO_STORE_HEADERS })
  }

  return NextResponse.json(result, { headers: NO_STORE_HEADERS })
}
