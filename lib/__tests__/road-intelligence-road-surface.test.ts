import { describe, expect, it } from 'vitest'
import {
  ROAD_SURFACE_LAYER_ID,
  ROAD_SURFACE_MAX_FEATURES,
  buildRouteSurfaceBbox,
  buildVegagerdinRoadSurfaceQueryUrl,
  classifyVegagerdinRoadSurface,
  isAllowedRoadSurfaceContentType,
  normalizeVegagerdinRoadSurfaceGeoJson,
  parseRoadSurfaceBboxRequest,
  summarizeRouteRoadSurface,
} from '@/lib/road-intelligence/vegagerdinRoadSurface'

describe('parseRoadSurfaceBboxRequest', () => {
  it('accepts a valid Iceland WGS84 bbox', () => {
    expect(parseRoadSurfaceBboxRequest(new URLSearchParams({ bbox: '-25,63,-13,67' }))).toEqual({
      ok: true,
      bbox: [-25, 63, -13, 67],
    })
  })

  it('rejects invalid and out-of-range bboxes', () => {
    expect(parseRoadSurfaceBboxRequest(new URLSearchParams({ bbox: '-13,63,-25,67' }))).toEqual({
      ok: false,
      error: 'invalid_bbox',
    })
    expect(parseRoadSurfaceBboxRequest(new URLSearchParams({ bbox: '4,50,32,60' }))).toEqual({
      ok: false,
      error: 'bbox_out_of_range',
    })
  })
})

describe('buildVegagerdinRoadSurfaceQueryUrl', () => {
  const bbox: [number, number, number, number] = [-25, 63, -13, 67]

  it('targets the Vegagerðin Slitlag layer and requests GeoJSON', () => {
    const url = new URL(buildVegagerdinRoadSurfaceQueryUrl(bbox))
    expect(url.origin).toBe('https://vegasja.vegagerdin.is')
    expect(url.pathname).toBe(
      `/arcgis/rest/services/vegakerfi/yfirbord/MapServer/${ROAD_SURFACE_LAYER_ID}/query`,
    )
    expect(url.searchParams.get('f')).toBe('geojson')
    expect(url.searchParams.get('returnGeometry')).toBe('true')
  })

  it('requests the surface fields needed by Teskeið', () => {
    const url = new URL(buildVegagerdinRoadSurfaceQueryUrl(bbox))
    expect(url.searchParams.get('outFields')).toContain('GERD_SL')
    expect(url.searchParams.get('outFields')).toContain('SLITLAGLENGD')
    expect(url.searchParams.get('outFields')).toContain('KAFLIVEGURHEITI')
    expect(url.searchParams.get('resultRecordCount')).toBe(String(ROAD_SURFACE_MAX_FEATURES))
  })
})

describe('classifyVegagerdinRoadSurface', () => {
  it('classifies provider codes and normalized labels', () => {
    expect(classifyVegagerdinRoadSurface(0)).toBe('gravel')
    expect(classifyVegagerdinRoadSurface('0')).toBe('gravel')
    expect(classifyVegagerdinRoadSurface('Möl')).toBe('gravel')
    expect(classifyVegagerdinRoadSurface('gravel')).toBe('gravel')
    expect(classifyVegagerdinRoadSurface(1)).toBe('paved')
    expect(classifyVegagerdinRoadSurface('1')).toBe('paved')
    expect(classifyVegagerdinRoadSurface('Bundið slitlag')).toBe('paved')
    expect(classifyVegagerdinRoadSurface('paved')).toBe('paved')
  })

  it('uses unknown for unsupported values', () => {
    expect(classifyVegagerdinRoadSurface(null)).toBe('unknown')
    expect(classifyVegagerdinRoadSurface('óskráð')).toBe('unknown')
  })
})

describe('isAllowedRoadSurfaceContentType', () => {
  it('allows JSON and GeoJSON content types', () => {
    expect(isAllowedRoadSurfaceContentType('application/json; charset=utf-8')).toBe(true)
    expect(isAllowedRoadSurfaceContentType('application/geo+json')).toBe(true)
  })

  it('rejects non-json content types', () => {
    expect(isAllowedRoadSurfaceContentType('image/png')).toBe(false)
    expect(isAllowedRoadSurfaceContentType(null)).toBe(false)
  })
})

describe('normalizeVegagerdinRoadSurfaceGeoJson', () => {
  it('adds Teskeið road surface properties', () => {
    const result = normalizeVegagerdinRoadSurfaceGeoJson({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [[-21.9, 64.1], [-21.8, 64.2]] },
          properties: { GERD_SL: 0, KAFLIVEGURHEITI: 'Kaldadalsvegur' },
        },
      ],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const feature = (result.geojson['features'] as Array<Record<string, unknown>>)[0]
    expect(feature['properties']).toMatchObject({
      GERD_SL: 0,
      teskeidRoadSurfaceType: 'gravel',
      teskeidRoadSurfaceLabel: 'Möl',
    })
  })
})

describe('summarizeRouteRoadSurface', () => {
  const routePoints = [
    { lat: 64.1, lon: -21.9 },
    { lat: 64.2, lon: -21.8 },
    { lat: 64.3, lon: -21.7 },
  ]

  it('detects gravel features close to the route', () => {
    const summary = summarizeRouteRoadSurface({
      routePoints,
      surfaceGeoJson: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: [[-21.91, 64.11], [-21.79, 64.21]] },
            properties: {
              GERD_SL: 0,
              SLITLAGLENGD: 1234,
              KAFLIVEGURHEITI: 'Kaldadalsvegur',
            },
          },
        ],
      },
      maxDistanceM: 2_000,
    })

    expect(summary.checked).toBe(true)
    expect(summary.hasGravel).toBe(true)
    expect(summary.gravelIssueCount).toBe(1)
    expect(summary.gravelLengthM).toBe(1234)
    expect(summary.gravelRoadNames).toContain('Kaldadalsvegur')
  })

  it('ignores paved and distant gravel features', () => {
    const summary = summarizeRouteRoadSurface({
      routePoints,
      surfaceGeoJson: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: [[-21.91, 64.11], [-21.79, 64.21]] },
            properties: { GERD_SL: 1 },
          },
          {
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: [[-19.5, 65.5], [-19.4, 65.6]] },
            properties: { GERD_SL: 0 },
          },
        ],
      },
      maxDistanceM: 300,
    })

    expect(summary.checked).toBe(true)
    expect(summary.hasGravel).toBe(false)
    expect(summary.gravelIssueCount).toBe(0)
  })
})

describe('buildRouteSurfaceBbox', () => {
  it('returns a padded route bbox', () => {
    expect(buildRouteSurfaceBbox([
      { lat: 64, lon: -22 },
      { lat: 65, lon: -20 },
    ], 0.1)).toEqual([-22.1, 63.9, -19.9, 65.1])
  })
})
