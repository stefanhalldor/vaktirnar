import { describe, it, expect } from 'vitest'
import { parseVedurstofanXml } from '@/lib/weather/providers/vedurstofanXml'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SINGLE_STATION_XML = `<?xml version="1.0" encoding="UTF-8"?>
<forecasts>
  <station id="31392" valid="1">
    <name>Hellisheiði</name>
    <atime>2026-07-12 06:00:00</atime>
    <err></err>
    <forecast>
      <ftime>2026-07-12 09:00:00</ftime>
      <F>11</F>
      <D>SSA</D>
      <T>9</T>
      <R>0,6</R>
      <W>Lítils háttar rigning</W>
    </forecast>
    <forecast>
      <ftime>2026-07-12 12:00:00</ftime>
      <F>8</F>
      <D>S</D>
      <T>10</T>
      <R>0</R>
      <W>Skýjað</W>
    </forecast>
  </station>
</forecasts>`

const MULTI_STATION_XML = `<?xml version="1.0" encoding="UTF-8"?>
<forecasts>
  <station id="31392" valid="1">
    <name>Hellisheiði</name>
    <atime>2026-07-12 06:00:00</atime>
    <err></err>
    <forecast>
      <ftime>2026-07-12 09:00:00</ftime>
      <F>11</F>
      <D>SSA</D>
      <T>9</T>
      <R>0,6</R>
      <W>Lítils háttar rigning</W>
    </forecast>
  </station>
  <station id="571" valid="1">
    <name>Egilsstaðaflugvöllur</name>
    <atime>2026-07-12 06:00:00</atime>
    <err></err>
    <forecast>
      <ftime>2026-07-12 09:00:00</ftime>
      <F>4</F>
      <D>NA</D>
      <T>12</T>
      <R>0</R>
      <W>Skýlægt</W>
    </forecast>
  </station>
</forecasts>`

const WITH_GUSTS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<forecasts>
  <station id="31392" valid="1">
    <name>Hellisheiði</name>
    <atime>2026-07-12 06:00:00</atime>
    <err></err>
    <forecast>
      <ftime>2026-07-12 09:00:00</ftime>
      <F>11</F>
      <D>SSA</D>
      <T>9</T>
      <R>0,6</R>
      <FG>18</FG>
      <FX>22</FX>
      <W>Rok</W>
    </forecast>
  </station>
</forecasts>`

const MISSING_FIELDS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<forecasts>
  <station id="9999" valid="1">
    <name>Teststation</name>
    <atime></atime>
    <err></err>
    <forecast>
      <ftime>2026-07-12 09:00:00</ftime>
      <F>5</F>
    </forecast>
  </station>
</forecasts>`

const INVALID_STATION_XML = `<?xml version="1.0" encoding="UTF-8"?>
<forecasts>
  <station valid="1">
    <name>No ID</name>
    <atime>2026-07-12 06:00:00</atime>
    <err></err>
  </station>
</forecasts>`

const DECIMAL_COMMA_XML = `<?xml version="1.0" encoding="UTF-8"?>
<forecasts>
  <station id="5544" valid="1">
    <name>Höfn í Hornafirði</name>
    <atime>2026-07-12 06:00:00</atime>
    <err></err>
    <forecast>
      <ftime>2026-07-12 09:00:00</ftime>
      <F>7,5</F>
      <D>NA</D>
      <T>-2,3</T>
      <R>1,4</R>
      <W>Rok með slyddu</W>
    </forecast>
  </station>
</forecasts>`

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('parseVedurstofanXml', () => {
  describe('basic parsing', () => {
    it('returns one station for single-station XML', () => {
      const result = parseVedurstofanXml(SINGLE_STATION_XML)
      expect(result.stations).toHaveLength(1)
      expect(result.parseErrors).toHaveLength(0)
    })

    it('parses station id and name', () => {
      const { stations } = parseVedurstofanXml(SINGLE_STATION_XML)
      expect(stations[0].stationId).toBe('31392')
      expect(stations[0].stationName).toBe('Hellisheiði')
    })

    it('parses valid flag correctly', () => {
      const { stations } = parseVedurstofanXml(SINGLE_STATION_XML)
      expect(stations[0].valid).toBe(true)
    })

    it('converts atime to ISO UTC', () => {
      const { stations } = parseVedurstofanXml(SINGLE_STATION_XML)
      expect(stations[0].atimeIso).toBe('2026-07-12T06:00:00Z')
    })

    it('parses two forecast rows', () => {
      const { stations } = parseVedurstofanXml(SINGLE_STATION_XML)
      expect(stations[0].forecasts).toHaveLength(2)
    })

    it('converts ftime to ISO UTC', () => {
      const { stations } = parseVedurstofanXml(SINGLE_STATION_XML)
      expect(stations[0].forecasts[0].ftimeIso).toBe('2026-07-12T09:00:00Z')
      expect(stations[0].forecasts[1].ftimeIso).toBe('2026-07-12T12:00:00Z')
    })
  })

  describe('field parsing', () => {
    it('parses wind speed (F) as number', () => {
      const { stations } = parseVedurstofanXml(SINGLE_STATION_XML)
      expect(stations[0].forecasts[0].windSpeedMs).toBe(11)
    })

    it('parses wind direction (D) as text', () => {
      const { stations } = parseVedurstofanXml(SINGLE_STATION_XML)
      expect(stations[0].forecasts[0].windDirectionText).toBe('SSA')
    })

    it('parses temperature (T) as number', () => {
      const { stations } = parseVedurstofanXml(SINGLE_STATION_XML)
      expect(stations[0].forecasts[0].temperatureC).toBe(9)
    })

    it('parses precipitation (R) as precipitationMmPerHour', () => {
      const { stations } = parseVedurstofanXml(SINGLE_STATION_XML)
      expect(stations[0].forecasts[0].precipitationMmPerHour).toBeCloseTo(0.6)
    })

    it('preserves rawR identical to precipitationMmPerHour', () => {
      const { stations } = parseVedurstofanXml(SINGLE_STATION_XML)
      const row = stations[0].forecasts[0]
      expect(row.rawR).toBeCloseTo(0.6)
      expect(row.rawR).toBe(row.precipitationMmPerHour)
    })

    it('parses weather description (W) as text', () => {
      const { stations } = parseVedurstofanXml(SINGLE_STATION_XML)
      expect(stations[0].forecasts[0].weatherText).toBe('Lítils háttar rigning')
    })

    it('parses zero precipitation correctly', () => {
      const { stations } = parseVedurstofanXml(SINGLE_STATION_XML)
      expect(stations[0].forecasts[1].precipitationMmPerHour).toBe(0)
    })
  })

  describe('decimal comma handling', () => {
    it('converts Icelandic decimal comma in R to period', () => {
      const { stations } = parseVedurstofanXml(DECIMAL_COMMA_XML)
      expect(stations[0].forecasts[0].precipitationMmPerHour).toBeCloseTo(1.4)
    })

    it('converts Icelandic decimal comma in F to period', () => {
      const { stations } = parseVedurstofanXml(DECIMAL_COMMA_XML)
      expect(stations[0].forecasts[0].windSpeedMs).toBeCloseTo(7.5)
    })

    it('converts negative temperature with decimal comma', () => {
      const { stations } = parseVedurstofanXml(DECIMAL_COMMA_XML)
      expect(stations[0].forecasts[0].temperatureC).toBeCloseTo(-2.3)
    })
  })

  describe('multi-station parsing', () => {
    it('returns two stations for multi-station XML', () => {
      const { stations } = parseVedurstofanXml(MULTI_STATION_XML)
      expect(stations).toHaveLength(2)
    })

    it('correctly identifies each station by id', () => {
      const { stations } = parseVedurstofanXml(MULTI_STATION_XML)
      expect(stations[0].stationId).toBe('31392')
      expect(stations[1].stationId).toBe('571')
    })

    it('each station has its own forecasts', () => {
      const { stations } = parseVedurstofanXml(MULTI_STATION_XML)
      expect(stations[0].forecasts[0].windSpeedMs).toBe(11)
      expect(stations[1].forecasts[0].windSpeedMs).toBe(4)
    })
  })

  describe('gust fields (FG/FX)', () => {
    it('parses FG as gustMs when present', () => {
      const { stations } = parseVedurstofanXml(WITH_GUSTS_XML)
      expect(stations[0].forecasts[0].gustMs).toBe(18)
    })

    it('parses FX as maxWindMs when present', () => {
      const { stations } = parseVedurstofanXml(WITH_GUSTS_XML)
      expect(stations[0].forecasts[0].maxWindMs).toBe(22)
    })

    it('gustMs is null when FG is absent', () => {
      const { stations } = parseVedurstofanXml(SINGLE_STATION_XML)
      expect(stations[0].forecasts[0].gustMs).toBeNull()
    })

    it('maxWindMs is null when FX is absent', () => {
      const { stations } = parseVedurstofanXml(SINGLE_STATION_XML)
      expect(stations[0].forecasts[0].maxWindMs).toBeNull()
    })
  })

  describe('null safety for missing fields', () => {
    it('returns null for missing D, T, R, W fields', () => {
      const { stations } = parseVedurstofanXml(MISSING_FIELDS_XML)
      const row = stations[0].forecasts[0]
      expect(row.windDirectionText).toBeNull()
      expect(row.temperatureC).toBeNull()
      expect(row.precipitationMmPerHour).toBeNull()
      expect(row.rawR).toBeNull()
      expect(row.weatherText).toBeNull()
    })

    it('returns null atimeIso when atime is empty', () => {
      const { stations } = parseVedurstofanXml(MISSING_FIELDS_XML)
      expect(stations[0].atimeIso).toBeNull()
    })
  })

  describe('error handling', () => {
    it('returns empty stations and parse error for empty string', () => {
      const result = parseVedurstofanXml('')
      expect(result.stations).toHaveLength(0)
      expect(result.parseErrors.length).toBeGreaterThan(0)
    })

    it('skips station blocks with no id and records parse error', () => {
      const result = parseVedurstofanXml(INVALID_STATION_XML)
      expect(result.stations).toHaveLength(0)
      expect(result.parseErrors.some(e => e.includes('id'))).toBe(true)
    })

    it('returns empty stations and parse error for non-XML input', () => {
      const result = parseVedurstofanXml('not xml at all')
      expect(result.stations).toHaveLength(0)
      expect(result.parseErrors.length).toBeGreaterThan(0)
    })
  })
})
