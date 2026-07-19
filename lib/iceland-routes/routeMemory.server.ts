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
  /** Caution IDs for this route variant, e.g. ['trailer', 'oxi']. Requires sql/87. */
  routeCautionIds?: string[]
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
    const routePayloadBase = {
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
    }

    // Atomic upsert: insert on first call; on conflict update last_seen_at/updated_at only.
    // Fields omitted from payload (usage_count, first_seen_at, created_at) use their DB
    // defaults on INSERT and are NOT overwritten on conflict.
    // usage_count is intentionally not incremented here — approximate counts acceptable.
    let { data: upserted, error: upsertErr } = await supabase
      .from('weather_route_memory_routes')
      .upsert(
        {
          ...routePayloadBase,
          route_caution_ids: input.routeCautionIds ?? [],
        },
        { onConflict: 'route_key' },
      )
      .select('id')
      .single()

    // Postgres 42703: column does not exist — sql/87 not yet applied in this environment.
    // Keep route-memory self-registration working and only omit caution metadata.
    if (upsertErr?.code === '42703') {
      console.error('[route-memory] route_caution_ids column missing on write, falling back (run sql/87)')
      const fallback = await supabase
        .from('weather_route_memory_routes')
        .upsert(routePayloadBase, { onConflict: 'route_key' })
        .select('id')
        .single()
      upserted = fallback.data
      upsertErr = fallback.error
    }

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
  routeCautionIds: string[]
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
 * Deduplicate route variants before returning them to the UI.
 *
 * Groups by semantic key:
 * - Curated variants (`CURATED_*` label): group by label so multiple rows from
 *   repeated calculations of the same curated route collapse into one pill.
 * - Non-curated variants: group by `routeVariantKey`.
 *
 * Within each group, keeps the "best" variant:
 * - Most total station IDs (more detail wins).
 * - Ties broken by most recent `lastSeenAt`.
 *
 * Exported for unit testing.
 */
export function dedupeRouteVariants(variants: RouteMemoryVariant[]): RouteMemoryVariant[] {
  // Phase 1: collapse by semantic group key, keeping the best row per group.
  // Curated variants group by CURATED_* label; non-curated by routeVariantKey.
  // "Best" = most total station IDs, ties broken by most recent lastSeenAt.
  const groups = new Map<string, RouteMemoryVariant>()
  for (const v of variants) {
    const groupKey = v.routeVariantLabel?.startsWith('CURATED_') ? v.routeVariantLabel : v.routeVariantKey
    const existing = groups.get(groupKey)
    if (!existing) {
      groups.set(groupKey, v)
      continue
    }
    const existingTotal = existing.vedurstofanStationIds.length + existing.vegagerdinStationIds.length
    const newTotal = v.vedurstofanStationIds.length + v.vegagerdinStationIds.length
    if (newTotal > existingTotal || (newTotal === existingTotal && v.lastSeenAt > existing.lastSeenAt)) {
      groups.set(groupKey, v)
    }
  }

  const collapsed = Array.from(groups.values())

  // Phase 2: drop non-curated variants whose station set is an exact subset of
  // any single curated variant. Uses provider-qualified IDs (vedurstofan:X /
  // vegagerdin:X) so the two namespaces never collide.
  // A generic "Leið 1" that only has a subset of "Um Hellisheiði" stations adds
  // no filtering value and clutters the pill row.
  // Phase 2: drop non-curated variants whose station set is an exact subset of
  // any single curated variant. Uses provider-qualified IDs (vedurstofan:X /
  // vegagerdin:X) so the two namespaces never collide.
  // A generic "Leið 1" that only has a subset of "Um Hellisheiði" stations adds
  // no filtering value and clutters the pill row.
  const curated = collapsed.filter(v => v.routeVariantLabel?.startsWith('CURATED_'))

  const afterPhase2 = curated.length === 0 ? collapsed : (() => {
    const curatedSets = curated.map(v => new Set([
      ...v.vedurstofanStationIds.map(id => `vedurstofan:${id}`),
      ...v.vegagerdinStationIds.map(id => `vegagerdin:${id}`),
    ]))
    return collapsed.filter(v => {
      if (v.routeVariantLabel?.startsWith('CURATED_')) return true
      const genericSet = new Set([
        ...v.vedurstofanStationIds.map(id => `vedurstofan:${id}`),
        ...v.vegagerdinStationIds.map(id => `vegagerdin:${id}`),
      ])
      // Keep empty-station non-curated variants (nothing to compare).
      if (genericSet.size === 0) return true
      // Drop if all generic stations appear in any single curated variant.
      return !curatedSets.some(cs => {
        for (const id of genericSet) {
          if (!cs.has(id)) return false
        }
        return true
      })
    })
  })()

  // Phase 3: if any surviving variant has at least one station ID, drop variants
  // with zero total station IDs. Empty variants produce blank map layers and
  // serve no filtering purpose when sibling variants are available.
  const anyHasStations = afterPhase2.some(
    v => v.vedurstofanStationIds.length > 0 || v.vegagerdinStationIds.length > 0
  )
  if (!anyHasStations) return afterPhase2
  return afterPhase2.filter(
    v => v.vedurstofanStationIds.length > 0 || v.vegagerdinStationIds.length > 0
  )
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
 * Callers should union station IDs across all returned variants.
 *
 * Never throws. Returns miss on any database error.
 */
export async function lookupRouteMemory(
  fromPlaceKey: string,
  toPlaceKey: string,
): Promise<RouteMemoryLookupResult> {
  try {
    const supabase = getAdmin()

    let { data: routes, error: routeErr } = await supabase
      .from('weather_route_memory_routes')
      .select('id, route_key, from_place_label, to_place_label, route_variant_key, route_variant_label, route_caution_ids, last_seen_at, usage_count')
      .eq('from_place_key', fromPlaceKey)
      .eq('to_place_key', toPlaceKey)
      .order('last_seen_at', { ascending: false })
      .limit(20)

    // Postgres 42703: column does not exist — sql/87 not yet applied in this environment.
    // Fall back to a query without route_caution_ids so station filtering still works.
    if (routeErr?.code === '42703') {
      console.error('[route-memory] route_caution_ids column missing, falling back (run sql/87)')
      const fallback = await supabase
        .from('weather_route_memory_routes')
        .select('id, route_key, from_place_label, to_place_label, route_variant_key, route_variant_label, last_seen_at, usage_count')
        .eq('from_place_key', fromPlaceKey)
        .eq('to_place_key', toPlaceKey)
        .order('last_seen_at', { ascending: false })
        .limit(20)
      routes = fallback.data as typeof routes
      routeErr = fallback.error
    }

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
      routeCautionIds: Array.isArray(r.route_caution_ids)
        ? (r.route_caution_ids as unknown[]).filter((x): x is string => typeof x === 'string')
        : [],
    }))

    return {
      status: 'resolved',
      routeKey: firstRoute.route_key as string,
      routeLabel: `${firstRoute.from_place_label} \u2192 ${firstRoute.to_place_label}`,
      variants: dedupeRouteVariants(variants),
    }
  } catch {
    return { status: 'miss', fromPlaceKey, toPlaceKey }
  }
}
