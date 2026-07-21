import { describe, expect, it } from 'vitest'
import {
  buildLmiWmsUrl,
  buildLmiWmtsTileUrl,
  isAllowedLmiTileContentType,
  parseLmiTileRequest,
  parseLmiWmsTileRequest,
} from '@/lib/road-intelligence/lmiTileProxy'

describe('parseLmiTileRequest', () => {
  function params(z: string, x: string, y: string) {
    return new URLSearchParams({ z, x, y })
  }

  it('parses valid z/x/y', () => {
    const result = parseLmiTileRequest(params('6', '33', '20'))
    expect(result).toEqual({ ok: true, z: 6, x: 33, y: 20 })
  })

  it('parses zoom 0 tile 0/0', () => {
    const result = parseLmiTileRequest(params('0', '0', '0'))
    expect(result).toEqual({ ok: true, z: 0, x: 0, y: 0 })
  })

  it('rejects missing z', () => {
    const p = new URLSearchParams({ x: '0', y: '0' })
    const result = parseLmiTileRequest(p)
    expect(result).toEqual({ ok: false, error: 'invalid_z' })
  })

  it('rejects z above MAX_ZOOM (22)', () => {
    const result = parseLmiTileRequest(params('23', '0', '0'))
    expect(result).toEqual({ ok: false, error: 'invalid_z' })
  })

  it('rejects negative z', () => {
    const result = parseLmiTileRequest(params('-1', '0', '0'))
    expect(result).toEqual({ ok: false, error: 'invalid_z' })
  })

  it('rejects x out of range for zoom', () => {
    // At zoom 2, max coord = 2^2 - 1 = 3
    const result = parseLmiTileRequest(params('2', '4', '0'))
    expect(result).toEqual({ ok: false, error: 'invalid_x' })
  })

  it('rejects y out of range for zoom', () => {
    // At zoom 2, max coord = 3
    const result = parseLmiTileRequest(params('2', '0', '4'))
    expect(result).toEqual({ ok: false, error: 'invalid_y' })
  })

  it('rejects non-integer x', () => {
    const result = parseLmiTileRequest(params('6', '1.5', '0'))
    expect(result).toEqual({ ok: false, error: 'invalid_x' })
  })

  it('accepts max valid coords at zoom 22', () => {
    const max = String(Math.pow(2, 22) - 1)
    const result = parseLmiTileRequest(params('22', max, max))
    expect(result).toEqual({ ok: true, z: 22, x: Math.pow(2, 22) - 1, y: Math.pow(2, 22) - 1 })
  })
})

describe('buildLmiWmtsTileUrl', () => {
  it('includes TILEMATRIX, TILEROW, TILECOL', () => {
    const url = buildLmiWmtsTileUrl(6, 33, 20)
    expect(url).toContain('TILEMATRIX=EPSG%3A3857%3A6')
    expect(url).toContain('TILEROW=20')
    expect(url).toContain('TILECOL=33')
  })

  it('targets GeoWebCache WMTS endpoint', () => {
    const url = buildLmiWmtsTileUrl(6, 33, 20)
    expect(url).toContain('gis.lmi.is/geoserver/gwc/service/wmts')
  })

  it('requests LMI_Island_einfalt layer', () => {
    const url = buildLmiWmtsTileUrl(6, 33, 20)
    expect(url).toContain('LAYER=LMI_Island_einfalt')
  })
})

describe('parseLmiWmsTileRequest', () => {
  it('parses valid WebMercator bbox', () => {
    const p = new URLSearchParams({ bbox: '-2000000,9000000,-1800000,9200000' })
    const result = parseLmiWmsTileRequest(p)
    expect(result).toEqual({ ok: true, bbox: [-2000000, 9000000, -1800000, 9200000] })
  })

  it('rejects missing bbox', () => {
    const result = parseLmiWmsTileRequest(new URLSearchParams())
    expect(result).toEqual({ ok: false, error: 'invalid_bbox' })
  })

  it('rejects bbox with only 3 parts', () => {
    const p = new URLSearchParams({ bbox: '-2000000,9000000,-1800000' })
    const result = parseLmiWmsTileRequest(p)
    expect(result).toEqual({ ok: false, error: 'invalid_bbox' })
  })

  it('rejects bbox where minX >= maxX', () => {
    const p = new URLSearchParams({ bbox: '-1800000,9000000,-2000000,9200000' })
    const result = parseLmiWmsTileRequest(p)
    expect(result).toEqual({ ok: false, error: 'invalid_bbox' })
  })

  it('rejects bbox exceeding WebMercator bounds', () => {
    const limit = 20037508.342789244
    const p = new URLSearchParams({ bbox: `-${limit + 1},9000000,-1800000,9200000` })
    const result = parseLmiWmsTileRequest(p)
    expect(result).toEqual({ ok: false, error: 'invalid_bbox' })
  })

  it('rejects non-numeric bbox', () => {
    const p = new URLSearchParams({ bbox: 'a,b,c,d' })
    const result = parseLmiWmsTileRequest(p)
    expect(result).toEqual({ ok: false, error: 'invalid_bbox' })
  })
})

describe('buildLmiWmsUrl', () => {
  it('includes BBOX parameter', () => {
    const url = buildLmiWmsUrl([-2000000, 9000000, -1800000, 9200000])
    expect(url).toContain('BBOX=-2000000,9000000,-1800000,9200000')
  })

  it('targets LMÍ OWS WMS endpoint', () => {
    const url = buildLmiWmsUrl([-2000000, 9000000, -1800000, 9200000])
    expect(url).toContain('gis.lmi.is/geoserver/ows')
  })

  it('requests LMI_Island_einfalt layer', () => {
    const url = buildLmiWmsUrl([-2000000, 9000000, -1800000, 9200000])
    expect(url).toContain('LAYERS=LMI_Island_einfalt')
  })

  it('requests EPSG:3857', () => {
    const url = buildLmiWmsUrl([-2000000, 9000000, -1800000, 9200000])
    expect(url).toContain('CRS=EPSG%3A3857')
  })
})

describe('isAllowedLmiTileContentType', () => {
  it('accepts image/png', () => {
    expect(isAllowedLmiTileContentType('image/png')).toBe(true)
  })

  it('accepts image/png with charset', () => {
    expect(isAllowedLmiTileContentType('image/png; charset=utf-8')).toBe(true)
  })

  it('rejects image/jpeg', () => {
    expect(isAllowedLmiTileContentType('image/jpeg')).toBe(false)
  })

  it('rejects null', () => {
    expect(isAllowedLmiTileContentType(null)).toBe(false)
  })

  it('rejects application/json', () => {
    expect(isAllowedLmiTileContentType('application/json')).toBe(false)
  })
})
