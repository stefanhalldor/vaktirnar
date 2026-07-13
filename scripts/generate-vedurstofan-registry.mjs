/**
 * Generates lib/weather/providers/vedurstofanStationsRegistry.ts
 * by scraping the official Veðurstofan station list and individual info pages.
 *
 * Source: https://www.vedur.is/vedur/stodvar/?t=3
 * Run with: node scripts/generate-vedurstofan-registry.mjs
 *
 * Respects the external service with a 150ms delay between requests.
 * Generates a checked-in TypeScript file that serves as the authoritative registry.
 */

import { writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const LIST_URL = 'https://www.vedur.is/vedur/stodvar/?t=3'
const INFO_BASE = 'https://www.vedur.is/vedur/stodvar/?s='
const DELAY_MS = 150

// ── HTML helpers ──────────────────────────────────────────────────────────────

function extractText(html, label) {
  // Matches <td>Label</td><td>Value</td> in an infotable row
  const re = new RegExp(`<td>${escapeRe(label)}</td><td>([^<]*)<\\/td>`, 'i')
  const m = html.match(re)
  return m ? m[1].trim() : null
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ── Coordinate parsing ────────────────────────────────────────────────────────

/**
 * Parses Staðsetning field: "64°01.127', 21°20.543' (64,0188, 21,3424)"
 * Returns { lat, lon } in WGS84, lon negative for Iceland.
 * Returns null if the field is missing or unparseable.
 */
function parseCoordinates(raw) {
  if (!raw) return null
  // Match the decimal part in parentheses: (64,0188, 21,3424)
  const m = raw.match(/\((\d+),(\d+),\s*(\d+),(\d+)\)/)
  if (!m) {
    // Try alternate format with period: (64.0188, 21.3424)
    const m2 = raw.match(/\(([\d.]+),\s*([\d.]+)\)/)
    if (!m2) return null
    const lat = parseFloat(m2[1])
    const lonDisplay = parseFloat(m2[2])
    if (isNaN(lat) || isNaN(lonDisplay)) return null
    return { lat, lon: -lonDisplay }
  }
  const lat = parseFloat(`${m[1]}.${m[2]}`)
  const lonDisplay = parseFloat(`${m[3]}.${m[4]}`)
  if (isNaN(lat) || isNaN(lonDisplay)) return null
  return { lat, lon: -lonDisplay }
}

/**
 * Parses "360.0 m.y.s." → 360.0, or null if missing/unparseable.
 */
function parseElevation(raw) {
  if (!raw) return null
  const m = raw.match(/([\d.]+)\s*m/)
  return m ? parseFloat(m[1]) : null
}

/**
 * Parses "Suðurland(su)" → { name: "Suðurland", code: "su" }
 */
function parseForecastArea(raw) {
  if (!raw) return null
  const m = raw.match(/^(.*?)\(([^)]+)\)$/)
  if (m) return { name: m[1].trim(), code: m[2].trim() }
  return { name: raw.trim(), code: null }
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Teskeið/research (station-registry-generator)' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return res.text()
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

// ── Station list extraction ───────────────────────────────────────────────────

function extractSlugs(html) {
  const slugs = new Set()
  const re = /\?s=([a-z0-9]+)/g
  let m
  while ((m = re.exec(html)) !== null) {
    slugs.add(m[1])
  }
  return [...slugs].sort()
}

// ── Station info extraction ───────────────────────────────────────────────────

function parseStationInfo(slug, html) {
  const name = extractText(html, 'Nafn')
  const type = extractText(html, 'Tegund')
  const stationId = extractText(html, 'Stöðvanúmer')
  const wmoNumber = extractText(html, 'WMO-númer')
  const abbreviation = extractText(html, 'Skammstöfun')
  const forecastAreaRaw = extractText(html, 'Spásvæði')
  const coordinatesRaw = extractText(html, 'Staðsetning')
  const elevationRaw = extractText(html, 'Hæð yfir sjó')
  const startYear = extractText(html, 'Upphaf veðurathuguna')
  const owner = extractText(html, 'Eigandi stöðvar')

  const coords = parseCoordinates(coordinatesRaw)
  const forecastArea = parseForecastArea(forecastAreaRaw)

  return {
    slug,
    name: name ?? slug,
    stationType: type ?? null,
    stationId: stationId ?? null,
    wmoNumber: wmoNumber ?? null,
    abbreviation: abbreviation ?? slug,
    forecastAreaName: forecastArea?.name ?? null,
    forecastAreaCode: forecastArea?.code ?? null,
    lat: coords?.lat ?? null,
    /** WGS84 longitude — negative for Iceland (west of Greenwich) */
    lon: coords?.lon ?? null,
    coordinatesRaw: coordinatesRaw ?? null,
    elevationM: parseElevation(elevationRaw),
    startYear: startYear ? parseInt(startYear, 10) : null,
    owner: owner ?? null,
    sourceUrl: `${INFO_BASE}${slug}`,
    /** Coordinates come from official station page, not manually verified */
    mappingStatus: coords ? 'source-provided' : 'missing-coordinates',
  }
}

// ── Registry file writer ──────────────────────────────────────────────────────

function buildRegistryFile(stations, generatedAt) {
  const lines = [
    '/**',
    ' * Veðurstofan Íslands — authoritative station registry.',
    ' *',
    ' * AUTO-GENERATED by scripts/generate-vedurstofan-registry.mjs',
    ` * Source: https://www.vedur.is/vedur/stodvar/?t=3`,
    ` * Generated: ${generatedAt}`,
    ` * Total stations: ${stations.length}`,
    ' *',
    ' * Do NOT edit manually. Re-run the generator to update.',
    ' * Coordinates are source-provided (from official station pages) and have',
    ' * NOT been manually verified. Longitude is negative (WGS84) for all',
    ' * Icelandic stations. The official page displays positive west-longitudes.',
    ' *',
    ' * mappingStatus values:',
    " *   'source-provided'      — coordinates from official page, not yet verified",
    " *   'missing-coordinates'  — no coordinates found on the official page",
    ' */',
    '',
    'export type VedurstofanRegistryMappingStatus =',
    "  | 'source-provided'",
    "  | 'missing-coordinates'",
    "  | 'verified'",
    "  | 'needs-verification'",
    "  | 'ambiguous'",
    '',
    'export type VedurstofanStationRegistryEntry = {',
    '  /** Slug used in the official station URL: ?s={slug} */',
    '  slug: string',
    '  name: string',
    '  /** Station type e.g. "Sjálfvirk veðurathugunarstöð" */',
    '  stationType: string | null',
    '  /** Official station number. Numeric string, e.g. "31392" */',
    '  stationId: string | null',
    '  /** WMO station number */',
    '  wmoNumber: string | null',
    '  abbreviation: string',
    '  forecastAreaName: string | null',
    '  forecastAreaCode: string | null',
    '  /** WGS84 latitude */',
    '  lat: number | null',
    '  /** WGS84 longitude — NEGATIVE for Iceland */',
    '  lon: number | null',
    '  /** Raw coordinate string from the official page, for reference */',
    '  coordinatesRaw: string | null',
    '  elevationM: number | null',
    '  startYear: number | null',
    '  owner: string | null',
    '  /** URL of the official station info page */',
    '  sourceUrl: string',
    '  mappingStatus: VedurstofanRegistryMappingStatus',
    '}',
    '',
    `export const VEDURSTOFAN_STATION_REGISTRY_SOURCE = 'https://www.vedur.is/vedur/stodvar/?t=3'`,
    `export const VEDURSTOFAN_STATION_REGISTRY_GENERATED_AT = '${generatedAt}'`,
    `export const VEDURSTOFAN_STATION_REGISTRY_COUNT = ${stations.length}`,
    '',
    'export const VEDURSTOFAN_STATIONS_REGISTRY: readonly VedurstofanStationRegistryEntry[] = [',
  ]

  for (const s of stations) {
    lines.push('  {')
    lines.push(`    slug: ${JSON.stringify(s.slug)},`)
    lines.push(`    name: ${JSON.stringify(s.name)},`)
    lines.push(`    stationType: ${JSON.stringify(s.stationType)},`)
    lines.push(`    stationId: ${JSON.stringify(s.stationId)},`)
    lines.push(`    wmoNumber: ${JSON.stringify(s.wmoNumber)},`)
    lines.push(`    abbreviation: ${JSON.stringify(s.abbreviation)},`)
    lines.push(`    forecastAreaName: ${JSON.stringify(s.forecastAreaName)},`)
    lines.push(`    forecastAreaCode: ${JSON.stringify(s.forecastAreaCode)},`)
    lines.push(`    lat: ${s.lat === null ? 'null' : s.lat},`)
    lines.push(`    lon: ${s.lon === null ? 'null' : s.lon},`)
    lines.push(`    coordinatesRaw: ${JSON.stringify(s.coordinatesRaw)},`)
    lines.push(`    elevationM: ${s.elevationM === null ? 'null' : s.elevationM},`)
    lines.push(`    startYear: ${s.startYear === null ? 'null' : s.startYear},`)
    lines.push(`    owner: ${JSON.stringify(s.owner)},`)
    lines.push(`    sourceUrl: ${JSON.stringify(s.sourceUrl)},`)
    lines.push(`    mappingStatus: ${JSON.stringify(s.mappingStatus)},`)
    lines.push('  },')
  }

  lines.push(']')
  lines.push('')

  return lines.join('\n')
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Fetching station list...')
  const listHtml = await fetchHtml(LIST_URL)
  const slugs = extractSlugs(listHtml)
  console.log(`Found ${slugs.length} station slugs.`)

  const stations = []
  let ok = 0, missing = 0, errors = 0

  for (let i = 0; i < slugs.length; i++) {
    const slug = slugs[i]
    const url = `${INFO_BASE}${slug}`
    process.stdout.write(`[${i + 1}/${slugs.length}] ${slug.padEnd(8)} `)
    try {
      await sleep(DELAY_MS)
      const html = await fetchHtml(url)
      const info = parseStationInfo(slug, html)
      stations.push(info)
      if (info.lat !== null) {
        ok++
        process.stdout.write(`✓ ${info.name} (${info.stationId}) lat=${info.lat}\n`)
      } else {
        missing++
        process.stdout.write(`? ${info.name} (${info.stationId}) — no coordinates\n`)
      }
    } catch (err) {
      errors++
      process.stdout.write(`✗ ERROR: ${err.message}\n`)
      stations.push({
        slug,
        name: slug,
        stationType: null,
        stationId: null,
        wmoNumber: null,
        abbreviation: slug,
        forecastAreaName: null,
        forecastAreaCode: null,
        lat: null,
        lon: null,
        coordinatesRaw: null,
        elevationM: null,
        startYear: null,
        owner: null,
        sourceUrl: url,
        mappingStatus: 'missing-coordinates',
      })
    }
  }

  const generatedAt = new Date().toISOString()
  const content = buildRegistryFile(stations, generatedAt)
  const outPath = join(ROOT, 'lib/weather/providers/vedurstofanStationsRegistry.ts')
  writeFileSync(outPath, content, 'utf8')

  console.log('\n--- Done ---')
  console.log(`Total: ${stations.length}`)
  console.log(`With coordinates: ${ok}`)
  console.log(`Missing coordinates: ${missing}`)
  console.log(`Errors: ${errors}`)
  console.log(`Output: ${outPath}`)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
