/**
 * Route-memory server helper.
 *
 * Writes exact provider station IDs (Veðurstofan, Vegagerðin) from a real
 * /ferdalagid trip calculation into Supabase. /vedrid reads this table to filter
 * its map to the exact station set, with no corridor/radius approximation.
 *
 * Privacy: no user IDs, no raw addresses, no raw Google geometry. Only normalized
 * public place keys/labels and provider station IDs are stored.
 *
 * Requires: sql/86_weather_route_memory.sql to have been run.
 * All functions are best-effort and never throw.
 */
import 'server-only'
import { getAdmin } from '@/lib/supabase/admin'

// ── Write types ────────────────────────────────────────────────────────────────

export type RouteMemoryStation = {
  provider: 'vedurstofan' | 'vegagerdin'
  stationId: string
  stationName?: string | null
  routeOrder: number
  distanceFromOriginM?: number | null
  distanceFromRouteM?: number | null
  routeFraction?: number | null
}

export type RouteMemoryWriteInput = {
  routeKey: string
  fromPlaceKey: string
  fromPlaceLabel: string
  toPlaceKey: string
  toPlaceLabel: string
  routeVariantKey?: string
  routeVariantLabel?: string | null
  stations: RouteMemoryStation[]
  /**
   * Which providers were evaluated during this trip calculation.
   * Station rows for these providers will be replaced even if 0 stations matched
   * (clearing stale data). Providers NOT in this list are left untouched.
   */
  providersEvaluated: ReadonlyArray<'vedurstofan' | 'vegagerdin'>
}

/**
 * Upsert a route-memory record and replace its station rows.
 *
 * Upsert semantics:
 * - Route row: insert on first call, increment usage_count + update last_seen_at on subsequent calls.
 * - Station rows: delete existing rows per provider, then insert fresh rows.
 *   This ensures route-memory always reflects the most recent calculation for that route/provider.
 *
 * Best-effort: never throws. Errors are logged (code only, no raw content) and swallowed.
 * Must be awaited before the calling route returns to ensure the write completes.
 */
export async function recordRouteMemory(input: RouteMemoryWriteInput): Promise<void> {
  try {
    const supabase = getAdmin()
    const now = new Date().toISOString()
    const variantKey = input.routeVariantKey ?? 'default'

    // Atomic upsert: insert on first call; on conflict update last_seen_at/updated_at only.
    // Fields omitted from payload (usage_count, first_seen_at, created_at) use their DB
    // defaults on INSERT and are NOT overwritten on conflict.
    // usage_count is intentionally not incremented here — approximate counts acceptable.
    const { data: upserted, error: upsertErr } = await supabase
      .from('weather_route_memory_routes')
      .upsert(
        {
          route_key: input.routeKey,
          from_place_key: input.fromPlaceKey,
          from_place_label: input.fromPlaceLabel,
          to_place_key: input.toPlaceKey,
          to_place_label: input.toPlaceLabel,
          route_variant_key: variantKey,
          route_variant_label: input.routeVariantLabel ?? null,
          source: 'ferdalagid',
          last_seen_at: now,
          updated_at: now,
        },
        { onConflict: 'route_key' },
      )
      .select('id')
      .single()

    if (upsertErr || !upserted) {
      console.error('[route-memory] upsert failed:', upsertErr?.code)
      return
    }

    const routeId = upserted.id as string

    // Replace station rows for every evaluated provider.
    // - Provider evaluated with 0 matches: delete stale rows (they no longer apply).
    // - Provider not in providersEvaluated: leave rows untouched (cache was unavailable).
    for (const provider of input.providersEvaluated) {
      const { error: delErr } = await supabase
        .from('weather_route_memory_stations')
        .delete()
        .eq('route_id', routeId)
        .eq('provider', provider)
      if (delErr) {
        console.error('[route-memory] station delete failed:', delErr.code, provider)
        continue
      }

      const rows = input.stations
        .filter(s => s.provider === provider)
        .map(s => ({
          route_id: routeId,
          provider: s.provider,
          station_id: s.stationId,
          station_name: s.stationName ?? null,
          route_order: s.routeOrder,
          distance_from_origin_m: s.distanceFromOriginM ?? null,
          distance_from_route_m: s.distanceFromRouteM ?? null,
          route_fraction: s.routeFraction ?? null,
          first_seen_at: now,
          last_seen_at: now,
        }))

      if (rows.length === 0) continue

      const { error: insErr } = await supabase
        .from('weather_route_memory_stations')
        .insert(rows)
      if (insErr) {
        console.error('[route-memory] station insert failed:', insErr.code, provider)
      }
    }
  } catch (err) {
    console.error('[route-memory] write error:', err instanceof Error ? err.message : 'unknown')
  }
}

// ── Lookup types ───────────────────────────────────────────────────────────────

export type RouteMemoryVariant = {
  routeVariantKey: string
  routeVariantLabel: string | null
  lastSeenAt: string
  usageCount: number
  vedurstofanStationIds: string[]
  vegagerdinStationIds: string[]
}

export type RouteMemoryLookupResult =
  | { status: 'miss'; fromPlaceKey?: string; toPlaceKey?: string }
  | {
      status: 'resolved'
      routeKey: string
      routeLabel: string
      variants: RouteMemoryVariant[]
    }

/**
 * Look up route-memory bidirectionally: tries A→B first, then B→A.
 *
 * Used by /vedrid overview where the user may pick either endpoint of a stored route.
 * The station sets are the same regardless of direction for the map filter use case.
 * If direction matters later (e.g. route-order in UI), the caller can inspect
 * routeKey to determine whether a reverse match was used.
 *
 * Never throws.
 */
export async function lookupRouteMemoryBidirectional(
  placeKeyA: string,
  placeKeyB: string,
): Promise<RouteMemoryLookupResult> {
  const forward = await lookupRouteMemory(placeKeyA, placeKeyB)
  if (forward.status === 'resolved') return forward
  return lookupRouteMemory(placeKeyB, placeKeyA)
}

/**
 * Look up route-memory for a given from/to place key pair.
 *
 * Returns all stored variants (e.g. different route options) ordered by last_seen_at.
 * Callers should use variants[0] as the most recent variant.
 *
 * Never throws. Returns miss on any database error.
 */
export async function lookupRouteMemory(
  fromPlaceKey: string,
  toPlaceKey: string,
): Promise<RouteMemoryLookupResult> {
  try {
    const supabase = getAdmin()

    const { data: routes, error: routeErr } = await supabase
      .from('weather_route_memory_routes')
      .select('id, route_key, from_place_label, to_place_label, route_variant_key, route_variant_label, last_seen_at, usage_count')
      .eq('from_place_key', fromPlaceKey)
      .eq('to_place_key', toPlaceKey)
      .order('last_seen_at', { ascending: false })
      .limit(5)

    if (routeErr || !routes || routes.length === 0) {
      return { status: 'miss', fromPlaceKey, toPlaceKey }
    }

    const routeIds = routes.map(r => r.id as string)

    const { data: stations, error: stErr } = await supabase
      .from('weather_route_memory_stations')
      .select('route_id, provider, station_id')
      .in('route_id', routeIds)
      .order('route_order', { ascending: true })

    if (stErr) {
      return { status: 'miss', fromPlaceKey, toPlaceKey }
    }

    const stationsByRoute = new Map<string, { vedurstofan: string[]; vegagerdin: string[] }>()
    for (const s of stations ?? []) {
      const id = s.route_id as string
      if (!stationsByRoute.has(id)) {
        stationsByRoute.set(id, { vedurstofan: [], vegagerdin: [] })
      }
      const entry = stationsByRoute.get(id)!
      if (s.provider === 'vedurstofan') entry.vedurstofan.push(s.station_id as string)
      else if (s.provider === 'vegagerdin') entry.vegagerdin.push(s.station_id as string)
    }

    const firstRoute = routes[0]
    const variants: RouteMemoryVariant[] = routes.map(r => ({
      routeVariantKey: r.route_variant_key as string,
      routeVariantLabel: r.route_variant_label as string | null,
      lastSeenAt: r.last_seen_at as string,
      usageCount: r.usage_count as number,
      vedurstofanStationIds: stationsByRoute.get(r.id as string)?.vedurstofan ?? [],
      vegagerdinStationIds: stationsByRoute.get(r.id as string)?.vegagerdin ?? [],
    }))

    return {
      status: 'resolved',
      routeKey: firstRoute.route_key as string,
      routeLabel: `${firstRoute.from_place_label} \u2192 ${firstRoute.to_place_label}`,
      variants,
    }
  } catch {
    return { status: 'miss', fromPlaceKey, toPlaceKey }
  }
}
