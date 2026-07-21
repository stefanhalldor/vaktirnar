export type RoadIntelligenceOpenDataSourceId =
  | 'vegagerdin-vegakerfi'
  | 'vegagerdin-faerd'
  | 'vegagerdin-vedur-current'
  | 'lmi-geoserver'
  | 'openstreetmap'

export type RoadIntelligenceOpenDataProvider =
  | 'vegagerdin'
  | 'lmi'
  | 'openstreetmap'

export type RoadIntelligenceDataRole =
  | 'basemap'
  | 'road-overlay'
  | 'segment-state'
  | 'weather-observation'
  | 'auxiliary-poi'

export type RoadIntelligenceCorsStatus =
  | 'browser-confirmed'
  | 'proxy-likely-required'
  | 'unknown'

export type RoadIntelligenceProductionReadiness =
  | 'research-only'
  | 'prototype-ok'
  | 'production-needs-review'

export type RoadIntelligenceOpenDataSource = {
  id: RoadIntelligenceOpenDataSourceId
  provider: RoadIntelligenceOpenDataProvider
  name: string
  roles: readonly RoadIntelligenceDataRole[]
  endpoints: readonly string[]
  licenseName: string
  licenseUrl: string
  attribution: string
  corsStatus: RoadIntelligenceCorsStatus
  productionReadiness: RoadIntelligenceProductionReadiness
  cacheGuidance: string
  notes: readonly string[]
}

export const VEGAGERDIN_ATTRIBUTION = 'Byggt á gögnum frá Vegagerðinni.'
export const LMI_ATTRIBUTION_DATASET_PLACEHOLDER =
  'Inniheldur gögn frá {dataset} gagnagrunni Landmælinga Íslands frá {retrievedAt}.'
export const OPENSTREETMAP_ATTRIBUTION = 'OpenStreetMap contributors'

export function formatLmiAttribution(dataset: string, retrievedAt: string): string {
  return LMI_ATTRIBUTION_DATASET_PLACEHOLDER
    .replace('{dataset}', dataset)
    .replace('{retrievedAt}', retrievedAt)
}

export const ROAD_INTELLIGENCE_OPEN_DATA_SOURCES: readonly RoadIntelligenceOpenDataSource[] = [
  {
    id: 'vegagerdin-vegakerfi',
    provider: 'vegagerdin',
    name: 'Vegagerðin vegakerfi MapServer',
    roles: ['road-overlay'],
    endpoints: [
      'https://vegasja.vegagerdin.is/arcgis/rest/services/data/vegakerfi/MapServer',
    ],
    licenseName: 'Vegagerðin gjaldfrjáls vefþjónustugögn',
    licenseUrl: 'https://www.vegagerdin.is/vegagerdin/gagnasafn/vefthjonustur/skilmalar-vefthjonustur',
    attribution: VEGAGERDIN_ATTRIBUTION,
    corsStatus: 'proxy-likely-required',
    productionReadiness: 'production-needs-review',
    cacheGuidance: 'Use a same-origin allowlisted proxy for browser map use until direct CORS is confirmed.',
    notes: [
      'CORS checked 2026-07-20 with Origin https://www.teskeid.is; response did not include Access-Control-Allow-Origin.',
      'Good candidate for road overlay and road graph discovery, but not production without attribution and cache review.',
    ],
  },
  {
    id: 'vegagerdin-faerd',
    provider: 'vegagerdin',
    name: 'Vegagerðin færð FeatureServer',
    roles: ['road-overlay', 'segment-state'],
    endpoints: [
      'https://vegasja.vegagerdin.is/arcgis/rest/services/data/faerd/FeatureServer',
    ],
    licenseName: 'Vegagerðin gjaldfrjáls vefþjónustugögn',
    licenseUrl: 'https://www.vegagerdin.is/vegagerdin/gagnasafn/vefthjonustur/skilmalar-vefthjonustur',
    attribution: VEGAGERDIN_ATTRIBUTION,
    corsStatus: 'proxy-likely-required',
    productionReadiness: 'production-needs-review',
    cacheGuidance: 'Treat live road condition state as volatile; use short server-side cache and avoid repeated geometry fetches.',
    notes: [
      'CORS checked 2026-07-20 with Origin https://www.teskeid.is; response did not include Access-Control-Allow-Origin.',
      'The IdButur concept is useful for future segment-state, but exact layers need a separate M2B/M3 validation.',
    ],
  },
  {
    id: 'vegagerdin-vedur-current',
    provider: 'vegagerdin',
    name: 'Vegagerðin current weather measurements',
    roles: ['weather-observation', 'segment-state'],
    endpoints: [
      'https://gagnaveita.vegagerdin.is/api/vedur2014_1',
    ],
    licenseName: 'Vegagerðin gjaldfrjáls vefþjónustugögn',
    licenseUrl: 'https://www.vegagerdin.is/vegagerdin/gagnasafn/vefthjonustur/skilmalar-vefthjonustur',
    attribution: VEGAGERDIN_ATTRIBUTION,
    corsStatus: 'unknown',
    productionReadiness: 'prototype-ok',
    cacheGuidance: 'Already fetched server-side by cron and cached in weather_cache/history; do not add new direct browser fetches.',
    notes: [
      'Teskeið already parses this endpoint in lib/weather/providers/vegagerdinCurrent.server.ts.',
      'Use gustLast10MinMs when available for user-facing wind status decisions involving Vegagerðin observations.',
    ],
  },
  {
    id: 'lmi-geoserver',
    provider: 'lmi',
    name: 'Landmælingar Íslands GeoServer',
    roles: ['basemap'],
    endpoints: [
      'https://gis.lmi.is/geoserver/ows',
      'https://gis.lmi.is/geoserver/web/',
    ],
    licenseName: 'Creative Commons Attribution 4.0 International',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    attribution: LMI_ATTRIBUTION_DATASET_PLACEHOLDER,
    corsStatus: 'browser-confirmed',
    productionReadiness: 'production-needs-review',
    cacheGuidance: 'Use WMTS/WMS for the first prototype; choose exact dataset/layer and attribution date before production.',
    notes: [
      'CORS checked 2026-07-20 against WMS GetCapabilities; response included Access-Control-Allow-Origin: *.',
      'Best first candidate for an open basemap, but exact layer names and style need M2A validation.',
    ],
  },
  {
    id: 'openstreetmap',
    provider: 'openstreetmap',
    name: 'OpenStreetMap data',
    roles: ['auxiliary-poi', 'road-overlay'],
    endpoints: [
      'https://www.openstreetmap.org/copyright/en-US',
      'https://osmfoundation.org/wiki/Licence/Attribution_Guidelines',
    ],
    licenseName: 'Open Data Commons Open Database License',
    licenseUrl: 'https://opendatacommons.org/licenses/odbl/',
    attribution: OPENSTREETMAP_ATTRIBUTION,
    corsStatus: 'unknown',
    productionReadiness: 'production-needs-review',
    cacheGuidance: 'Keep OSM as a separate attributed auxiliary layer until derived-database implications are reviewed.',
    notes: [
      'Useful for POI and routing experiments.',
      'Do not merge OSM road geometry into proprietary Teskeið road graph without a separate ODbL review.',
    ],
  },
] as const

export function getRoadIntelligenceOpenDataSource(
  id: RoadIntelligenceOpenDataSourceId,
): RoadIntelligenceOpenDataSource {
  const source = ROAD_INTELLIGENCE_OPEN_DATA_SOURCES.find(item => item.id === id)
  if (!source) {
    throw new Error(`Unknown Road Intelligence open data source: ${id}`)
  }
  return source
}

export function getRoadIntelligenceAttributions(
  sourceIds: readonly RoadIntelligenceOpenDataSourceId[],
): string[] {
  const attributions = new Set<string>()
  for (const id of sourceIds) {
    attributions.add(getRoadIntelligenceOpenDataSource(id).attribution)
  }
  return Array.from(attributions)
}

export function needsRoadIntelligenceMapProxy(
  sourceId: RoadIntelligenceOpenDataSourceId,
): boolean {
  return getRoadIntelligenceOpenDataSource(sourceId).corsStatus === 'proxy-likely-required'
}
