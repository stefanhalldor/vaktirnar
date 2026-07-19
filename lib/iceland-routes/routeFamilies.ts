/**
 * Curated route families for the /vedrid overview route lens.
 *
 * Each family covers a major travel corridor from the capital area.
 * Corridor waypoints are placed every ~60-80 km along the route so that
 * a 60 km radius circle around each waypoint provides continuous coverage.
 *
 * fromAliases and toAliases are pre-normalized (lowercase, ASCII-only):
 *   - á/é/í/ó/ú/ý/ö → bare vowel via NFD+strip
 *   - ð → d
 *   - þ → th
 *   - æ → ae
 * The resolver applies the same normalization to user input before matching.
 */

import type { OverviewRouteLensRouteFamily } from './lensTypes'

export interface InternalRouteFamily extends OverviewRouteLensRouteFamily {
  /** Pre-normalized origin aliases (capital region). */
  fromAliases: readonly string[]
  /** Pre-normalized destination aliases. */
  toAliases: readonly string[]
}

// Capital-region aliases shared by all routes that start/end in Reykjavík.
const CAPITAL_ALIASES: readonly string[] = [
  'reykjavik',
  'rvk',
  'keflavik',
  'kef',
  'hafnarfjordur',
  'kopavogur',
  'gardabaer',
  'mosfellsbaer',
  'reykjanes',
  'reykjanesbaer',
  'sudurnes',
]

export const ROUTE_FAMILIES: readonly InternalRouteFamily[] = [

  // ── Reykjavík → Suðurströnd / Vík / Kirkjubæjarklaustur ─────────────────

  {
    id: 'capital-south-coast',
    label: 'Reykjavík — Suðurströnd / Vík',
    labelEn: 'Reykjavík — South Coast / Vík',
    fromAliases: CAPITAL_ALIASES,
    toAliases: [
      'vik',
      'vik i myrdal',
      'kirkjubaejark laustur',
      'kirkjubaejarklaustur',
      'klaustur',
      'selfoss',
      'hella',
      'hvolsvollur',
      'skogar',
      'sudurstrond',
    ],
    corridorWaypoints: [
      { lat: 64.135, lon: -21.895 }, // Reykjavík
      { lat: 64.036, lon: -21.392 }, // Hellisheiði
      { lat: 63.934, lon: -21.041 }, // Selfoss
      { lat: 63.833, lon: -20.395 }, // Hella
      { lat: 63.750, lon: -20.232 }, // Hvolsvöllur
      { lat: 63.527, lon: -19.509 }, // Skógar / Seljalandsfoss area
      { lat: 63.418, lon: -19.003 }, // Vík
      { lat: 63.791, lon: -18.056 }, // Kirkjubæjarklaustur
    ],
    corridorRadiusKm: 60,
  },

  // ── Reykjavík → Austurland (Höfn, Egilsstaðir) ──────────────────────────

  {
    id: 'capital-east-iceland',
    label: 'Reykjavík — Austurland',
    labelEn: 'Reykjavík — East Iceland',
    fromAliases: CAPITAL_ALIASES,
    toAliases: [
      'hofn',
      'hofn a hornafjordur',
      'hornafjordur',
      'egilsstadir',
      'egilsstadabaer',
      'egilsstadirbaer',
      'djupivogur',
      'seydisfjordur',
      'neskaupstadur',
      'nordfj',
      'austurland',
      'austurlandi',
    ],
    corridorWaypoints: [
      { lat: 64.135, lon: -21.895 }, // Reykjavík
      { lat: 64.036, lon: -21.392 }, // Hellisheiði
      { lat: 63.934, lon: -21.041 }, // Selfoss
      { lat: 63.833, lon: -20.395 }, // Hella
      { lat: 63.527, lon: -19.509 }, // Skógar
      { lat: 63.418, lon: -19.003 }, // Vík
      { lat: 63.791, lon: -18.056 }, // Kirkjubæjarklaustur
      { lat: 63.982, lon: -16.979 }, // Skaftafell / Öræfi area
      { lat: 64.058, lon: -16.180 }, // Jökulsárlón
      { lat: 64.255, lon: -15.207 }, // Höfn
      { lat: 64.654, lon: -14.284 }, // Djúpivogur
      { lat: 65.267, lon: -14.401 }, // Egilsstaðir
    ],
    corridorRadiusKm: 60,
  },

  // ── Reykjavík → Norðurland (Akureyri, Mývatn, Húsavík) ──────────────────

  {
    id: 'capital-north-iceland',
    label: 'Reykjavík — Norðurland / Akureyri',
    labelEn: 'Reykjavík — North Iceland / Akureyri',
    fromAliases: CAPITAL_ALIASES,
    toAliases: [
      'akureyri',
      'eyri',
      'myvatn',
      'husavik',
      'dalvik',
      'siglufjordur',
      'olafsfjordur',
      'blonduos',
      'varmahlio',
      'nordurlandi',
      'nordurleid',
      'nordurkjordur',
    ],
    corridorWaypoints: [
      { lat: 64.135, lon: -21.895 }, // Reykjavík
      { lat: 64.540, lon: -21.921 }, // Borgarnes
      { lat: 65.103, lon: -21.786 }, // Búðardalur area
      { lat: 65.402, lon: -20.947 }, // Hvammstangi
      { lat: 65.658, lon: -20.291 }, // Blönduós
      { lat: 65.572, lon: -19.460 }, // Varmahlíð
      { lat: 65.686, lon: -18.085 }, // Akureyri
      { lat: 65.601, lon: -16.997 }, // Mývatn
      { lat: 66.044, lon: -17.334 }, // Húsavík
    ],
    corridorRadiusKm: 60,
  },

  // ── Reykjavík → Vestfirðir (Hólmavík, Ísafjörður) ───────────────────────

  {
    id: 'capital-westfjords',
    label: 'Reykjavík — Vestfirðir / Ísafjörður',
    labelEn: 'Reykjavík — Westfjords / Ísafjörður',
    fromAliases: CAPITAL_ALIASES,
    toAliases: [
      'isafjordur',
      'holmavik',
      'patreksfjordur',
      'bolungarvik',
      'thingeyri',
      'flateyri',
      'bildudalur',
      'vestfirdir',
      'vestfjardar',
    ],
    corridorWaypoints: [
      { lat: 64.135, lon: -21.895 }, // Reykjavík
      { lat: 64.540, lon: -21.921 }, // Borgarnes
      { lat: 65.103, lon: -21.786 }, // Búðardalur area
      { lat: 65.711, lon: -21.693 }, // Hólmavík
      { lat: 65.872, lon: -23.502 }, // Þingeyri area
      { lat: 66.048, lon: -23.519 }, // Flateyri area
      { lat: 66.075, lon: -23.131 }, // Ísafjörður
    ],
    corridorRadiusKm: 70, // Wider because Westfjords routes wind through many fjords
  },

]

/** Look up a route family by stable ID. */
export function getRouteFamily(id: string): InternalRouteFamily | undefined {
  return ROUTE_FAMILIES.find(f => f.id === id)
}
