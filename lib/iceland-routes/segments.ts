/**
 * R1 - Critical Segment Registry (initial skeleton)
 *
 * Hand-curated stubs for the most important Icelandic road segments.
 * Geometry, safety flags, and provider-station matching will be added
 * incrementally as each segment is visually verified on localhost.
 *
 * Segment IDs are stable across releases — do not rename without updating
 * all consumers (routeControlPoints.ts, routeCautions.ts, tests, handoffs).
 *
 * See IcelandRoadmap.md §R1 for the full registry plan.
 */

import type { IcelandRouteSegment } from './types'

/**
 * Known critical segments on the Icelandic road network.
 * Marked `verified: false` until geometry is checked on localhost.
 */
export const ICELAND_ROUTE_SEGMENTS: readonly (IcelandRouteSegment & { verified: boolean })[] = [

  // ── Hringvegurinn (Route 1) backbone segments ────────────────────────────

  {
    id: 'ring-road-vik-west',
    name: 'Þjóðvegur 1 — Vík vestur (Vatnsskarðshólar/Reynisfjall)',
    routeNumbers: ['1'],
    notes: 'Coastal curve west of Vík. Google polyline chords across this; Vatnsskarðshólar and Reynisfjall stations need control-point correction. See routeControlPoints.ts.',
    geometry: [],
    verified: false,
  },

  {
    id: 'ring-road-vik-east',
    name: 'Þjóðvegur 1 — Vík austur (Mýrdalssandur)',
    routeNumbers: ['1'],
    notes: 'Mýrdalssandur east of Vík. See routeControlPoints.ts.',
    geometry: [],
    verified: false,
  },

  {
    id: 'ring-road-hellisheidi',
    name: 'Þjóðvegur 1 — Hellisheiði',
    routeNumbers: ['1'],
    notes: 'High plateau crossing between Reykjavík and Selfoss. Wind and ice exposure. Alternative: Þrengsli (Route 39).',
    geometry: [],
    verified: false,
  },

  // ── Vestfirðir ───────────────────────────────────────────────────────────

  {
    id: 'holmavik-sudurleid',
    name: 'Suðurleið um Vestfirði (í átt að Hólmavík)',
    routeNumbers: ['60'],
    aliases: ['Hólmavíkurleið'],
    notes: 'Curated alternative to the fjord roads. Used by Teskeið "Gegnum Hólmavík" route option.',
    geometry: [],
    verified: false,
  },

  // ── Eastfjords / Öxi ─────────────────────────────────────────────────────

  {
    id: 'oxi-axarvegur',
    name: 'Axarvegur 939 (Öxi)',
    routeNumbers: ['939'],
    aliases: ['Öxi', 'Axarvegur'],
    suitability: 'seasonal_or_unknown',
    notes: 'Seasonal mountain road over Öxi pass. Shorter than the fjord route (Route 1 via Breiðdalsvík) when open. Teskeið "Til að sleppa við Öxi" route option routes around this.',
    geometry: [],
    verified: false,
  },

  // ── South coast / Þrengsli ───────────────────────────────────────────────

  {
    id: 'threngsli',
    name: 'Þrengslavegur 39 (Þrengsli)',
    routeNumbers: ['39'],
    aliases: ['Þrengsli', 'Þrengslavegur'],
    notes: 'Alternative to Hellisheiði (Route 1). Lower altitude, often a better winter option for the Reykjavík–Selfoss corridor.',
    geometry: [],
    verified: false,
  },

]

/** Look up a segment by its stable ID. Returns undefined if not found. */
export function getIcelandSegment(
  id: string,
): (IcelandRouteSegment & { verified: boolean }) | undefined {
  return ICELAND_ROUTE_SEGMENTS.find(s => s.id === id)
}
