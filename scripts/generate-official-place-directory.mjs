/**
 * Generates the small, checked-in official Icelandic settlement directory.
 *
 * Sources:
 * - Hagstofa: canonical settlement identity and classification
 * - IS 50V Mannvirki: current settlement geometry and recent population
 * - Byggðastofnun/LMÍ: postal-code locality names
 *
 * The application never calls these WFS services at request time. Re-run this
 * script deliberately, review the diff and ship the resulting last-known-good
 * snapshot with the application.
 *
 * Online refresh:
 * node scripts/generate-official-place-directory.mjs --retrieved-date YYYY-MM-DD
 *
 * Deterministic offline regeneration from the checked-in snapshot:
 * node scripts/generate-official-place-directory.mjs --offline-input lib/places/officialPlaceDirectory.generated.json
 */

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  OFFICIAL_PLACE_DIRECTORY_GENERATOR,
  OFFICIAL_PLACE_DIRECTORY_SCHEMA_VERSION,
  assertConsistentOfficialPostalLocalityRecords,
  buildDeterministicOfficialPlaceDirectory,
  officialPlaceDirectoryContentSha256,
  officialPlaceDirectoryPayload,
  serializeOfficialPlaceDirectory,
} from './official-place-directory-identity.mjs'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const ROOT = join(SCRIPT_DIR, '..')
const OUTPUT = join(ROOT, 'lib', 'places', 'officialPlaceDirectory.generated.json')
const ATTRIBUTION_OUTPUT = join(ROOT, 'lib', 'places', 'officialPlaceAttribution.generated.ts')

function argumentValue(args, index, name) {
  const argument = args[index]
  const prefix = `${name}=`
  if (argument.startsWith(prefix)) return { value: argument.slice(prefix.length), nextIndex: index }
  if (argument === name && typeof args[index + 1] === 'string') {
    return { value: args[index + 1], nextIndex: index + 1 }
  }
  return null
}

function parseArguments(args) {
  const parsed = {
    offlineInput: null,
    retrievedDate: null,
    output: OUTPUT,
    attributionOutput: ATTRIBUTION_OUTPUT,
  }
  for (let index = 0; index < args.length; index += 1) {
    const offlineInput = argumentValue(args, index, '--offline-input')
    const retrievedDate = argumentValue(args, index, '--retrieved-date')
    const output = argumentValue(args, index, '--output')
    const attributionOutput = argumentValue(args, index, '--attribution-output')
    const match = offlineInput ?? retrievedDate ?? output ?? attributionOutput
    if (!match?.value) throw new Error(`unknown_or_empty_argument_${args[index]}`)
    if (offlineInput) parsed.offlineInput = resolve(ROOT, offlineInput.value)
    if (retrievedDate) parsed.retrievedDate = retrievedDate.value
    if (output) parsed.output = resolve(ROOT, output.value)
    if (attributionOutput) parsed.attributionOutput = resolve(ROOT, attributionOutput.value)
    index = match.nextIndex
  }
  if (!parsed.offlineInput && !parsed.retrievedDate) {
    throw new Error('retrieved_date_required_for_online_refresh')
  }
  return parsed
}

const SOURCES = Object.freeze({
  hagstofa: {
    dataset: 'Þéttbýlisstaðir 2020–2024',
    metadataUrl: 'https://gatt.natt.is/geonetwork/srv/api/records/95c2ff71-c776-462a-8b23-d50cdeb7cb4f',
    dataUrl: 'https://gis.is/geoserver/Hagstofan/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=Hagstofan%3Athettbylisstadir&outputFormat=application%2Fjson&srsName=EPSG%3A4326',
  },
  is50v: {
    dataset: 'IS 50V Mannvirki — þéttbýlisflákar',
    metadataUrl: 'https://www-gamli.lmi.is/landupplysingar/mannvirki/',
    dataUrl: 'https://gis.lmi.is/geoserver/IS_50V/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=IS_50V%3Amannvirki_flakar&outputFormat=application%2Fjson&srsName=EPSG%3A4326',
  },
  postal: {
    dataset: 'Póstnúmer',
    metadataUrl: 'https://gatt.lmi.is/geonetwork/srv/resources/datasets/22e98d21-a86b-4b62-ad58-a6d17703b612',
    dataUrl: 'https://gis.lmi.is/geoserver/byggdastofnun/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=byggdastofnun%3Apostnumer&outputFormat=application%2Fjson&srsName=EPSG%3A4326',
  },
})

const MIN_COUNTS = Object.freeze({ hagstofa: 80, is50v: 80, postal: 80 })
const MAX_COUNTS = Object.freeze({ hagstofa: 250, is50v: 250, postal: 300 })

function normalize(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[ðđ]/g, 'd')
    .replace(/þ/g, 'th')
    .replace(/æ/g, 'ae')
    .replace(/ö/g, 'o')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function cleanText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

async function fetchFeatureCollection(sourceKey) {
  const source = SOURCES[sourceKey]
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60_000)
  try {
    const response = await fetch(source.dataUrl, {
      headers: {
        Accept: 'application/geo+json,application/json',
        'User-Agent': 'Teskeid/official-place-directory-generator',
      },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`${sourceKey}_http_${response.status}`)
    const text = await response.text()
    if (text.length < 100 || text.length > 25 * 1024 * 1024) {
      throw new Error(`${sourceKey}_unexpected_size`)
    }
    const payload = JSON.parse(text)
    if (payload?.type !== 'FeatureCollection' || !Array.isArray(payload.features)) {
      throw new Error(`${sourceKey}_invalid_feature_collection`)
    }
    const count = payload.features.length
    if (count < MIN_COUNTS[sourceKey] || count > MAX_COUNTS[sourceKey]) {
      throw new Error(`${sourceKey}_unexpected_feature_count_${count}`)
    }
    return { payload, hash: sha256(text), count }
  } finally {
    clearTimeout(timeout)
  }
}

function polygonsFromGeometry(geometry) {
  if (!geometry || !Array.isArray(geometry.coordinates)) return []
  if (geometry.type === 'Polygon') return [geometry.coordinates]
  if (geometry.type === 'MultiPolygon') return geometry.coordinates
  return []
}

function ringSignedArea(ring) {
  let twiceArea = 0
  for (let index = 0; index < ring.length - 1; index += 1) {
    const a = ring[index]
    const b = ring[index + 1]
    twiceArea += a[0] * b[1] - b[0] * a[1]
  }
  return twiceArea / 2
}

function polygonArea(polygon) {
  if (!Array.isArray(polygon) || polygon.length === 0) return 0
  const outer = Math.abs(ringSignedArea(polygon[0]))
  const holes = polygon.slice(1).reduce((sum, ring) => sum + Math.abs(ringSignedArea(ring)), 0)
  return Math.max(0, outer - holes)
}

function geometryArea(geometry) {
  return polygonsFromGeometry(geometry).reduce((sum, polygon) => sum + polygonArea(polygon), 0)
}

function pointOnSegment(point, a, b) {
  const cross = (point[1] - a[1]) * (b[0] - a[0]) - (point[0] - a[0]) * (b[1] - a[1])
  if (Math.abs(cross) > 1e-12) return false
  return point[0] >= Math.min(a[0], b[0]) - 1e-12
    && point[0] <= Math.max(a[0], b[0]) + 1e-12
    && point[1] >= Math.min(a[1], b[1]) - 1e-12
    && point[1] <= Math.max(a[1], b[1]) + 1e-12
}

function pointInRing(point, ring) {
  let inside = false
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current, current += 1) {
    const a = ring[previous]
    const b = ring[current]
    if (pointOnSegment(point, a, b)) return true
    const crosses = (a[1] > point[1]) !== (b[1] > point[1])
      && point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    if (crosses) inside = !inside
  }
  return inside
}

function pointInPolygon(point, polygon) {
  if (!polygon[0] || !pointInRing(point, polygon[0])) return false
  return !polygon.slice(1).some(hole => pointInRing(point, hole))
}

function pointInGeometry(point, geometry) {
  return polygonsFromGeometry(geometry).some(polygon => pointInPolygon(point, polygon))
}

function ringCentroid(ring) {
  let crossSum = 0
  let xSum = 0
  let ySum = 0
  for (let index = 0; index < ring.length - 1; index += 1) {
    const a = ring[index]
    const b = ring[index + 1]
    const cross = a[0] * b[1] - b[0] * a[1]
    crossSum += cross
    xSum += (a[0] + b[0]) * cross
    ySum += (a[1] + b[1]) * cross
  }
  if (Math.abs(crossSum) < 1e-15) return null
  return [xSum / (3 * crossSum), ySum / (3 * crossSum)]
}

function polygonBounds(polygon) {
  const points = polygon.flat()
  return points.reduce((bounds, point) => ({
    minX: Math.min(bounds.minX, point[0]),
    maxX: Math.max(bounds.maxX, point[0]),
    minY: Math.min(bounds.minY, point[1]),
    maxY: Math.max(bounds.maxY, point[1]),
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity })
}

function scanlineInteriorPoint(polygon, bounds) {
  const preferredY = ringCentroid(polygon[0])?.[1] ?? (bounds.minY + bounds.maxY) / 2
  const ys = [preferredY, (bounds.minY + bounds.maxY) / 2]
  for (let step = 1; step < 80; step += 1) {
    ys.push(bounds.minY + ((bounds.maxY - bounds.minY) * step) / 80)
  }

  let best = null
  for (const y of ys) {
    const intersections = []
    for (const ring of polygon) {
      for (let index = 0; index < ring.length - 1; index += 1) {
        const a = ring[index]
        const b = ring[index + 1]
        if ((a[1] > y) === (b[1] > y)) continue
        intersections.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]))
      }
    }
    intersections.sort((a, b) => a - b)
    for (let index = 0; index + 1 < intersections.length; index += 1) {
      const left = intersections[index]
      const right = intersections[index + 1]
      const candidate = [(left + right) / 2, y]
      const width = right - left
      if (width > 0 && pointInPolygon(candidate, polygon) && (!best || width > best.width)) {
        best = { point: candidate, width }
      }
    }
  }
  return best?.point ?? null
}

function representativePoint(geometry) {
  const polygons = polygonsFromGeometry(geometry)
    .filter(polygon => Array.isArray(polygon[0]) && polygon[0].length >= 4)
    .sort((a, b) => polygonArea(b) - polygonArea(a))
  for (const polygon of polygons) {
    const bounds = polygonBounds(polygon)
    const candidates = [
      ringCentroid(polygon[0]),
      [(bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2],
      scanlineInteriorPoint(polygon, bounds),
    ].filter(Boolean)
    for (const candidate of candidates) {
      if (pointInPolygon(candidate, polygon)) return candidate
    }
  }
  throw new Error('geometry_has_no_interior_point')
}

function firstOuterVertices(geometry) {
  return polygonsFromGeometry(geometry).flatMap(polygon => polygon[0]?.slice(0, -1) ?? [])
}

function geometriesOverlap(a, b) {
  const pointA = representativePoint(a)
  const pointB = representativePoint(b)
  if (pointInGeometry(pointA, b) || pointInGeometry(pointB, a)) return true
  return firstOuterVertices(a).some(point => pointInGeometry(point, b))
    || firstOuterVertices(b).some(point => pointInGeometry(point, a))
}

function rounded(value) {
  return Number(value.toFixed(6))
}

function roundedCanonicalGeometry(geometry) {
  const polygons = polygonsFromGeometry(geometry)
    .map(polygon => polygon
      .map(ring => {
        const points = ring
          .filter(point => (
            Array.isArray(point)
            && point.length >= 2
            && Number.isFinite(point[0])
            && Number.isFinite(point[1])
          ))
          .map(point => [rounded(point[0]), rounded(point[1])])
          .filter((point, index, values) => (
            index === 0
            || point[0] !== values[index - 1][0]
            || point[1] !== values[index - 1][1]
          ))
        if (points.length < 3) return null
        const first = points[0]
        const last = points[points.length - 1]
        if (first[0] !== last[0] || first[1] !== last[1]) points.push([...first])
        return points.length >= 4 ? points : null
      })
      .filter(Boolean))
    .filter(polygon => polygon.length > 0)
  if (polygons.length === 0) throw new Error('canonical_geometry_empty')
  return { type: 'MultiPolygon', coordinates: polygons }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function combineGeometries(geometries) {
  const polygons = geometries.flatMap(polygonsFromGeometry)
  if (polygons.length === 0) throw new Error('combined_geometry_empty')
  return { type: 'MultiPolygon', coordinates: polygons }
}

function postalRecord(feature) {
  const properties = feature?.properties ?? {}
  const postalCode = String(properties.postnumer ?? '').padStart(3, '0')
  const name = cleanText(properties.stadur)
  if (!/^\d{3}$/.test(postalCode) || !name || polygonsFromGeometry(feature.geometry).length === 0) {
    return null
  }
  return {
    sourceId: cleanText(properties.uuid) || `postal:${postalCode}:${normalize(name)}`,
    postalCode,
    name,
    classification: cleanText(properties.flokkun_postnumera) || null,
    correctedAt: cleanText(properties.dagsleidrettingar) || null,
    geometry: feature.geometry,
    area: geometryArea(feature.geometry),
  }
}

function postalMatches(geometry, postalRecords) {
  return postalRecords
    .filter(record => geometriesOverlap(geometry, record.geometry))
    .sort(comparePostalRecords)
}

function choosePrimaryPostal(point, matches) {
  // Fail closed when no postcode polygon actually contains the canonical
  // point. A mere boundary overlap is not enough to assert postal context.
  return matches.find(record => pointInGeometry(point, record.geometry)) ?? null
}

function comparePostalRecords(a, b) {
  const classificationDifference = Number(b.classification === 'Þéttbýli')
    - Number(a.classification === 'Þéttbýli')
  if (classificationDifference !== 0) return classificationDifference
  const correctedDifference = (b.correctedAt ?? '').localeCompare(a.correctedAt ?? '', 'is')
  if (correctedDifference !== 0) return correctedDifference
  return a.area - b.area
    || a.postalCode.localeCompare(b.postalCode, 'is')
    || a.sourceId.localeCompare(b.sourceId, 'is')
}

function prepareHagstofa(features) {
  return features.map(feature => {
    const properties = feature?.properties ?? {}
    const id = cleanText(properties.stadur)
    const name = cleanText(properties.heiti)
    if (!id || !name || polygonsFromGeometry(feature.geometry).length === 0) return null
    return {
      id,
      name,
      normalizedName: normalize(name),
      regionCode: cleanText(properties.lsv) || null,
      validFrom: cleanText(properties.gildirfra) || null,
      validTo: cleanText(properties.gildirtil) || null,
      geometry: feature.geometry,
      point: representativePoint(feature.geometry),
      area: geometryArea(feature.geometry),
    }
  }).filter(Boolean)
}

function findHagstofaMatch(name, point, geometry, hagstofa) {
  const normalizedName = normalize(name)
  const exactSpatial = hagstofa.filter(candidate => (
    candidate.normalizedName === normalizedName
    && (
      pointInGeometry(point, candidate.geometry)
      || pointInGeometry(candidate.point, geometry)
      || geometriesOverlap(geometry, candidate.geometry)
    )
  ))
  // Ambiguity fails closed. A broad spatial-only match can incorrectly merge
  // nearby towns into a composite statistical area.
  return exactSpatial.length === 1 ? exactSpatial[0] : null
}

function buildSettlement(input) {
  const {
    name,
    geometry,
    is50vIds,
    is50vNames,
    is50vUpdatedAt,
    hagstofa,
    postalRecords,
  } = input
  const point = representativePoint(geometry)
  if (!pointInGeometry(point, geometry)) throw new Error(`point_outside_${name}`)
  const matches = postalMatches(geometry, postalRecords)
  const primaryPostal = choosePrimaryPostal(point, matches)
  const canonicalName = hagstofa?.name || name
  const aliases = unique([
    canonicalName,
    name,
    ...is50vNames,
  ])
  const normalizedCanonicalName = normalize(canonicalName)
  const matchingNamePostalRecords = matches.filter(
    match => normalize(match.name) === normalizedCanonicalName,
  )
  // Multi-postcode towns may safely use overlapping postcode polygons that
  // carry the same locality name. If none do, retain only the polygon that
  // actually contains the canonical point (e.g. Fellabær in 700 Egilsstaðir).
  const searchablePostalRecords = matchingNamePostalRecords.length > 0
    ? matchingNamePostalRecords
    : primaryPostal
      ? [primaryPostal]
      : []
  const postalCodes = unique(searchablePostalRecords.map(record => record.postalCode)).sort()
  // A single display postcode would misrepresent a town spanning several
  // legitimate codes, so only expose it when the canonical point confirms the
  // sole searchable code.
  const displayPostal = postalCodes.length === 1 && primaryPostal?.postalCode === postalCodes[0]
    ? primaryPostal
    : null
  const searchTextNormalized = unique([
    ...aliases.map(normalize),
    ...postalCodes,
    ...postalCodes.flatMap(postalCode => aliases.flatMap(alias => [
      normalize(`${postalCode} ${alias}`),
      normalize(`${alias} ${postalCode}`),
    ])),
  ]).join(' ')

  const roundedPoint = [rounded(point[0]), rounded(point[1])]
  if (!pointInGeometry(roundedPoint, geometry)) throw new Error(`rounded_point_outside_${name}`)

  return {
    id: hagstofa ? `hagstofa:${hagstofa.id}` : `is50v:${is50vIds[0]}`,
    name: canonicalName,
    aliases,
    lat: roundedPoint[1],
    lon: roundedPoint[0],
    postalCode: displayPostal?.postalCode ?? null,
    postalLocality: displayPostal?.name ?? null,
    postalCodes,
    placeType: 'settlement',
    // Population semantics differ between composite Hagstofa areas and IS 50V
    // component polygons. Do not expose or rank by a value we cannot state safely.
    population2024: null,
    hagstofaId: hagstofa?.id ?? null,
    is50vIds,
    sourceUpdatedAt: is50vUpdatedAt ?? hagstofa?.validTo ?? null,
    searchTextNormalized,
    // Retain the checked-in official settlement boundary so runtime route
    // coverage can use real route crossings instead of town centroids or
    // municipality guesses. Coordinates are rounded only after topology is
    // assembled; representative-point validation below guards the snapshot.
    geometry: roundedCanonicalGeometry(geometry),
  }
}

function validateSnapshot(snapshot) {
  if (
    snapshot.schemaVersion !== OFFICIAL_PLACE_DIRECTORY_SCHEMA_VERSION
    || snapshot.generator?.id !== OFFICIAL_PLACE_DIRECTORY_GENERATOR.id
    || snapshot.generator?.version !== OFFICIAL_PLACE_DIRECTORY_GENERATOR.version
    || !/^\d{4}-\d{2}-\d{2}$/.test(snapshot.retrievedDate)
    || snapshot.contentSha256 !== officialPlaceDirectoryContentSha256(
      officialPlaceDirectoryPayload(snapshot),
    )
  ) throw new Error('snapshot_provenance_invalid')
  if (snapshot.settlements.length < 80 || snapshot.settlements.length > 250) {
    throw new Error(`snapshot_settlement_count_${snapshot.settlements.length}`)
  }
  const ids = new Set()
  const is50vIds = new Set()
  let settlementsWithSearchablePostalCode = 0
  for (const place of snapshot.settlements) {
    if (ids.has(place.id)) throw new Error(`duplicate_settlement_id_${place.id}`)
    ids.add(place.id)
    if (!place.name || !place.searchTextNormalized) throw new Error(`invalid_settlement_${place.id}`)
    // Identical place names can legitimately exist in different parts of Iceland;
    // stable source IDs and postal context keep those results distinct.
    for (const is50vId of place.is50vIds) {
      if (is50vIds.has(is50vId)) throw new Error(`duplicate_is50v_id_${is50vId}`)
      is50vIds.add(is50vId)
    }
    if (place.postalCodes.length > 0) settlementsWithSearchablePostalCode += 1
    if (
      !place.postalCodes.every(postalCode => /^\d{3}$/.test(postalCode))
      || new Set(place.postalCodes).size !== place.postalCodes.length
      || (place.postalCode && (
        place.postalCodes.length !== 1
        || place.postalCodes[0] !== place.postalCode
        || !place.postalLocality
      ))
      || (!place.postalCode && place.postalLocality)
    ) {
      throw new Error(`unsafe_postal_aliases_${place.id}`)
    }
    if (place.lat < 63 || place.lat > 67 || place.lon < -25 || place.lon > -12) {
      throw new Error(`settlement_outside_iceland_${place.id}`)
    }
    if (
      place.geometry?.type !== 'MultiPolygon'
      || polygonsFromGeometry(place.geometry).length === 0
      || !pointInGeometry([place.lon, place.lat], place.geometry)
    ) {
      throw new Error(`settlement_geometry_invalid_${place.id}`)
    }
  }
  if (is50vIds.size < 80) throw new Error(`is50v_match_count_${is50vIds.size}`)
  if (settlementsWithSearchablePostalCode < Math.floor(snapshot.settlements.length * 0.8)) {
    throw new Error(`settlement_postal_coverage_${settlementsWithSearchablePostalCode}`)
  }
  const settlementIds = new Set(snapshot.settlements.map(place => place.id))
  const postalAreaIds = new Set()
  for (const [postalCode, locality] of Object.entries(snapshot.postalLocalities)) {
    if (
      !/^\d{3}$/.test(postalCode)
      || !locality?.name
      || !locality?.sourceId
      || !['Þéttbýli', 'Dreifbýli'].includes(locality.classification)
    ) throw new Error(`postal_identity_invalid_${postalCode}`)
    const identity = locality.assessmentIdentity
    if (locality.classification === 'Dreifbýli') {
      if (identity?.kind !== 'rural_postal_area') {
        throw new Error(`rural_postal_identity_invalid_${postalCode}`)
      }
    } else if (!['urban_settlement', 'unresolved'].includes(identity?.kind)) {
      throw new Error(`urban_postal_identity_invalid_${postalCode}`)
    }
    if (identity.kind === 'urban_settlement' && !settlementIds.has(identity.settlementId)) {
      throw new Error(`postal_settlement_missing_${postalCode}`)
    }
    if (identity.kind !== 'unresolved') {
      const expectedAreaId = `postal:${postalCode}:${locality.sourceId}`
      if (identity.postalAreaId !== expectedAreaId || postalAreaIds.has(expectedAreaId)) {
        throw new Error(`postal_area_identity_invalid_${postalCode}`)
      }
      postalAreaIds.add(expectedAreaId)
    }
  }
}

function writeSnapshot(snapshot, options) {
  validateSnapshot(snapshot)
  writeFileSync(options.output, serializeOfficialPlaceDirectory(snapshot), 'utf8')
  writeFileSync(
    options.attributionOutput,
    `/** Generated by scripts/generate-official-place-directory.mjs. */\nexport const OFFICIAL_PLACE_DIRECTORY_RETRIEVED_DATE = '${snapshot.retrievedDate}'\n`,
    'utf8',
  )
  console.log(JSON.stringify({
    status: 'ok',
    mode: options.offlineInput ? 'offline' : 'online',
    output: options.output,
    attributionOutput: options.attributionOutput,
    schemaVersion: snapshot.schemaVersion,
    generatorVersion: snapshot.generator.version,
    retrievedDate: snapshot.retrievedDate,
    contentSha256: snapshot.contentSha256,
    settlementCount: snapshot.settlements.length,
    postalLocalityCount: Object.keys(snapshot.postalLocalities).length,
  }, null, 2))
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  if (options.offlineInput) {
    const input = JSON.parse(readFileSync(options.offlineInput, 'utf8'))
    const snapshot = buildDeterministicOfficialPlaceDirectory(input, {
      ...(options.retrievedDate ? { retrievedDate: options.retrievedDate } : {}),
    })
    writeSnapshot(snapshot, options)
    return
  }

  const [hagstofaSource, is50vSource, postalSource] = await Promise.all([
    fetchFeatureCollection('hagstofa'),
    fetchFeatureCollection('is50v'),
    fetchFeatureCollection('postal'),
  ])

  const hagstofa = prepareHagstofa(hagstofaSource.payload.features)
    .sort((a, b) => a.id.localeCompare(b.id, 'en'))
  const postalRecords = postalSource.payload.features.map(postalRecord).filter(Boolean)
    .sort((a, b) => (
      a.postalCode.localeCompare(b.postalCode, 'en')
      || a.sourceId.localeCompare(b.sourceId, 'en')
    ))
  if (hagstofa.length < MIN_COUNTS.hagstofa) throw new Error(`hagstofa_valid_count_${hagstofa.length}`)
  if (postalRecords.length < MIN_COUNTS.postal) throw new Error(`postal_valid_count_${postalRecords.length}`)
  const usedHagstofaIds = new Set()
  const settlements = []
  const is50vRecords = []

  for (const feature of is50vSource.payload.features) {
    const properties = feature?.properties ?? {}
    const name = cleanText(properties.nafnfitju)
    const id = cleanText(properties.uuid)
    if (!name || !id || polygonsFromGeometry(feature.geometry).length === 0) continue
    const point = representativePoint(feature.geometry)
    const hagstofaMatch = findHagstofaMatch(name, point, feature.geometry, hagstofa)
    is50vRecords.push({
      id,
      name,
      geometry: feature.geometry,
      updatedAt: cleanText(properties.dagsuppfaerslu) || null,
      hagstofa: hagstofaMatch,
    })
  }
  is50vRecords.sort((a, b) => a.id.localeCompare(b.id, 'en'))
  if (is50vRecords.length < MIN_COUNTS.is50v) throw new Error(`is50v_valid_count_${is50vRecords.length}`)

  const matchedGroups = new Map()
  for (const record of is50vRecords.filter(record => record.hagstofa)) {
    const key = record.hagstofa.id
    const group = matchedGroups.get(key) ?? []
    group.push(record)
    matchedGroups.set(key, group)
  }

  for (const key of [...matchedGroups.keys()].sort((a, b) => a.localeCompare(b, 'en'))) {
    const records = matchedGroups.get(key)
    const hagstofaMatch = records[0].hagstofa
    usedHagstofaIds.add(hagstofaMatch.id)
    settlements.push(buildSettlement({
      name: hagstofaMatch.name,
      geometry: combineGeometries(records.map(record => record.geometry)),
      is50vIds: records.map(record => record.id).sort(),
      is50vNames: unique(records.map(record => record.name)),
      is50vUpdatedAt: records.map(record => record.updatedAt).filter(Boolean).sort().at(-1) ?? null,
      hagstofa: hagstofaMatch,
      postalRecords,
    }))
  }

  for (const record of is50vRecords.filter(record => !record.hagstofa)) {
    settlements.push(buildSettlement({
      name: record.name,
      geometry: record.geometry,
      is50vIds: [record.id],
      is50vNames: [record.name],
      is50vUpdatedAt: record.updatedAt,
      hagstofa: null,
      postalRecords,
    }))
  }

  for (const place of hagstofa) {
    if (usedHagstofaIds.has(place.id)) continue
    // Composite Hagstofa areas can cover multiple current IS 50V settlements.
    // Those component settlements are more useful search results and must not
    // be duplicated or merged under a broad statistical label.
    if (is50vRecords.some(record => geometriesOverlap(place.geometry, record.geometry))) continue
    settlements.push(buildSettlement({
      name: place.name,
      geometry: place.geometry,
      is50vIds: [],
      is50vNames: [],
      is50vUpdatedAt: null,
      hagstofa: place,
      postalRecords,
    }))
  }

  const postalLocalities = {}
  const postalRecordsByCode = new Map()
  for (const record of postalRecords) {
    const records = postalRecordsByCode.get(record.postalCode) ?? []
    records.push(record)
    postalRecordsByCode.set(record.postalCode, records)
  }
  for (const [postalCode, records] of [...postalRecordsByCode.entries()].sort(([a], [b]) => a.localeCompare(b, 'is'))) {
    assertConsistentOfficialPostalLocalityRecords(postalCode, records)
    const record = [...records].sort(comparePostalRecords)[0]
    postalLocalities[postalCode] = {
      name: record.name,
      classification: record.classification,
      sourceId: record.sourceId,
      correctedAt: record.correctedAt,
    }
  }

  settlements.sort((a, b) => a.name.localeCompare(b.name, 'is') || a.id.localeCompare(b.id))
  const inputSnapshot = {
    sources: Object.fromEntries(Object.entries(SOURCES).map(([key, source]) => [key, {
      dataset: source.dataset,
      metadataUrl: source.metadataUrl,
      dataUrl: source.dataUrl,
      featureCount: ({ hagstofa: hagstofaSource, is50v: is50vSource, postal: postalSource })[key].count,
      contentSha256: ({ hagstofa: hagstofaSource, is50v: is50vSource, postal: postalSource })[key].hash,
    }])),
    settlements,
    postalLocalities,
  }
  const snapshot = buildDeterministicOfficialPlaceDirectory(inputSnapshot, {
    retrievedDate: options.retrievedDate,
  })

  writeSnapshot(snapshot, options)
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'official_place_directory_generation_failed')
  process.exitCode = 1
})
