import 'server-only'

import { createHash } from 'node:crypto'
import { getAdmin } from '@/lib/supabase/admin'
import { buildCanonicalHmsPlace, parseHmsCsv } from './hmsCsv'
import { readActiveHmsDataset } from './hmsDirectory.server'
import { loadMunicipalityNames } from './municipalities'
import type {
  HmsCanonicalPlace,
  HmsCsvDiagnostics,
  HmsDatasetTrigger,
  HmsSourceRow,
  MunicipalityNameMap,
} from './types'

export const HMS_ADDRESS_CSV_URL =
  'https://hmsstgsftpprodweu001.blob.core.windows.net/fasteignaskra/Stadfangaskra.csv'

export const HMS_SOURCE_BASELINE_BYTES = 38_162_546
export const HMS_SOURCE_BASELINE_ROWS = 139_297
export const HMS_CANONICAL_BASELINE_PLACES = 137_117

const DATASET_TABLE = 'hms_place_dataset_versions'
const PLACE_TABLE = 'hms_places'
const MAX_SOURCE_BYTES = 64 * 1024 * 1024
const SOURCE_FETCH_TIMEOUT_MS = 120_000
// Keeps each PostgREST body bounded while reducing a full current snapshot from
// roughly 275 sequential requests to roughly 69.
const INSERT_CHUNK_SIZE = 2_000
const MIN_RELATIVE_COUNT = 0.80
const MAX_RELATIVE_COUNT = 1.25
const MIN_CANONICAL_SOURCE_SHARE = 0.90
const MAX_MISSING_MUNICIPALITY_SHARE = 0.005
const MAX_UNKNOWN_MUNICIPALITY_SHARE = 0.001

export type HmsPlaceRefreshResult =
  | {
      status: 'ok'
      datasetId: string
      sourceRowCount: number
      canonicalPlaceCount: number
      municipalityMappingSource: 'hagstofa' | 'static'
      insertRequestCount: number
      durationMs: number
    }
  | { status: 'skipped'; reason: 'already_running' | 'unchanged'; activeDatasetId?: string }
  | { status: 'error'; reason: string }

type DownloadedSource = {
  bytes: Uint8Array
  sha256: string
  fetchedAtIso: string
}

function safeReason(error: unknown): string {
  if (error instanceof Error && /^[a-z0-9_]{1,120}$/i.test(error.message)) return error.message
  return 'hms_refresh_failed'
}

function withinRelativeBoundary(current: number, previous: number | undefined): boolean {
  if (!previous || previous <= 0) return true
  return current >= previous * MIN_RELATIVE_COUNT && current <= previous * MAX_RELATIVE_COUNT
}

type MunicipalityCoverage = {
  knownCodeRowCount: number
  missingCodeRowCount: number
  unknownCodeRowCount: number
  unknownCodes: string[]
}

function summarizeMunicipalityCoverage(
  rows: readonly HmsSourceRow[],
  municipalityNames: MunicipalityNameMap,
): MunicipalityCoverage {
  let knownCodeRowCount = 0
  let missingCodeRowCount = 0
  let unknownCodeRowCount = 0
  const unknownCodes = new Set<string>()

  for (const row of rows) {
    if (!row.municipalityCode) {
      missingCodeRowCount += 1
    } else if (municipalityNames[row.municipalityCode]) {
      knownCodeRowCount += 1
    } else {
      unknownCodeRowCount += 1
      unknownCodes.add(row.municipalityCode)
    }
  }

  return {
    knownCodeRowCount,
    missingCodeRowCount,
    unknownCodeRowCount,
    unknownCodes: [...unknownCodes].sort(),
  }
}

async function downloadHmsCsv(): Promise<DownloadedSource> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), SOURCE_FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(HMS_ADDRESS_CSV_URL, {
      method: 'GET',
      headers: { Accept: 'text/csv,text/plain;q=0.9,*/*;q=0.1' },
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!response.ok) throw new Error('hms_source_http_error')
    const declaredLength = Number(response.headers.get('content-length'))
    if (Number.isFinite(declaredLength) && declaredLength > MAX_SOURCE_BYTES) {
      throw new Error('hms_source_too_large')
    }
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength <= 0 || bytes.byteLength > MAX_SOURCE_BYTES) {
      throw new Error('hms_source_size_invalid')
    }
    return {
      bytes,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      fetchedAtIso: new Date().toISOString(),
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('hms_source_timeout')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

async function beginRefresh(triggeredBy: HmsDatasetTrigger): Promise<string | null> {
  const { data, error } = await getAdmin().rpc('begin_hms_place_refresh', {
    p_triggered_by: triggeredBy,
    p_source_url: HMS_ADDRESS_CSV_URL,
  })
  if (error) throw new Error('hms_refresh_claim_failed')
  return typeof data === 'string' && data.length > 0 ? data : null
}

async function markUnchanged(input: {
  datasetId: string
  source: DownloadedSource
  activeDatasetId: string
}): Promise<void> {
  const { data, error } = await getAdmin()
    .from(DATASET_TABLE)
    .update({
      status: 'unchanged',
      source_content_sha256: input.source.sha256,
      source_bytes: input.source.bytes.byteLength,
      source_fetched_at: input.source.fetchedAtIso,
      validation: { activeDatasetId: input.activeDatasetId },
      failure_code: 'source_unchanged',
      finished_at: new Date().toISOString(),
    })
    .eq('id', input.datasetId)
    .eq('status', 'building')
    .select('id')
    .maybeSingle()
  if (error || !data) throw new Error('hms_unchanged_write_failed')
}

function validateDataset(input: {
  sourceBytes: number
  diagnostics: HmsCsvDiagnostics
  municipalityCoverage: MunicipalityCoverage
  previous?: { sourceRowCount: number; canonicalPlaceCount: number } | null
}): Record<string, boolean> {
  const { diagnostics, municipalityCoverage, previous } = input
  const municipalityDenominator = Math.max(diagnostics.canonicalPlaceCount, 1)
  return {
    sourceSizeWithinBootstrapRange:
      input.sourceBytes >= HMS_SOURCE_BASELINE_BYTES * 0.50
      && input.sourceBytes <= HMS_SOURCE_BASELINE_BYTES * 1.75,
    sourceRowsWithinBootstrapRange:
      diagnostics.sourceRowCount >= HMS_SOURCE_BASELINE_ROWS * 0.75
      && diagnostics.sourceRowCount <= HMS_SOURCE_BASELINE_ROWS * 1.35,
    canonicalPlacesWithinBootstrapRange:
      diagnostics.canonicalPlaceCount >= HMS_CANONICAL_BASELINE_PLACES * 0.75
      && diagnostics.canonicalPlaceCount <= HMS_CANONICAL_BASELINE_PLACES * 1.35,
    sourceRowsStable: withinRelativeBoundary(diagnostics.sourceRowCount, previous?.sourceRowCount),
    canonicalPlacesStable: withinRelativeBoundary(
      diagnostics.canonicalPlaceCount,
      previous?.canonicalPlaceCount,
    ),
    canonicalShareSufficient:
      diagnostics.sourceRowCount > 0
      && diagnostics.canonicalPlaceCount / diagnostics.sourceRowCount >= MIN_CANONICAL_SOURCE_SHARE,
    validPointsCoverCanonical:
      diagnostics.validPointCount >= diagnostics.canonicalPlaceCount,
    malformedRowsLimited:
      diagnostics.malformedRowCount <= Math.max(10, diagnostics.sourceRowCount * 0.001),
    municipalityCodesMostlyPresent:
      municipalityCoverage.missingCodeRowCount
        <= Math.max(100, municipalityDenominator * MAX_MISSING_MUNICIPALITY_SHARE),
    municipalityMappingCoverageSufficient:
      municipalityCoverage.unknownCodeRowCount
        <= Math.max(25, municipalityDenominator * MAX_UNKNOWN_MUNICIPALITY_SHARE),
  }
}

function toInsertRow(datasetId: string, place: HmsCanonicalPlace) {
  return {
    dataset_version_id: datasetId,
    source_id: place.addressId,
    coordinate_id: place.coordinateId,
    municipality_code: place.municipalityCode,
    municipality_name: place.municipalityName,
    settlement_code: place.settlementCode,
    land_number: place.landNumber,
    postal_code: place.postalCode,
    street_name: place.streetName,
    street_name_dative: place.streetNameDative,
    house_number: place.houseNumber,
    house_letter: place.houseLetter,
    address_suffix: place.addressSuffix,
    special_name: place.specialName,
    display_name: place.displayName,
    formatted_address: place.formattedAddress,
    search_name_normalized: place.searchNameNormalized,
    search_address_normalized: place.searchAddressNormalized,
    search_special_name_normalized: place.searchSpecialNameNormalized,
    search_municipality_normalized: place.searchMunicipalityNormalized,
    search_text_normalized: place.searchTextNormalized,
    lat: place.lat,
    lon: place.lon,
    coordinate_type: place.coordinateType,
    review_status: place.reviewStatus,
    accuracy_m: place.accuracyM,
    source_corrected_at: place.correctedAt,
  }
}

async function insertCanonicalPlaces(
  datasetId: string,
  sourceRows: readonly HmsSourceRow[],
  municipalityNames: MunicipalityNameMap,
): Promise<number> {
  const admin = getAdmin()
  let requestCount = 0
  for (let offset = 0; offset < sourceRows.length; offset += INSERT_CHUNK_SIZE) {
    const rows = sourceRows
      .slice(offset, offset + INSERT_CHUNK_SIZE)
      .map(sourceRow => toInsertRow(datasetId, buildCanonicalHmsPlace(sourceRow, municipalityNames)))
    const { error } = await admin.from(PLACE_TABLE).insert(rows)
    if (error) throw new Error('hms_place_chunk_insert_failed')
    requestCount += 1
  }
  return requestCount
}

async function stageDataset(input: {
  datasetId: string
  source: DownloadedSource
  diagnostics: HmsCsvDiagnostics
  municipalityMappingSource: 'hagstofa' | 'static'
  municipalityMappingCount: number
  municipalityCoverage: MunicipalityCoverage
  checks: Record<string, boolean>
}): Promise<void> {
  const rejectedRowCount = input.diagnostics.missingAddressIdCount
    + input.diagnostics.invalidCoordinateCount
    + input.diagnostics.invalidDataRowCount
    + input.diagnostics.malformedRowCount
  const validation = {
    checks: input.checks,
    diagnostics: input.diagnostics,
    baseline: {
      sourceBytes: HMS_SOURCE_BASELINE_BYTES,
      sourceRows: HMS_SOURCE_BASELINE_ROWS,
      canonicalPlaces: HMS_CANONICAL_BASELINE_PLACES,
    },
    municipalityMappingSource: input.municipalityMappingSource,
    municipalityMappingCount: input.municipalityMappingCount,
    municipalityCoverage: input.municipalityCoverage,
  }
  const { data, error } = await getAdmin()
    .from(DATASET_TABLE)
    .update({
      status: 'ready',
      source_content_sha256: input.source.sha256,
      source_bytes: input.source.bytes.byteLength,
      source_fetched_at: input.source.fetchedAtIso,
      source_row_count: input.diagnostics.sourceRowCount,
      valid_point_count: input.diagnostics.validPointCount,
      canonical_place_count: input.diagnostics.canonicalPlaceCount,
      rejected_row_count: rejectedRowCount,
      duplicate_point_count: input.diagnostics.duplicateAddressPointCount,
      municipality_mapping_source: input.municipalityMappingSource,
      municipality_mapping_count: input.municipalityMappingCount,
      validation,
      failure_code: null,
      finished_at: new Date().toISOString(),
    })
    .eq('id', input.datasetId)
    .eq('status', 'building')
    .select('id')
    .maybeSingle()
  if (error || !data) throw new Error('hms_dataset_stage_failed')
}

async function failDataset(
  datasetId: string,
  failureCode: string,
  validation: Record<string, unknown> = {},
): Promise<void> {
  const safeFailureCode = failureCode.replace(/[^a-z0-9_]/gi, '_').slice(0, 120) || 'hms_refresh_failed'
  const admin = getAdmin()
  const { data: failedRow } = await admin
    .from(DATASET_TABLE)
    .update({
      status: 'failed',
      failure_code: safeFailureCode,
      validation,
      finished_at: new Date().toISOString(),
    })
    .eq('id', datasetId)
    .in('status', ['building', 'ready'])
    .select('id')
    .maybeSingle()
  // Never delete rows from a dataset that may already have been promoted.
  if (failedRow) await admin.from(PLACE_TABLE).delete().eq('dataset_version_id', datasetId)
}

async function promoteDataset(datasetId: string): Promise<void> {
  const { data, error } = await getAdmin().rpc('promote_hms_place_dataset', {
    p_dataset_id: datasetId,
  })
  if (error || data !== true) throw new Error('hms_dataset_promote_failed')
}

async function pruneDatasetHistory(retiredToKeep = 2): Promise<void> {
  const admin = getAdmin()
  const { data: retired } = await admin
    .from(DATASET_TABLE)
    .select('id')
    .eq('status', 'retired')
    .order('promoted_at', { ascending: false })
  const retiredIds = Array.isArray(retired)
    ? retired.slice(retiredToKeep).map(row => String(row.id))
    : []
  if (retiredIds.length > 0) await admin.from(DATASET_TABLE).delete().in('id', retiredIds)

  const historyCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  await admin
    .from(DATASET_TABLE)
    .delete()
    .in('status', ['failed', 'unchanged'])
    .lt('finished_at', historyCutoff)
}

export async function refreshHmsPlaceDirectory(
  triggeredBy: HmsDatasetTrigger,
): Promise<HmsPlaceRefreshResult> {
  let datasetId: string | null = null
  let validationContext: Record<string, unknown> = {}
  const refreshStartedAt = Date.now()
  try {
    datasetId = await beginRefresh(triggeredBy)
    if (!datasetId) return { status: 'skipped', reason: 'already_running' }

    const previous = await readActiveHmsDataset()
    const [source, municipalityDirectory] = await Promise.all([
      downloadHmsCsv(),
      loadMunicipalityNames(),
    ])
    if (previous?.sourceContentSha256 === source.sha256) {
      await markUnchanged({ datasetId, source, activeDatasetId: previous.id })
      await pruneDatasetHistory().catch(() => undefined)
      return { status: 'skipped', reason: 'unchanged', activeDatasetId: previous.id }
    }

    const parsed = parseHmsCsv(source.bytes)
    const municipalityCoverage = summarizeMunicipalityCoverage(
      parsed.rows,
      municipalityDirectory.names,
    )
    const checks = validateDataset({
      sourceBytes: source.bytes.byteLength,
      diagnostics: parsed.diagnostics,
      municipalityCoverage,
      previous,
    })
    validationContext = { checks, diagnostics: parsed.diagnostics, municipalityCoverage }
    if (!Object.values(checks).every(Boolean)) throw new Error('hms_dataset_validation_failed')

    const insertRequestCount = await insertCanonicalPlaces(
      datasetId,
      parsed.rows,
      municipalityDirectory.names,
    )
    await stageDataset({
      datasetId,
      source,
      diagnostics: parsed.diagnostics,
      municipalityMappingSource: municipalityDirectory.source,
      municipalityMappingCount: Object.keys(municipalityDirectory.names).length,
      municipalityCoverage,
      checks,
    })
    await promoteDataset(datasetId)
    const active = await readActiveHmsDataset()
    if (active?.id !== datasetId) throw new Error('hms_dataset_verify_failed')
    await pruneDatasetHistory().catch(() => undefined)

    const durationMs = Date.now() - refreshStartedAt
    console.info('[hms-place-refresh] completed', {
      datasetId,
      sourceRowCount: parsed.diagnostics.sourceRowCount,
      canonicalPlaceCount: parsed.diagnostics.canonicalPlaceCount,
      insertRequestCount,
      durationMs,
    })
    return {
      status: 'ok',
      datasetId,
      sourceRowCount: parsed.diagnostics.sourceRowCount,
      canonicalPlaceCount: parsed.diagnostics.canonicalPlaceCount,
      municipalityMappingSource: municipalityDirectory.source,
      insertRequestCount,
      durationMs,
    }
  } catch (error) {
    const reason = safeReason(error)
    if (datasetId) await failDataset(datasetId, reason, validationContext).catch(() => undefined)
    console.error('[hms-place-refresh] refresh failed', {
      datasetId,
      reason,
      durationMs: Date.now() - refreshStartedAt,
    })
    return { status: 'error', reason }
  }
}
