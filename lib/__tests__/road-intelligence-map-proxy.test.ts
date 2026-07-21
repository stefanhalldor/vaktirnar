import { describe, expect, it } from 'vitest'
import {
  buildVegagerdinMapExportUrl,
  isAllowedVegagerdinMapContentType,
  parseRoadIntelligenceMapProxyRequest,
} from '@/lib/road-intelligence/vegagerdinMapProxy'

describe('Road Intelligence Vegagerdin map proxy helpers', () => {
  it('accepts only the allowlisted vegakerfi source with a valid WebMercator bbox', () => {
    const params = new URLSearchParams({
      source: 'vegakerfi',
      bbox: '-2778301.067,-1118889.975,1669792.362,3339203.454',
    })

    expect(parseRoadIntelligenceMapProxyRequest(params)).toEqual({
      ok: true,
      sourceId: 'vegakerfi',
      bbox: [-2778301.067, -1118889.975, 1669792.362, 3339203.454],
    })
  })

  it('rejects arbitrary sources and invalid bbox values', () => {
    expect(parseRoadIntelligenceMapProxyRequest(new URLSearchParams({
      source: 'https://example.com/open-proxy',
      bbox: '-1,-1,1,1',
    }))).toEqual({ ok: false, error: 'invalid_source' })

    expect(parseRoadIntelligenceMapProxyRequest(new URLSearchParams({
      source: 'vegakerfi',
      bbox: '-1,1,1,-1',
    }))).toEqual({ ok: false, error: 'invalid_bbox' })

    expect(parseRoadIntelligenceMapProxyRequest(new URLSearchParams({
      source: 'vegakerfi',
      bbox: '-999999999,-1,1,1',
    }))).toEqual({ ok: false, error: 'invalid_bbox' })
  })

  it('builds a fixed ArcGIS export URL instead of accepting arbitrary upstream URLs', () => {
    const url = new URL(buildVegagerdinMapExportUrl('vegakerfi', [-1, -2, 3, 4]))

    expect(url.origin).toBe('https://vegasja.vegagerdin.is')
    expect(url.pathname).toBe('/arcgis/rest/services/data/vegakerfi/MapServer/export')
    expect(url.searchParams.get('bbox')).toBe('-1,-2,3,4')
    expect(url.searchParams.get('bboxSR')).toBe('3857')
    expect(url.searchParams.get('imageSR')).toBe('3857')
    expect(url.searchParams.get('size')).toBe('256,256')
    expect(url.searchParams.get('format')).toBe('png32')
    expect(url.searchParams.get('transparent')).toBe('true')
    expect(url.searchParams.get('f')).toBe('image')
  })

  it('only allows PNG map responses from upstream', () => {
    expect(isAllowedVegagerdinMapContentType('image/png')).toBe(true)
    expect(isAllowedVegagerdinMapContentType('image/png;charset=utf-8')).toBe(true)
    expect(isAllowedVegagerdinMapContentType('text/xml;charset=UTF-8')).toBe(false)
    expect(isAllowedVegagerdinMapContentType(null)).toBe(false)
  })
})
