import {
  normalizePlaceSearchText,
  type RoadIntelligencePlaceResult,
} from './placeSearchBridge'

export type RoadMapPlace = RoadIntelligencePlaceResult & {
  id: string
  importance: 1 | 2 | 3
}

export const ROAD_MAP_PLACES: readonly RoadMapPlace[] = [
  { id: 'reykjavik', name: 'Reykjavík', formattedAddress: 'Reykjavík, Ísland', lat: 64.1466, lon: -21.9426, importance: 3 },
  { id: 'akureyri', name: 'Akureyri', formattedAddress: 'Akureyri, Ísland', lat: 65.6835, lon: -18.0878, importance: 3 },
  { id: 'egilsstadir', name: 'Egilsstaðir', formattedAddress: 'Egilsstaðir, Ísland', lat: 65.2674, lon: -14.3948, importance: 3 },
  { id: 'isafjordur', name: 'Ísafjörður', formattedAddress: 'Ísafjörður, Ísland', lat: 66.0748, lon: -23.1250, importance: 3 },
  { id: 'selfoss', name: 'Selfoss', formattedAddress: 'Selfoss, Ísland', lat: 63.9331, lon: -20.9971, importance: 3 },
  { id: 'borgarnes', name: 'Borgarnes', formattedAddress: 'Borgarnes, Ísland', lat: 64.5383, lon: -21.9206, importance: 3 },
  { id: 'hofn', name: 'Höfn', formattedAddress: 'Höfn í Hornafirði, Ísland', lat: 64.2539, lon: -15.2082, importance: 3 },

  { id: 'akranes', name: 'Akranes', formattedAddress: 'Akranes, Ísland', lat: 64.3218, lon: -22.0749, importance: 2 },
  { id: 'budardalur', name: 'Búðardalur', formattedAddress: 'Búðardalur, Ísland', lat: 65.1104, lon: -21.7640, importance: 2 },
  { id: 'holmavik', name: 'Hólmavík', formattedAddress: 'Hólmavík, Ísland', lat: 65.7040, lon: -21.6810, importance: 2 },
  { id: 'blonduos', name: 'Blönduós', formattedAddress: 'Blönduós, Ísland', lat: 65.6590, lon: -20.2800, importance: 2 },
  { id: 'saudarkrokur', name: 'Sauðárkrókur', formattedAddress: 'Sauðárkrókur, Ísland', lat: 65.7461, lon: -19.6394, importance: 2 },
  { id: 'varmahlid', name: 'Varmahlíð', formattedAddress: 'Varmahlíð, Ísland', lat: 65.5536, lon: -19.4495, importance: 2 },
  { id: 'siglufjordur', name: 'Siglufjörður', formattedAddress: 'Siglufjörður, Ísland', lat: 66.1510, lon: -18.9090, importance: 2 },
  { id: 'dalvik', name: 'Dalvík', formattedAddress: 'Dalvík, Ísland', lat: 65.9702, lon: -18.5286, importance: 2 },
  { id: 'husavik', name: 'Húsavík', formattedAddress: 'Húsavík, Ísland', lat: 66.0449, lon: -17.3389, importance: 2 },
  { id: 'vik', name: 'Vík', formattedAddress: 'Vík í Mýrdal, Ísland', lat: 63.4186, lon: -19.0060, importance: 2 },
  { id: 'hvolsvollur', name: 'Hvolsvöllur', formattedAddress: 'Hvolsvöllur, Ísland', lat: 63.7530, lon: -20.2250, importance: 2 },
  { id: 'kirkjubaejarklaustur', name: 'Kirkjubæjarklaustur', formattedAddress: 'Kirkjubæjarklaustur, Ísland', lat: 63.7903, lon: -18.0469, importance: 2 },
  { id: 'djupivogur', name: 'Djúpivogur', formattedAddress: 'Djúpivogur, Ísland', lat: 64.6570, lon: -14.2850, importance: 2 },
  { id: 'reydarfjordur', name: 'Reyðarfjörður', formattedAddress: 'Reyðarfjörður, Ísland', lat: 65.0320, lon: -14.2180, importance: 2 },
  { id: 'seyðisfjordur', name: 'Seyðisfjörður', formattedAddress: 'Seyðisfjörður, Ísland', lat: 65.2600, lon: -14.0100, importance: 2 },

  { id: 'gardabaer', name: 'Garðabær', formattedAddress: 'Garðabær, Ísland', lat: 64.0887, lon: -21.9225, importance: 1 },
  { id: 'hafnarfjordur', name: 'Hafnarfjörður', formattedAddress: 'Hafnarfjörður, Ísland', lat: 64.0671, lon: -21.9387, importance: 1 },
  { id: 'keflavik', name: 'Keflavík', formattedAddress: 'Keflavík, Ísland', lat: 64.0049, lon: -22.5624, importance: 1 },
  { id: 'grindavik', name: 'Grindavík', formattedAddress: 'Grindavík, Ísland', lat: 63.8424, lon: -22.4338, importance: 1 },
  { id: 'hveragerdi', name: 'Hveragerði', formattedAddress: 'Hveragerði, Ísland', lat: 64.0000, lon: -21.1880, importance: 1 },
  { id: 'thorlakshofn', name: 'Þorlákshöfn', formattedAddress: 'Þorlákshöfn, Ísland', lat: 63.8550, lon: -21.3830, importance: 1 },
  { id: 'fludir', name: 'Flúðir', formattedAddress: 'Flúðir, Ísland', lat: 64.1300, lon: -20.3200, importance: 1 },
  { id: 'laugarvatn', name: 'Laugarvatn', formattedAddress: 'Laugarvatn, Ísland', lat: 64.2170, lon: -20.7330, importance: 1 },
  { id: 'stykkisholmur', name: 'Stykkishólmur', formattedAddress: 'Stykkishólmur, Ísland', lat: 65.0756, lon: -22.7250, importance: 1 },
  { id: 'grundarfjordur', name: 'Grundarfjörður', formattedAddress: 'Grundarfjörður, Ísland', lat: 64.9243, lon: -23.2560, importance: 1 },
  { id: 'olafsvik', name: 'Ólafsvík', formattedAddress: 'Ólafsvík, Ísland', lat: 64.8945, lon: -23.7090, importance: 1 },
  { id: 'patreksfjordur', name: 'Patreksfjörður', formattedAddress: 'Patreksfjörður, Ísland', lat: 65.5960, lon: -23.9950, importance: 1 },
  { id: 'bildudalur', name: 'Bíldudalur', formattedAddress: 'Bíldudalur, Ísland', lat: 65.6860, lon: -23.6000, importance: 1 },
  { id: 'flokalundur', name: 'Flókalundur', formattedAddress: 'Flókalundur, Ísland', lat: 65.5780, lon: -23.1700, importance: 1 },
  { id: 'bolungarvik', name: 'Bolungarvík', formattedAddress: 'Bolungarvík, Ísland', lat: 66.1590, lon: -23.2500, importance: 1 },
  { id: 'hvammstangi', name: 'Hvammstangi', formattedAddress: 'Hvammstangi, Ísland', lat: 65.3970, lon: -20.9420, importance: 1 },
  { id: 'skagastrond', name: 'Skagaströnd', formattedAddress: 'Skagaströnd, Ísland', lat: 65.8230, lon: -20.3060, importance: 1 },
  { id: 'olafsfjordur', name: 'Ólafsfjörður', formattedAddress: 'Ólafsfjörður, Ísland', lat: 66.0670, lon: -18.6500, importance: 1 },
  { id: 'reykjahlid', name: 'Reykjahlíð', formattedAddress: 'Reykjahlíð við Mývatn, Ísland', lat: 65.6420, lon: -16.9140, importance: 1 },
  { id: 'eskifjordur', name: 'Eskifjörður', formattedAddress: 'Eskifjörður, Ísland', lat: 65.0730, lon: -14.0160, importance: 1 },
  { id: 'neskaupstadur', name: 'Neskaupstaður', formattedAddress: 'Neskaupstaður, Ísland', lat: 65.1480, lon: -13.6830, importance: 1 },
]

function scorePlaceForQuery(query: string, place: RoadIntelligencePlaceResult): number {
  const normalizedQuery = normalizePlaceSearchText(query)
  if (!normalizedQuery) return 0

  const name = normalizePlaceSearchText(place.name)
  const address = normalizePlaceSearchText(place.formattedAddress ?? '')

  if (name === normalizedQuery) return 100
  if (address === normalizedQuery) return 95
  if (name.startsWith(normalizedQuery)) return 80
  if (address.startsWith(normalizedQuery)) return 70
  if (name.includes(normalizedQuery)) return 50
  if (address.includes(normalizedQuery)) return 40
  return 0
}

function placeDedupeKey(place: RoadIntelligencePlaceResult): string {
  const name = normalizePlaceSearchText(place.name)
  const lat = Math.round(place.lat * 1000)
  const lon = Math.round(place.lon * 1000)
  return `${name}:${lat}:${lon}`
}

export function findRoadMapPlaceSuggestions(
  query: string,
  limit = 5,
): RoadMapPlace[] {
  return ROAD_MAP_PLACES
    .map(place => ({ place, score: scorePlaceForQuery(query, place) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || b.place.importance - a.place.importance || a.place.name.localeCompare(b.place.name, 'is'))
    .slice(0, limit)
    .map(item => item.place)
}

export function mergePlaceSuggestions(
  primary: readonly RoadIntelligencePlaceResult[],
  fallback: readonly RoadIntelligencePlaceResult[],
  limit = 5,
): RoadIntelligencePlaceResult[] {
  const seen = new Set<string>()
  const merged: RoadIntelligencePlaceResult[] = []

  for (const place of [...primary, ...fallback]) {
    const key = placeDedupeKey(place)
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(place)
    if (merged.length >= limit) break
  }

  return merged
}
