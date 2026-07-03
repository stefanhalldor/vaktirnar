import type { ResolvedPlace } from './types'

// Normalize Icelandic place names to a lookup key
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i')
    .replace(/ó/g, 'o').replace(/ú/g, 'u').replace(/ý/g, 'y')
    .replace(/ð/g, 'd').replace(/þ/g, 'th').replace(/æ/g, 'ae').replace(/ö/g, 'o')
    .replace(/\s+/g, '').replace(/[^a-z]/g, '')
}

// Curated place list — coordinates approximate (3 dp for met.no cache key consistency).
// Map confirmation in Phase 2A2 lets users correct location if needed.
const PLACES: ResolvedPlace[] = [
  // Phase 1 — general locations (grill context)
  { name: 'Mosfellsbær',     lat: 64.167, lon: -21.700 },
  { name: 'Grafarholt',      lat: 64.157, lon: -21.876 }, // also Grafarholt Golf Club
  { name: 'Selfoss',         lat: 63.933, lon: -20.997 },
  { name: 'Reykjavík',       lat: 64.135, lon: -21.895 },
  { name: 'Akureyri',        lat: 65.683, lon: -18.100 },
  { name: 'Hafnarfjörður',   lat: 64.067, lon: -21.940 },
  { name: 'Kópavogur',       lat: 64.100, lon: -21.917 },
  { name: 'Garðabær',        lat: 64.083, lon: -21.933 },
  { name: 'Borgarnes',       lat: 64.533, lon: -21.917 },
  { name: 'Hveragerði',      lat: 63.983, lon: -21.183 },
  // Phase 2A1 — golf courses
  { name: 'Keilir',          lat: 64.033, lon: -21.983 }, // Keilir Golf, Hafnarfjörður area
  { name: 'Korpa',           lat: 64.100, lon: -21.867 }, // Korpa Golf, Kópavogur area
  { name: 'Vesturbær',       lat: 64.143, lon: -21.960 }, // GK Vesturbæjar, Reykjavík
  { name: 'Leynir',          lat: 64.317, lon: -22.067 }, // Leynir Golf, Akranes
  { name: 'Akranes',         lat: 64.317, lon: -22.067 },
  { name: 'Nesskot',         lat: 65.700, lon: -18.133 }, // Ness Golf, Akureyri area
  // Phase 2A1 — travel destinations (caravan / route context)
  { name: 'Apavatn',         lat: 64.167, lon: -20.517 },
  { name: 'Húsavík',         lat: 66.050, lon: -17.333 },
  { name: 'Mývatn',          lat: 65.583, lon: -16.983 },
  { name: 'Vík',             lat: 63.417, lon: -18.983 }, // Vík í Mýrdal
  { name: 'Höfn',            lat: 64.250, lon: -15.217 }, // Höfn í Hornafirði
  { name: 'Egilsstaðir',     lat: 65.267, lon: -14.383 },
  { name: 'Ísafjörður',      lat: 66.067, lon: -23.117 },
  { name: 'Stykkishólmur',   lat: 65.083, lon: -22.733 },
  { name: 'Flúðir',          lat: 64.133, lon: -20.317 },
  { name: 'Skógar',          lat: 63.533, lon: -19.517 }, // Skógafoss area
  { name: 'Þingvellir',      lat: 64.255, lon: -21.122 },
  { name: 'Geysir',          lat: 64.317, lon: -20.300 }, // Geysir / Gullfoss area
  { name: 'Jökulsárlón',     lat: 64.083, lon: -16.183 },
  { name: 'Landmannalaugar', lat: 63.983, lon: -19.067 },
]

// Extra aliases for informal names, ASCII variants, and Icelandic case forms
const ALIASES: Record<string, string> = {
  // Phase 1 aliases
  moso:            'Mosfellsbær',
  grafarholtid:    'Grafarholt',
  hafnarfjordur:   'Hafnarfjörður',
  kopavogur:       'Kópavogur',
  gardabaer:       'Garðabær',
  hveragerdi:      'Hveragerði',
  borganes:        'Borgarnes',
  // Phase 2A1 — golf course aliases (dative / genitive case forms)
  keili:           'Keilir',          // dative: Keili
  korpu:           'Korpa',           // dative: Körpu
  vesturbaejar:    'Vesturbær',       // genitive: Vesturbæjar
  leyni:           'Leynir',          // dative: Leyni
  ness:            'Nesskot',         // Ness Golf Club
  // Phase 2A1 — destination aliases
  myrdal:          'Vík',             // Vík í Mýrdal — "í Mýrdal"
  hornafirdi:      'Höfn',            // í Hornafirði
  skogafoss:       'Skógar',          // Skógafoss → Skógar area
  thingvoll:       'Þingvellir',      // dative: Þingvöll/Þingvöllum
  gullfoss:        'Geysir',          // Gullfoss is in the same area as Geysir
}

const INDEX: Record<string, ResolvedPlace> = {}
for (const p of PLACES) {
  INDEX[normalize(p.name)] = p
}
for (const [alias, canonical] of Object.entries(ALIASES)) {
  const place = PLACES.find((p) => p.name === canonical)
  if (place) INDEX[alias] = place
}

export function resolvePlace(query: string): ResolvedPlace | null {
  return INDEX[normalize(query)] ?? null
}

// Round coordinate to 3 decimal places for met.no cache key and URL
export function roundCoord(n: number): number {
  return Math.round(n * 1000) / 1000
}
