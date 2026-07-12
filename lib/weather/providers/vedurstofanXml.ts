/**
 * Parser for Veðurstofan Íslands XML forecast service (type=forec).
 *
 * This module transforms raw XML from xmlweather.vedur.is into typed,
 * nullable forecast rows. It does NOT make network requests.
 *
 * Endpoint shape:
 *   https://xmlweather.vedur.is/?op_w=xml&type=forec&lang=is&view=xml
 *     &ids={stationId1};{stationId2}&time=3h&params=F;D;T;R;W
 *
 * XML schema (sample):
 *   <forecasts>
 *     <station id="31392" valid="1">
 *       <name>Hellisheiði</name>
 *       <atime>2026-07-12 06:00:00</atime>
 *       <err></err>
 *       <forecast>
 *         <ftime>2026-07-12 09:00:00</ftime>
 *         <F>11</F>      wind speed m/s
 *         <D>SSA</D>     wind direction text
 *         <T>9</T>       temperature °C
 *         <R>0,6</R>     precipitation mm/klst (official docs: mm per hour)
 *         <W>Lítils háttar rigning</W>  weather description
 *       </forecast>
 *     </station>
 *   </forecasts>
 *
 * Notes:
 * - Iceland uses UTC year-round (no DST), so timestamps are treated as UTC.
 * - Decimal comma (e.g. "0,6") is converted to "0.6".
 * - `R` is treated as mm/klst per official Veðurstofan XML docs ("uppsöfnuð
 *   úrkoma mm/klst"). Raw value is also preserved as `rawR` for audit.
 * - `FG`/`FX` (gusts) are parsed if present but must NOT be used for route
 *   scoring or user-facing thresholds. Live probes showed they are absent from
 *   forecast responses for sampled stations.
 */

export type VedurstofanForecastRow = {
  /** Forecast time ISO 8601 UTC */
  ftimeIso: string
  /** Wind speed m/s — null if missing */
  windSpeedMs: number | null
  /** Wind direction text e.g. "SSA", "N" — null if missing */
  windDirectionText: string | null
  /** Temperature °C — null if missing */
  temperatureC: number | null
  /**
   * Precipitation mm/klst, treated as mm per hour per official docs.
   * Decimal comma converted. Null if missing.
   */
  precipitationMmPerHour: number | null
  /** Raw R value as parsed (before any future normalization), for audit. */
  rawR: number | null
  /** Weather description text (Icelandic) — null if missing */
  weatherText: string | null
  /** Max gust m/s (FG) — null if absent. Do NOT use for scoring. */
  gustMs: number | null
  /** Max wind speed (FX) — null if absent. Do NOT use for scoring. */
  maxWindMs: number | null
}

export type VedurstofanStationForecast = {
  stationId: string
  stationName: string
  /** Whether the station had valid=1 in the XML */
  valid: boolean
  /** When the forecast was generated (atime), ISO UTC. Null if absent. */
  atimeIso: string | null
  /** Error text from XML err element, empty string if no error */
  errText: string
  forecasts: VedurstofanForecastRow[]
}

export type VedurstofanXmlResult = {
  stations: VedurstofanStationForecast[]
  /** Raw XML preserved for debugging — not stored in cache */
  parseErrors: string[]
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Converts Veðurstofan timestamp ("2026-07-12 09:00:00") to ISO UTC string.
 * Iceland is UTC year-round (no DST).
 */
function toIso(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  // "2026-07-12 09:00:00" → "2026-07-12T09:00:00Z"
  const iso = trimmed.replace(' ', 'T') + 'Z'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? null : iso
}

/** Converts Icelandic decimal comma to period and parses as float. */
function parseNum(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const n = parseFloat(trimmed.replace(',', '.'))
  return isNaN(n) ? null : n
}

/** Extracts the text content of the first matching simple XML tag. */
function tag(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([^<]*)<\\/${name}>`, 's'))
  return m ? m[1].trim() : ''
}

/** Extracts the value of an attribute from an opening tag string. */
function attr(openingTag: string, name: string): string {
  // Use word boundary lookahead to avoid matching e.g. "id" inside "valid"
  const m = openingTag.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"` ))
  return m ? m[1] : ''
}

/**
 * Splits XML into top-level blocks for a given element name.
 * Handles simple non-nested use cases (station, forecast).
 */
function extractBlocks(xml: string, name: string): string[] {
  const results: string[] = []
  const openRe = new RegExp(`<${name}(?:\\s[^>]*)?>`, 'g')
  const closeTag = `</${name}>`
  let match: RegExpExecArray | null
  while ((match = openRe.exec(xml)) !== null) {
    const start = match.index
    const closeIdx = xml.indexOf(closeTag, start)
    if (closeIdx === -1) break
    results.push(xml.slice(start, closeIdx + closeTag.length))
  }
  return results
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Parses a raw XML string from Veðurstofan type=forec response.
 * Returns typed station forecast results. Never throws — parse errors are
 * collected in `parseErrors` and missing fields are null.
 */
export function parseVedurstofanXml(xml: string): VedurstofanXmlResult {
  const parseErrors: string[] = []
  const stations: VedurstofanStationForecast[] = []

  if (!xml || typeof xml !== 'string') {
    return { stations, parseErrors: ['Empty or non-string input'] }
  }

  const stationBlocks = extractBlocks(xml, 'station')

  if (stationBlocks.length === 0) {
    parseErrors.push('No <station> elements found')
    return { stations, parseErrors }
  }

  for (const stationXml of stationBlocks) {
    try {
      // Extract opening <station ...> tag for attributes
      const openTagMatch = stationXml.match(/^<station[^>]*>/)
      const openTag = openTagMatch ? openTagMatch[0] : ''
      const stationId = attr(openTag, 'id')
      const validStr = attr(openTag, 'valid')

      if (!stationId) {
        parseErrors.push('Station block missing id attribute')
        continue
      }

      const stationName = tag(stationXml, 'name')
      const atimeRaw = tag(stationXml, 'atime')
      const errText = tag(stationXml, 'err')
      const atimeIso = atimeRaw ? toIso(atimeRaw) : null

      const forecastBlocks = extractBlocks(stationXml, 'forecast')
      const forecasts: VedurstofanForecastRow[] = []

      for (const fXml of forecastBlocks) {
        const ftimeRaw = tag(fXml, 'ftime')
        const ftimeIso = toIso(ftimeRaw)
        if (!ftimeIso) {
          parseErrors.push(`Station ${stationId}: forecast block missing valid ftime`)
          continue
        }

        const rawR = parseNum(tag(fXml, 'R'))

        forecasts.push({
          ftimeIso,
          windSpeedMs: parseNum(tag(fXml, 'F')),
          windDirectionText: tag(fXml, 'D') || null,
          temperatureC: parseNum(tag(fXml, 'T')),
          precipitationMmPerHour: rawR,
          rawR,
          weatherText: tag(fXml, 'W') || null,
          gustMs: parseNum(tag(fXml, 'FG')),
          maxWindMs: parseNum(tag(fXml, 'FX')),
        })
      }

      stations.push({
        stationId,
        stationName,
        valid: validStr === '1',
        atimeIso,
        errText,
        forecasts,
      })
    } catch (err) {
      parseErrors.push(`Station parse error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return { stations, parseErrors }
}
