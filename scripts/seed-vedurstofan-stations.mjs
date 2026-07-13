/**
 * Seed vedurstofan_stations table from the generated registry.
 *
 * Run from project root:
 *   node scripts/seed-vedurstofan-stations.mjs --dry-run   (parse only, no Supabase)
 *   node scripts/seed-vedurstofan-stations.mjs             (real upsert, requires credentials)
 *
 * Requires for real run:
 *   - sql/74 migration already run
 *   - .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 */

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const isDryRun = process.argv.includes('--dry-run')

// ── Env vars ──────────────────────────────────────────────────────────────────

function readEnvLocal() {
  try {
    const raw = readFileSync('.env.local', 'utf8')
    const vars = {}
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq < 0) continue
      let val = trimmed.slice(eq + 1).trim()
      // Strip surrounding quotes if present
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1)
      }
      vars[trimmed.slice(0, eq).trim()] = val
    }
    return vars
  } catch {
    return {}
  }
}

// ── Parse registry TypeScript file ───────────────────────────────────────────
// The array literal inside the .ts file is valid JavaScript.
// The type annotation looks like:
//   export const VEDURSTOFAN_STATIONS_REGISTRY: readonly VedurstofanStationRegistryEntry[] = [
// The first '[' after the const name is in '[]' of the type annotation.
// We must find the '= [' assignment to locate the actual array.

const registryTs = readFileSync(
  'lib/weather/providers/vedurstofanStationsRegistry.ts',
  'utf8'
)

const generatedAtMatch = registryTs.match(/VEDURSTOFAN_STATION_REGISTRY_GENERATED_AT = '([^']+)'/)
const registryGeneratedAt = generatedAtMatch?.[1] ?? null

const declPos = registryTs.indexOf('VEDURSTOFAN_STATIONS_REGISTRY')
const assignPos = registryTs.indexOf('= [', declPos)

if (declPos < 0 || assignPos < 0) {
  console.error('ERROR: Could not locate VEDURSTOFAN_STATIONS_REGISTRY assignment in registry file.')
  process.exit(1)
}

// '= [' — skip the '= ' to land on '['
const arrayStart = assignPos + 2
const arrayEnd = registryTs.lastIndexOf(']') + 1

// eslint-disable-next-line no-new-func
const stations = new Function('return ' + registryTs.slice(arrayStart, arrayEnd))()

if (!Array.isArray(stations) || stations.length === 0) {
  console.error('ERROR: Parsed registry is empty or not an array.')
  process.exit(1)
}

// ── Map to DB rows ────────────────────────────────────────────────────────────

const syncedAt = new Date().toISOString()

const rows = stations
  .filter(s => s.stationId !== null)
  .map(s => ({
    station_id: s.stationId,
    slug: s.slug,
    name: s.name,
    station_type: s.stationType ?? null,
    wmo_number: s.wmoNumber ?? null,
    abbreviation: s.abbreviation,
    forecast_area_name: s.forecastAreaName ?? null,
    forecast_area_code: s.forecastAreaCode ?? null,
    lat: s.lat ?? null,
    lon: s.lon ?? null,
    coordinates_raw: s.coordinatesRaw ?? null,
    elevation_m: s.elevationM != null ? Math.round(s.elevationM) : null,
    start_year: s.startYear ?? null,
    owner: s.owner ?? null,
    source_url: s.sourceUrl,
    mapping_status: s.mappingStatus,
    registry_generated_at: registryGeneratedAt,
    synced_at: syncedAt,
  }))

const skipped = stations.length - rows.length

// ── Dry-run output ────────────────────────────────────────────────────────────

const hellisheidi = rows.find(r => r.station_id === '31392')
const first = rows[0]
const last = rows[rows.length - 1]

console.log(`Registry parsed: ${stations.length} total, ${rows.length} with stationId, ${skipped} skipped.`)
console.log(`Registry generated at: ${registryGeneratedAt}`)
console.log(`First: ${first?.station_id} ${first?.name}`)
console.log(`Last:  ${last?.station_id} ${last?.name}`)
console.log(`Hellisheiði (31392): ${hellisheidi ? 'FOUND — ' + hellisheidi.name + ', lat=' + hellisheidi.lat : 'NOT FOUND'}`)

if (isDryRun) {
  console.log('\nDry run complete. No Supabase writes performed.')
  process.exit(0)
}

// ── Real upsert ───────────────────────────────────────────────────────────────

const env = readEnvLocal()
const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'] ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = env['SUPABASE_SERVICE_ROLE_KEY'] ?? process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('\nERROR: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  console.error('Ensure .env.local is present in the project root, or use --dry-run to validate parsing only.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
})

console.log(`\nUpserting ${rows.length} rows into vedurstofan_stations...`)

const { error } = await supabase
  .from('vedurstofan_stations')
  .upsert(rows, { onConflict: 'station_id' })

if (error) {
  console.error('ERROR upserting stations:', error.message)
  process.exit(1)
}

console.log(`Done. ${rows.length} stations upserted into vedurstofan_stations.`)
