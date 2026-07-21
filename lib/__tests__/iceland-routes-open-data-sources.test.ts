import { describe, expect, it } from 'vitest'
import {
  formatLmiAttribution,
  getRoadIntelligenceAttributions,
  getRoadIntelligenceOpenDataSource,
  needsRoadIntelligenceMapProxy,
  ROAD_INTELLIGENCE_OPEN_DATA_SOURCES,
  VEGAGERDIN_ATTRIBUTION,
} from '@/lib/iceland-routes/openDataSources'

const SOURCE_ID_RE = /^[a-z0-9-]+$/

describe('Road Intelligence open data sources', () => {
  it('keeps source IDs unique and slug-safe', () => {
    const ids = ROAD_INTELLIGENCE_OPEN_DATA_SOURCES.map(source => source.id)

    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) {
      expect(SOURCE_ID_RE.test(id), `source id "${id}" must be slug-safe`).toBe(true)
    }
  })

  it('requires license URLs and attribution for every source', () => {
    for (const source of ROAD_INTELLIGENCE_OPEN_DATA_SOURCES) {
      expect(source.licenseUrl).toMatch(/^https:\/\//)
      expect(source.attribution.trim().length).toBeGreaterThan(0)
      expect(source.endpoints.length).toBeGreaterThan(0)
      for (const endpoint of source.endpoints) {
        expect(endpoint).toMatch(/^https:\/\//)
      }
    }
  })

  it('marks Vegagerðin ArcGIS browser use as proxy-likely-required after CORS preflight', () => {
    expect(needsRoadIntelligenceMapProxy('vegagerdin-vegakerfi')).toBe(true)
    expect(needsRoadIntelligenceMapProxy('vegagerdin-faerd')).toBe(true)
  })

  it('marks LMÍ GeoServer as browser-confirmed for the first basemap prototype', () => {
    const source = getRoadIntelligenceOpenDataSource('lmi-geoserver')

    expect(source.roles).toContain('basemap')
    expect(source.corsStatus).toBe('browser-confirmed')
    expect(needsRoadIntelligenceMapProxy(source.id)).toBe(false)
  })

  it('deduplicates attribution strings for multiple Vegagerðin sources', () => {
    expect(getRoadIntelligenceAttributions([
      'vegagerdin-vegakerfi',
      'vegagerdin-faerd',
      'vegagerdin-vedur-current',
    ])).toEqual([VEGAGERDIN_ATTRIBUTION])
  })

  it('formats LMÍ attribution with dataset and retrieval date', () => {
    expect(formatLmiAttribution('IS 50V', '2026-07-20')).toBe(
      'Inniheldur gögn frá IS 50V gagnagrunni Landmælinga Íslands frá 2026-07-20.',
    )
  })
})
