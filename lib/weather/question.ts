// Helpers for parsing a weather question into intent, place, and time window.

// Strip Icelandic accents while preserving spaces — used for substring matching.
// Unlike the full normalize() in places.ts, this does NOT remove spaces or
// non-alpha characters so that includes() still works on multi-word patterns.
function stripAccents(s: string): string {
  return s
    .replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i')
    .replace(/ó/g, 'o').replace(/ú/g, 'u').replace(/ý/g, 'y')
    .replace(/ð/g, 'd').replace(/þ/g, 'th').replace(/æ/g, 'ae').replace(/ö/g, 'o')
}

// Known place name patterns (both accented and ASCII variants).
// Resolving the matched pattern to coordinates is handled by resolvePlace() in places.ts.
// stripAccents() is applied to both pattern and question before matching,
// so accented and ASCII variants in questions are handled automatically.
const PLACE_PATTERNS = [
  // Phase 1 — general locations
  'mosfellsbær', 'mosfellsbaer', 'mósó', 'moso',
  'grafarholtið', 'grafarholtid', 'grafarholt',
  'hafnarfjörður', 'hafnarfjordur',
  'kópavogur', 'kopavogur',
  'garðabær', 'gardabaer',
  'hveragerði', 'hveragerdi',
  'borgarnes',
  'reykjavík', 'reykjavik',
  'akureyri',
  'selfoss',
  // Phase 2A1 — golf courses
  'keili',            // matches both 'keili' (dative) and 'keilir' (nominative)
  'korpa', 'korpu',   // nominative + dative (Körpu)
  'vesturbær',        // matches vesturbær, vesturbæ, vesturbæjar via stripAccents
  'leyni',            // matches both 'leyni' (dative) and 'leynir' (nominative)
  'akranes',
  'nesskot',
  // Phase 2A1 — travel destinations
  'apavatn',
  'húsavík',
  'mývatn',
  'mýrdal',           // Vík í Mýrdal — matches "í Mýrdal", "til Mýrdals"
  'höfn', 'hornafirði',
  'egilsstaðir',
  'ísafjörður',
  'stykkishólmur',
  'flúðir',
  'skógar', 'skógafoss',
  'þingvellir', 'þingvöll',  // nominative + dative (Þingvöllum)
  'geysir', 'gullfoss',
  'jökulsárlón',
  'landmannalaugar',
]

/**
 * Extract a place name pattern from the question.
 * Both the question and patterns are accent-normalised before comparison,
 * so variants like "mosó", "Mósó", and "moso" all resolve correctly.
 */
export function extractPlace(question: string): string | null {
  const q = stripAccents(question.toLowerCase())
  for (const p of PLACE_PATTERNS) {
    if (q.includes(stripAccents(p))) return p
  }
  return null
}

export type WeatherIntent =
  | 'grill'
  | 'activity_window_golf'
  | 'route_towable_trailer'
  | 'unknown'

export function detectIntent(question: string): WeatherIntent {
  const q = question.toLowerCase()

  // Grill takes priority if multiple keywords present
  if (q.includes('grill') || q.includes('grilla') || q.includes('grillveður') || q.includes('grillvedur')) {
    return 'grill'
  }

  if (q.includes('golf') || q.includes('golfvöllur') || q.includes('golfvollur') || q.includes('golfveður') || q.includes('golfvedur')) {
    return 'activity_window_golf'
  }

  const qStripped = stripAccents(q)
  if (
    qStripped.includes('hjolhysi') ||
    qStripped.includes('eftirvagn') ||
    qStripped.includes('hestakerra') ||
    qStripped.includes('karavan') ||
    qStripped.includes('tjaldvagn')
  ) {
    return 'route_towable_trailer'
  }

  return 'unknown'
}

export type TrailerKind =
  | 'tent_trailer'
  | 'folding_camper'
  | 'caravan'
  | 'horse_trailer'
  | 'generic_trailer'

/** Extract the type of towable trailer mentioned in the question. */
export function extractTrailerKind(question: string): TrailerKind {
  const q = stripAccents(question.toLowerCase())
  if (q.includes('hestakerra') || q.includes('hestakerra')) return 'horse_trailer'
  if (q.includes('tjaldvagn') || q.includes('tent trailer') || q.includes('folding')) return 'tent_trailer'
  if (q.includes('hjolhysi') || q.includes('karavan') || q.includes('caravan')) return 'caravan'
  if (q.includes('eftirvagn')) return 'generic_trailer'
  return 'generic_trailer'
}

/** Extract route origin from "frá [place]" pattern. */
export function extractRouteOrigin(question: string): string | null {
  const match = question.match(/\bfrá\s+([A-ZÁÉÍÓÚÝÐÞÆÖa-záéíóúýðþæö]+)/i)
  return match ? match[1] : null
}

/** Extract route destination from "að [place]" or "til [place]" pattern. */
export function extractRouteDestination(question: string): string | null {
  const match = question.match(/\b(?:að|til)\s+([A-ZÁÉÍÓÚÝÐÞÆÖa-záéíóúýðþæö]+)/i)
  return match ? match[1] : null
}

export function parseTimeWindow(question: string, nowIso: string): { fromIso: string; toIso: string } {
  const now = new Date(nowIso)
  const q = question.toLowerCase()

  if (q.includes('í kvöld') || q.includes('i kvold') || q.includes('kvöld')) {
    const from = new Date(now)
    from.setHours(18, 0, 0, 0)
    const to = new Date(now)
    to.setHours(23, 0, 0, 0)
    if (from <= now) {
      from.setDate(from.getDate() + 1)
      to.setDate(to.getDate() + 1)
    }
    return { fromIso: from.toISOString(), toIso: to.toISOString() }
  }

  if (q.includes('á morgun') || q.includes('a morgun') || q.includes('morgundaginn')) {
    const from = new Date(now)
    from.setDate(from.getDate() + 1)
    from.setHours(8, 0, 0, 0)
    const to = new Date(from)
    to.setHours(22, 0, 0, 0)
    return { fromIso: from.toISOString(), toIso: to.toISOString() }
  }

  if (q.includes('seinnipart') || q.includes('eftirmiðdag')) {
    const from = new Date(now)
    from.setHours(14, 0, 0, 0)
    if (from <= now) from.setDate(from.getDate() + 1)
    const to = new Date(from)
    to.setHours(18, 0, 0, 0)
    return { fromIso: from.toISOString(), toIso: to.toISOString() }
  }

  // Default: next 6 hours
  return {
    fromIso: now.toISOString(),
    toIso: new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString(),
  }
}
