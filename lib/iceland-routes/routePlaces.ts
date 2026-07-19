/**
 * Canonical Icelandic place registry for route-memory.
 *
 * Provides approximate city-center coordinates for each place key used in
 * routePlaceNormalization.ts. These coordinates let RouteMemoryPicker construct
 * a valid RouteDraftPlace (which requires lat/lon) without calling Google.
 *
 * Coordinates are approximate city centers — sufficient for FerðalagidClient
 * pre-fill, which re-geocodes via Google Routes before computing the trip.
 */

export type CanonicalPlace = {
  key: string
  label: string
  lat: number
  lon: number
}

// Ordered to match routePlaceNormalization.ts entries.
const CANONICAL_PLACES: readonly CanonicalPlace[] = [
  // Capital area
  { key: 'gardabaer', label: 'Garðabær', lat: 64.0839, lon: -21.9391 },
  { key: 'hafnarfjordur', label: 'Hafnarfjörður', lat: 64.0669, lon: -21.9403 },
  { key: 'kopavogur', label: 'Kópavogur', lat: 64.1126, lon: -21.9231 },
  { key: 'seltjarnarnes', label: 'Seltjarnarnes', lat: 64.1566, lon: -22.0007 },
  { key: 'mosfellsbaer', label: 'Mosfellsbær', lat: 64.1663, lon: -21.6946 },
  { key: 'alftanes', label: 'Álftanes', lat: 64.0706, lon: -22.0433 },
  { key: 'reykjanesbær', label: 'Reykjanesbær', lat: 63.9969, lon: -22.5558 },
  { key: 'keflavik', label: 'Keflavík', lat: 63.9969, lon: -22.5558 },
  { key: 'reykjavik', label: 'Reykjavík', lat: 64.1355, lon: -21.8954 },
  // North
  { key: 'akureyri', label: 'Akureyri', lat: 65.6835, lon: -18.0878 },
  { key: 'siglufjordur', label: 'Siglufjörður', lat: 66.1546, lon: -18.9048 },
  { key: 'husavik', label: 'Húsavík', lat: 66.0442, lon: -17.3398 },
  // East
  { key: 'egilsstadir', label: 'Egilsstaðir', lat: 65.2685, lon: -14.3948 },
  // Westfjords
  { key: 'isafjordur', label: 'Ísafjörður', lat: 66.0767, lon: -23.1343 },
  { key: 'holmavik', label: 'Hólmavík', lat: 65.7078, lon: -21.6913 },
  // West
  { key: 'borgarnes', label: 'Borgarnes', lat: 64.5375, lon: -21.9201 },
  { key: 'stykkisholmur', label: 'Stykkishólmur', lat: 65.0734, lon: -22.7297 },
  { key: 'grundarfjordur', label: 'Grundarfjörður', lat: 64.9204, lon: -23.2549 },
  { key: 'olafsvik', label: 'Ólafsvík', lat: 64.8948, lon: -23.7109 },
  // Northwest
  { key: 'blonduos', label: 'Blönduós', lat: 65.6609, lon: -20.2935 },
  { key: 'varmahlid', label: 'Varmahlíð', lat: 65.5457, lon: -19.4576 },
  // South
  { key: 'selfoss', label: 'Selfoss', lat: 63.9333, lon: -21.0000 },
  { key: 'hvolsvollur', label: 'Hvolsvöllur', lat: 63.7515, lon: -20.2215 },
  { key: 'kirkjubaejarklaustur', label: 'Kirkjubæjarklaustur', lat: 63.7811, lon: -18.0617 },
  // Southeast
  { key: 'hofn', label: 'Höfn', lat: 64.2542, lon: -15.2087 },
  // South coast
  { key: 'vik', label: 'Vík', lat: 63.4186, lon: -19.0057 },
]

export function getCanonicalPlace(key: string): CanonicalPlace | undefined {
  return CANONICAL_PLACES.find(p => p.key === key)
}
