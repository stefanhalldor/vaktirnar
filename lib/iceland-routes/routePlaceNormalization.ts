/**
 * Fine-grained place normalization for route-memory.
 *
 * Differs from normalizeToArea() in routeObservation.ts:
 * - Returns specific municipality/town keys (Garðabær, Reykjavík, Kópavogur...)
 *   rather than coarse area groups (hofudborgarsvaedi).
 * - Used by the route-memory writer and lookup so that "Reykjavík → Akureyri"
 *   is stored and looked up as exact city keys, not as a broad region.
 *
 * Privacy: never stores raw street addresses or house numbers.
 * If no recognizable place name can be extracted from the input, returns null
 * and the route-memory write is skipped entirely.
 *
 * Self-registering: any valid Icelandic public locality is accepted via generic
 * address parsing — no manual whitelist entry is required. The alias table below
 * is checked first (wins for known/variant spellings), then a generic parser
 * extracts the locality from name or formattedAddress.
 *
 * Examples:
 *   normalizePlaceForMemory('Melás 8', 'Melás 8, Garðabær, Iceland')
 *   → { key: 'gardabaer', label: 'Garðabær' }
 *
 *   normalizePlaceForMemory('Siglufjörður', '580 Siglufjörður, Iceland')
 *   → { key: 'siglufjordur', label: 'Siglufjörður' }
 *
 *   normalizePlaceForMemory('Strandvegur 4', 'Strandvegur 4, Sandgerði, Iceland')
 *   → { key: 'sandgerdi', label: 'Sandgerði' }
 *
 *   normalizePlaceForMemory('Melás 8')   // no locality discernible
 *   → null
 */

type PlaceNormEntry = {
  patterns: RegExp[]
  key: string
  label: string
}

// Alias/override table — checked before generic parsing.
// Handles known variant spellings, ASCII approximations, and ambiguous names.
// Ordered most-specific first within each region.
// All patterns use \b word boundaries to avoid partial matches.
const PLACE_NORM_ENTRIES: PlaceNormEntry[] = [
  // Capital area — individual municipalities (more specific than 'reykjavik')
  { patterns: [/\bgar[ðd]ab(?:æ|ae)r\b/i], key: 'gardabaer', label: 'Garðabær' },
  { patterns: [/\bhafnarfj[öo]r[ðd]ur\b/i], key: 'hafnarfjordur', label: 'Hafnarfjörður' },
  { patterns: [/\bk[oó]pavogur\b/i], key: 'kopavogur', label: 'Kópavogur' },
  { patterns: [/\bseltjarnarnes\b/i], key: 'seltjarnarnes', label: 'Seltjarnarnes' },
  { patterns: [/\bmosfellsb[æa]r\b/i], key: 'mosfellsbaer', label: 'Mosfellsbær' },
  { patterns: [/\b[áa]lftanes\b/i], key: 'alftanes', label: 'Álftanes' },
  { patterns: [/\breykjanesb[æa]r\b/i], key: 'reykjanesbær', label: 'Reykjanesbær' },
  { patterns: [/\bkeflav[íi]k\b/i], key: 'keflavik', label: 'Keflavík' },
  // Reykjavík after the more specific capital-area municipalities
  { patterns: [/\breykjav[ií]k\b/i], key: 'reykjavik', label: 'Reykjavík' },
  // North
  { patterns: [/\bakureyri\b/i], key: 'akureyri', label: 'Akureyri' },
  { patterns: [/\bsiglufj[öo]r[ðd]ur\b/i], key: 'siglufjordur', label: 'Siglufjörður' },
  { patterns: [/\bh[uú]sav[íi]k\b/i], key: 'husavik', label: 'Húsavík' },
  // East
  { patterns: [/\begilssta[ðd]ir\b/i], key: 'egilsstadir', label: 'Egilsstaðir' },
  // Westfjords
  { patterns: [/\b[íi]safj[öo]r[ðd]ur\b/i], key: 'isafjordur', label: 'Ísafjörður' },
  { patterns: [/\bh[oó]lmav[íi]k\b/i], key: 'holmavik', label: 'Hólmavík' },
  // West
  { patterns: [/\bborgarnes\b/i], key: 'borgarnes', label: 'Borgarnes' },
  { patterns: [/\bstykkish[oó]lmur\b/i], key: 'stykkisholmur', label: 'Stykkishólmur' },
  { patterns: [/\bgrundarfj[öo]r[ðd]ur\b/i], key: 'grundarfjordur', label: 'Grundarfjörður' },
  { patterns: [/\b[oó]lafsv[íi]k\b/i], key: 'olafsvik', label: 'Ólafsvík' },
  // Northwest
  { patterns: [/\bbl[oö]ndu[oó]s\b/i], key: 'blonduos', label: 'Blönduós' },
  { patterns: [/\bvarmahlí[ðd]\b/i], key: 'varmahlid', label: 'Varmahlíð' },
  // South
  { patterns: [/\bselfoss\b/i], key: 'selfoss', label: 'Selfoss' },
  { patterns: [/\bhvolsv[öo]llur\b/i], key: 'hvolsvollur', label: 'Hvolsvöllur' },
  { patterns: [/\bkirkjub[æa]jarklaustur\b/i], key: 'kirkjubaejarklaustur', label: 'Kirkjubæjarklaustur' },
  // Southeast
  { patterns: [/\bh[oö]fn\b/i, /\bhornafjör[ðd]ur\b/i], key: 'hofn', label: 'Höfn' },
  // South coast
  { patterns: [/\bv[íi]k\b.*\bm[ýy]rdal\b/i, /\bm[ýy]rdal\b.*\bv[íi]k\b/i], key: 'vik', label: 'Vík' },
]

const COUNTRY_SUFFIX = /^(iceland|[íi]sland)$/i
// Has a digit anywhere — used to detect street-like parts after postal stripping.
const HAS_DIGIT = /\d/
// Road labels are not public localities; avoid storing "Biskupstungnabraut" as a place.
const ROAD_LIKE_SUFFIX = /(vegur|vegi|gata|götu|gotu|braut|stígur|stigur|leið|leid)$/i

/**
 * Convert an Icelandic place label to a stable ASCII key.
 * Consistent diacritic mapping: á→a, ð→d, é→e, í→i, ó→o, ú→u, ý→y, þ→th, æ→ae, ö→o.
 */
export function slugifyPlaceKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[á]/g, 'a')
    .replace(/ð/g, 'd')
    .replace(/[é]/g, 'e')
    .replace(/[í]/g, 'i')
    .replace(/[ó]/g, 'o')
    .replace(/[ú]/g, 'u')
    .replace(/[ý]/g, 'y')
    .replace(/þ/g, 'th')
    .replace(/æ/g, 'ae')
    .replace(/ö/g, 'o')
    .replace(/[^a-z0-9]+/g, '')
}

function formatGenericPlaceLabel(label: string): string {
  return label
    .trim()
    .split(/(\s+|-)/)
    .map(part => {
      if (/^\s+$/.test(part) || part === '-') return part
      const lower = part.toLocaleLowerCase('is')
      return lower.charAt(0).toLocaleUpperCase('is') + lower.slice(1)
    })
    .join('')
}

function normalizeGenericCandidate(label: string): { key: string; label: string } | null {
  const stripped = label.trim().replace(/^\d+\s+/, '')
  if (stripped.length < 2) return null
  if (HAS_DIGIT.test(stripped)) return null
  if (COUNTRY_SUFFIX.test(stripped)) return null
  if (ROAD_LIKE_SUFFIX.test(stripped)) return null

  const displayLabel = formatGenericPlaceLabel(stripped)
  const key = slugifyPlaceKey(displayLabel)
  if (!key) return null
  return { label: displayLabel, key }
}

/**
 * Extract the public locality from a formatted address string.
 *
 * Algorithm:
 * 1. Split by comma.
 * 2. Drop country suffix (Iceland / Ísland).
 * 3. Strip postal-code prefix from each part (e.g. "580 Siglufjörður" → "Siglufjörður").
 * 4. Skip parts that still contain a digit or look road-like (e.g. "Melás 8", "Biskupstungnabraut").
 * 5. Return the first remaining part as the locality label + slugified key.
 */
function extractLocality(addr: string): { key: string; label: string } | null {
  const parts = addr.split(',').map(p => p.trim()).filter(Boolean)
  for (const part of parts) {
    const locality = normalizeGenericCandidate(part)
    if (locality) return locality
  }
  return null
}

/**
 * Normalize a place name and optional formatted address to a route-memory
 * place key and human-readable label.
 *
 * Resolution order:
 * 1. Alias table (PLACE_NORM_ENTRIES) — handles known variant spellings.
 * 2. Name itself if it is a clean public locality label.
 * 3. Generic address parser on formattedAddress — self-registers any public locality.
 *
 * Returns null only when no public locality can be extracted (e.g. bare street
 * address "Melás 8" with no locality context).
 */
export function normalizePlaceForMemory(
  name: string,
  formattedAddress?: string,
): { key: string; label: string } | null {
  if (!name && !formattedAddress) return null

  // 1. Alias table — checked first, wins for known/variant spellings.
  const text = [name, formattedAddress].filter(Boolean).join(' ')
  for (const entry of PLACE_NORM_ENTRIES) {
    if (entry.patterns.some(p => p.test(text))) {
      return { key: entry.key, label: entry.label }
    }
  }

  // 2. Prefer the selected place name when it is a clean locality label.
  // Prevents road-only formattedAddress values from overriding a valid Google place name,
  // e.g. "Stóra-borg" with formattedAddress "Biskupstungnabraut, 805".
  const nameCandidate = normalizeGenericCandidate(name)
  if (nameCandidate) return nameCandidate

  // 3. Generic address parser — extract locality from formattedAddress.
  if (formattedAddress) {
    const locality = extractLocality(formattedAddress)
    if (locality) return locality
  }

  return null
}

/**
 * Build a stable route-memory key from normalized place keys and a variant key.
 * Format: '{fromKey}--{toKey}--{variantKey}'
 */
export function buildRouteMemoryKey(
  fromKey: string,
  toKey: string,
  variantKey = 'default',
): string {
  return `${fromKey}--${toKey}--${variantKey}`
}
