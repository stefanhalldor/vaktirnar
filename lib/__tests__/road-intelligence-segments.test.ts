import { describe, expect, it } from 'vitest'
import {
  buildVegagerdinSegmentsQueryUrl,
  classifyVegagerdinRoadStatus,
  isAllowedSegmentsContentType,
  normalizeRoadConditionColor,
  normalizeVegagerdinRoadSegmentGeoJson,
  parseSegmentsBboxRequest,
  FAERD_FEATURE_LAYER_ID,
  SEGMENTS_MAX_FEATURES,
} from '@/lib/road-intelligence/vegagerdinSegments'

describe('parseSegmentsBboxRequest', () => {
  it('accepts a valid WGS84 bbox', () => {
    const params = new URLSearchParams({ bbox: '-25,63,-13,67' })
    expect(parseSegmentsBboxRequest(params)).toEqual({
      ok: true,
      bbox: [-25, 63, -13, 67],
    })
  })

  it('accepts decimal bbox values', () => {
    const params = new URLSearchParams({ bbox: '-24.5,63.9,-13.2,66.8' })
    const result = parseSegmentsBboxRequest(params)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.bbox[0]).toBeCloseTo(-24.5)
      expect(result.bbox[2]).toBeCloseTo(-13.2)
    }
  })

  it('rejects missing bbox param', () => {
    expect(parseSegmentsBboxRequest(new URLSearchParams())).toEqual({
      ok: false,
      error: 'invalid_bbox',
    })
  })

  it('rejects fewer than 4 components', () => {
    expect(parseSegmentsBboxRequest(new URLSearchParams({ bbox: '-25,63,-13' }))).toEqual({
      ok: false,
      error: 'invalid_bbox',
    })
  })

  it('rejects non-numeric values', () => {
    expect(parseSegmentsBboxRequest(new URLSearchParams({ bbox: '-25,abc,-13,67' }))).toEqual({
      ok: false,
      error: 'invalid_bbox',
    })
  })

  it('rejects inverted bbox (west >= east)', () => {
    expect(parseSegmentsBboxRequest(new URLSearchParams({ bbox: '-13,63,-25,67' }))).toEqual({
      ok: false,
      error: 'invalid_bbox',
    })
  })

  it('rejects inverted bbox (south >= north)', () => {
    expect(parseSegmentsBboxRequest(new URLSearchParams({ bbox: '-25,67,-13,63' }))).toEqual({
      ok: false,
      error: 'invalid_bbox',
    })
  })

  it('rejects longitude outside [-180, 180]', () => {
    expect(parseSegmentsBboxRequest(new URLSearchParams({ bbox: '-181,63,-13,67' }))).toEqual({
      ok: false,
      error: 'invalid_bbox',
    })
    expect(parseSegmentsBboxRequest(new URLSearchParams({ bbox: '-25,63,181,67' }))).toEqual({
      ok: false,
      error: 'invalid_bbox',
    })
  })

  it('rejects latitude outside [-90, 90]', () => {
    expect(parseSegmentsBboxRequest(new URLSearchParams({ bbox: '-25,-91,-13,67' }))).toEqual({
      ok: false,
      error: 'invalid_bbox',
    })
    expect(parseSegmentsBboxRequest(new URLSearchParams({ bbox: '-25,63,-13,91' }))).toEqual({
      ok: false,
      error: 'invalid_bbox',
    })
  })

  it('rejects a world-scale bbox', () => {
    expect(parseSegmentsBboxRequest(new URLSearchParams({ bbox: '-180,-90,180,90' }))).toEqual({
      ok: false,
      error: 'bbox_out_of_range',
    })
  })

  it('rejects a bbox that does not intersect Iceland', () => {
    // Continental Europe
    expect(parseSegmentsBboxRequest(new URLSearchParams({ bbox: '4,50,32,60' }))).toEqual({
      ok: false,
      error: 'bbox_out_of_range',
    })
    // North America
    expect(parseSegmentsBboxRequest(new URLSearchParams({ bbox: '-120,45,-60,55' }))).toEqual({
      ok: false,
      error: 'bbox_out_of_range',
    })
  })

  it('rejects a bbox exceeding max longitude or latitude span', () => {
    // 35° lon span (> MAX_LON_SPAN=30), but intersects Iceland
    expect(parseSegmentsBboxRequest(new URLSearchParams({ bbox: '-27,63,8,67' }))).toEqual({
      ok: false,
      error: 'bbox_out_of_range',
    })
    // 20° lat span (> MAX_LAT_SPAN=15), but intersects Iceland
    expect(parseSegmentsBboxRequest(new URLSearchParams({ bbox: '-25,55,-13,75' }))).toEqual({
      ok: false,
      error: 'bbox_out_of_range',
    })
  })

  it('accepts a realistic MapLibre initial viewport bbox over Iceland', () => {
    // Approx viewport at center=[-18.9, 64.9] zoom=6 on a 546×879px display
    const result = parseSegmentsBboxRequest(
      new URLSearchParams({ bbox: '-25.5,61.2,-12.3,68.3' }),
    )
    expect(result.ok).toBe(true)
  })
})

describe('buildVegagerdinSegmentsQueryUrl', () => {
  const bbox: [number, number, number, number] = [-25, 63, -13, 67]

  it('targets the faerd FeatureServer overview road-condition layer', () => {
    const url = new URL(buildVegagerdinSegmentsQueryUrl(bbox))
    expect(url.origin).toBe('https://vegasja.vegagerdin.is')
    expect(url.pathname).toBe(
      `/arcgis/rest/services/data/faerd/FeatureServer/${FAERD_FEATURE_LAYER_ID}/query`,
    )
  })

  it('uses WGS84 input and output SRS', () => {
    const url = new URL(buildVegagerdinSegmentsQueryUrl(bbox))
    expect(url.searchParams.get('inSR')).toBe('4326')
    expect(url.searchParams.get('outSR')).toBe('4326')
  })

  it('passes the bbox as the geometry envelope', () => {
    const url = new URL(buildVegagerdinSegmentsQueryUrl(bbox))
    expect(url.searchParams.get('geometryType')).toBe('esriGeometryEnvelope')
    expect(url.searchParams.get('geometry')).toBe('-25,63,-13,67')
    expect(url.searchParams.get('spatialRel')).toBe('esriSpatialRelIntersects')
  })

  it('requests GeoJSON output with geometry and only the fields used by the prototype', () => {
    const url = new URL(buildVegagerdinSegmentsQueryUrl(bbox))
    expect(url.searchParams.get('f')).toBe('geojson')
    expect(url.searchParams.get('outFields')).toContain('AST1_LITUR')
    expect(url.searchParams.get('outFields')).toContain('AST1_NAFN')
    expect(url.searchParams.get('outFields')).toContain('NAFN_LEIDAR')
    expect(url.searchParams.get('returnGeometry')).toBe('true')
  })

  it('caps results at SEGMENTS_MAX_FEATURES', () => {
    const url = new URL(buildVegagerdinSegmentsQueryUrl(bbox))
    expect(url.searchParams.get('resultRecordCount')).toBe(String(SEGMENTS_MAX_FEATURES))
  })

  it('uses a permissive where clause', () => {
    const url = new URL(buildVegagerdinSegmentsQueryUrl(bbox))
    expect(url.searchParams.get('where')).toBe('1=1')
  })
})

describe('isAllowedSegmentsContentType', () => {
  it('allows application/json', () => {
    expect(isAllowedSegmentsContentType('application/json')).toBe(true)
    expect(isAllowedSegmentsContentType('application/json; charset=utf-8')).toBe(true)
  })

  it('allows application/geo+json', () => {
    expect(isAllowedSegmentsContentType('application/geo+json')).toBe(true)
    expect(isAllowedSegmentsContentType('application/geo+json; charset=utf-8')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(isAllowedSegmentsContentType('Application/JSON')).toBe(true)
    expect(isAllowedSegmentsContentType('APPLICATION/GEO+JSON')).toBe(true)
  })

  it('rejects image and text types', () => {
    expect(isAllowedSegmentsContentType('image/png')).toBe(false)
    expect(isAllowedSegmentsContentType('text/html')).toBe(false)
    expect(isAllowedSegmentsContentType('text/xml')).toBe(false)
  })

  it('rejects null', () => {
    expect(isAllowedSegmentsContentType(null)).toBe(false)
  })
})

describe('normalizeRoadConditionColor', () => {
  it('normalizes valid hex colors to uppercase', () => {
    expect(normalizeRoadConditionColor('#00df30')).toBe('#00DF30')
    expect(normalizeRoadConditionColor('  #ffdf00  ')).toBe('#FFDF00')
  })

  it('rejects invalid colors', () => {
    expect(normalizeRoadConditionColor('red')).toBeNull()
    expect(normalizeRoadConditionColor('#fff')).toBeNull()
    expect(normalizeRoadConditionColor(null)).toBeNull()
  })
})

describe('classifyVegagerdinRoadStatus', () => {
  it('classifies known Icelandic condition labels before color fallback', () => {
    expect(classifyVegagerdinRoadStatus({ AST1_NAFN: 'Greiðfært' })).toBe('clear')
    expect(classifyVegagerdinRoadStatus({ AST1_NAFN: 'Hálkublettir' })).toBe('caution')
    expect(classifyVegagerdinRoadStatus({ AST1_NAFN: 'Flughált' })).toBe('danger')
    expect(classifyVegagerdinRoadStatus({ AST1_NAFN: 'Lokað' })).toBe('closed')
  })

  it('falls back to provider colors when labels are absent', () => {
    expect(classifyVegagerdinRoadStatus({ AST1_LITUR: '#00DF30' })).toBe('clear')
    expect(classifyVegagerdinRoadStatus({ AST1_LITUR: '#FFDF00' })).toBe('caution')
    expect(classifyVegagerdinRoadStatus({ AST1_LITUR: '#FFA500' })).toBe('difficult')
    expect(classifyVegagerdinRoadStatus({ AST1_LITUR: '#0000FF' })).toBe('danger')
  })

  it('uses unknown for unsupported labels and colors', () => {
    expect(classifyVegagerdinRoadStatus({ AST1_NAFN: 'Óskráð', AST1_LITUR: '#123456' })).toBe(
      'unknown',
    )
  })
})

describe('normalizeVegagerdinRoadSegmentGeoJson', () => {
  it('rejects non-GeoJSON payloads', () => {
    expect(normalizeVegagerdinRoadSegmentGeoJson(null)).toEqual({ ok: false })
    expect(normalizeVegagerdinRoadSegmentGeoJson({ type: 'Feature' })).toEqual({ ok: false })
    expect(
      normalizeVegagerdinRoadSegmentGeoJson({ type: 'FeatureCollection', features: 'nope' }),
    ).toEqual({ ok: false })
  })

  it('adds Teskeið road-condition properties to features', () => {
    const result = normalizeVegagerdinRoadSegmentGeoJson({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [[-21.9, 64.1], [-21.8, 64.2]] },
          properties: {
            NAFN_LEIDAR: 'Hringvegur',
            AST1_NAFN: 'Greiðfært',
            AST1_LITUR: '#00df30',
          },
        },
      ],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.featureCount).toBe(1)
    const feature = (result.geojson['features'] as Array<Record<string, unknown>>)[0]
    expect(feature['properties']).toMatchObject({
      NAFN_LEIDAR: 'Hringvegur',
      AST1_NAFN: 'Greiðfært',
      AST1_LITUR: '#00df30',
      teskeidRoadStatus: 'clear',
      teskeidRoadStatusLabel: 'Greiðfært',
      teskeidRoadStatusColor: '#00DF30',
    })
  })

  it('caps features to SEGMENTS_MAX_FEATURES even if upstream ignores the query limit', () => {
    const features = Array.from({ length: SEGMENTS_MAX_FEATURES + 2 }, (_, index) => ({
      type: 'Feature',
      properties: { OBJECTID: index },
    }))
    const result = normalizeVegagerdinRoadSegmentGeoJson({
      type: 'FeatureCollection',
      features,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.featureCount).toBe(SEGMENTS_MAX_FEATURES)
    expect((result.geojson['features'] as unknown[])).toHaveLength(SEGMENTS_MAX_FEATURES)
  })
})
