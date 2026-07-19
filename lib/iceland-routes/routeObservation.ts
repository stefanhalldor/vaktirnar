/**
 * RouteObservation — provider-neutral derived route knowledge (v531 R0/R1/R2).
 *
 * After /ferdalagid calculates a trip we record a lightweight observation:
 * - normalized from/to area keys (never raw street addresses)
 * - Veðurstofan station IDs matched to the route
 * - no raw Google route content, no user identity
 *
 * First version: localStorage, circular buffer of 20 observations.
 * Future: Supabase aggregate table (see sql/85_route_observation_aggregate.sql).
 *
 * Privacy: no user ID, no exact street addresses, no raw Google route data.
 * If a place cannot be safely normalized to a known area, the observation is skipped.
 */

import type { DeterministicResult } from '@/lib/weather/types'
import type { VedurstofanTravelLayer } from '@/lib/weather/providers/vedurstofanBlend'

// ── Types ─────────────────────────────────────────────────────────────────────

export type RouteObservationSource = 'ferdalagid_google_routes'

export type RouteObservation = {
  id: string
  source: RouteObservationSource
  /** Normalized ASCII slug, e.g. "hofudborgarsvaedi--akureyri". Never a raw address. */
  routeFamilyKey: string
  /** Human-readable, e.g. "Höfuðborgarsvæðið → Akureyri". */
  routeFamilyLabel: string
  fromAreaKey: string
  fromAreaLabel: string
  toAreaKey: string
  toAreaLabel: string
  /** Unique Veðurstofan station IDs matched to this route. */
  vedurstofanStationIds: string[]
  /** Vegagerðin station IDs matched to this route. Empty until /ferdalagid exposes Vegagerðin matching. */
  vegagerdinStationIds: string[]
  /** IcelandRoadmap segment IDs detected for this route. Empty until segment matching is wired. */
  routeSegmentIds: string[]
  /** IcelandRoadmap caution IDs detected for this route. Empty until caution matching is wired. */
  routeCautionIds: string[]
  createdAtIso: string
}

// ── Area normalization ────────────────────────────────────────────────────────

type AreaEntry = { patterns: RegExp[]; key: string; label: string }

const AREA_ENTRIES: AreaEntry[] = [
  {
    patterns: [
      /reykjav[ií]k/i,
      /gar[ðd]ab[æa]r/i,
      /hafnarfj[öo]r[ðd]ur/i,
      /k[oó]pavogur/i,
      /seltjarnarnes/i,
      /mosfellsb[æa]r/i,
      /kjalarn/i,
      /[áa]lftanes/i,
    ],
    key: 'hofudborgarsvaedi',
    label: 'Höfuðborgarsvæðið',
  },
  {
    patterns: [/akureyri/i],
    key: 'akureyri',
    label: 'Akureyri',
  },
  {
    patterns: [/egilssta[ðd]ir/i],
    key: 'austurland',
    label: 'Austurland',
  },
  {
    patterns: [
      /[íi]safj[öo]r[ðd]ur/i,
      /h[oó]lmav[íi]k/i,
      /bolungarvík/i,
      /þingeyri/i,
      /flateyri/i,
      /patreksfjörður/i,
      /vestfir[ðd]ir/i,
    ],
    key: 'vestfirdir',
    label: 'Vestfirðir',
  },
  {
    patterns: [
      /selfoss/i,
      /hvolsv[öo]llur/i,
      /kirkjub[æa]jarklaustur/i,
      /v[íi]k.*m[ýy]rdal/i,
    ],
    key: 'sudurland',
    label: 'Suðurland',
  },
  {
    patterns: [/h[oö]fn/i, /hornafjör[ðd]ur/i],
    key: 'hofn',
    label: 'Höfn',
  },
  {
    patterns: [
      /stykkish[oó]lmur/i,
      /[oó]lafsv[íi]k/i,
      /sn[æa]fellsb[æa]r/i,
      /grundarfj[öo]r[ðd]ur/i,
    ],
    key: 'snaefellsnes',
    label: 'Snæfellsnes',
  },
  {
    patterns: [
      /bl[oö]ndu[oó]s/i,
      /varmahlí[ðd]/i,
      /skagafj[öo]r[ðd]ur/i,
      /s[oó]lheimar/i,
    ],
    key: 'skagafjordur',
    label: 'Skagafjörður',
  },
  {
    patterns: [/s[aá]lthúsavegur/i, /h[uú]sav[íi]k/i, /[þt]ingeyri/i],
    key: 'nordurland',
    label: 'Norðurland',
  },
]

/**
 * Normalize a place name / formatted address to a coarse Icelandic area.
 * Returns null when the place does not match any known area pattern —
 * unrecognized or private addresses are never stored as route-family labels.
 */
export function normalizeToArea(
  name: string,
  formattedAddress?: string,
): { key: string; label: string } | null {
  const text = [name, formattedAddress].filter(Boolean).join(' ')
  for (const entry of AREA_ENTRIES) {
    if (entry.patterns.some((p) => p.test(text))) {
      return { key: entry.key, label: entry.label }
    }
  }
  return null
}

export function buildRouteFamilyKey(fromKey: string, toKey: string): string {
  return `${fromKey}--${toKey}`
}

// ── Observation builder ───────────────────────────────────────────────────────

/**
 * Build a provider-neutral route observation from a successful trip calculation.
 * Returns null if either place cannot be safely normalized — raw/private addresses
 * that don't match any area pattern will be silently skipped.
 */
export function buildRouteObservation(
  originName: string,
  destinationName: string,
  result: DeterministicResult,
  vedurstofanLayer?: VedurstofanTravelLayer | null,
): Omit<RouteObservation, 'id' | 'createdAtIso'> | null {
  const fromArea = normalizeToArea(originName)
  const toArea = normalizeToArea(destinationName)
  if (!fromArea || !toArea) return null

  // Collect unique Veðurstofan station IDs — prefer the explicit layer
  const stationIds = new Set<string>()
  if (vedurstofanLayer) {
    for (const pt of vedurstofanLayer.points) {
      if (pt.stationId) stationIds.add(pt.stationId)
    }
  }
  // Fall back to per-point station data embedded in route weather points
  if (stationIds.size === 0) {
    for (const pt of result.travelPlan?.routeWeatherPoints ?? []) {
      const sid = pt.vedurstofanStation?.stationId
      if (sid) stationIds.add(sid)
    }
  }

  return {
    source: 'ferdalagid_google_routes',
    routeFamilyKey: buildRouteFamilyKey(fromArea.key, toArea.key),
    routeFamilyLabel: `${fromArea.label} \u2192 ${toArea.label}`,
    fromAreaKey: fromArea.key,
    fromAreaLabel: fromArea.label,
    toAreaKey: toArea.key,
    toAreaLabel: toArea.label,
    vedurstofanStationIds: [...stationIds],
    // Future: populate when /ferdalagid exposes Vegagerðin matching and IcelandRoadmap segments/cautions
    vegagerdinStationIds: [],
    routeSegmentIds: [],
    routeCautionIds: [],
  }
}

// ── Local store (first version — localStorage) ────────────────────────────────

const OBS_KEY = 'vaktirnar:route-observations'
const OBS_MAX = 20

function generateObsId(): string {
  return `ro_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

/** Best-effort: store an observation. Updates station list if the route family was seen before. Never throws. */
export function recordRouteObservation(
  partial: Omit<RouteObservation, 'id' | 'createdAtIso'>,
): void {
  if (typeof window === 'undefined') return
  try {
    const existing = getStoredRouteObservations()
    // Replace any prior entry for the same route family (update station list + timestamp)
    const filtered = existing.filter((o) => o.routeFamilyKey !== partial.routeFamilyKey)
    const obs: RouteObservation = {
      ...partial,
      id: generateObsId(),
      createdAtIso: new Date().toISOString(),
    }
    const next = [obs, ...filtered].slice(0, OBS_MAX)
    localStorage.setItem(OBS_KEY, JSON.stringify(next))
  } catch {
    // localStorage blocked or quota exceeded — ignore silently
  }
}

/** Returns stored route observations, newest first. Never throws. */
export function getStoredRouteObservations(): RouteObservation[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(OBS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (o): o is Record<string, unknown> =>
          o !== null &&
          typeof o === 'object' &&
          typeof o.routeFamilyKey === 'string' &&
          typeof o.fromAreaKey === 'string' &&
          typeof o.toAreaKey === 'string' &&
          Array.isArray(o.vedurstofanStationIds),
      )
      .map((o): RouteObservation => ({
        ...(o as RouteObservation),
        // Backfill arrays added in v533 so old stored entries remain usable
        vegagerdinStationIds: Array.isArray(o.vegagerdinStationIds) ? (o.vegagerdinStationIds as string[]) : [],
        routeSegmentIds: Array.isArray(o.routeSegmentIds) ? (o.routeSegmentIds as string[]) : [],
        routeCautionIds: Array.isArray(o.routeCautionIds) ? (o.routeCautionIds as string[]) : [],
      }))
  } catch {
    return []
  }
}
