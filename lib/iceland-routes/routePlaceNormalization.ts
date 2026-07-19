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
 * Example:
 *   normalizePlaceForMemory('Melás 8', 'Melás 8, Garðabær, Iceland')
 *   → { key: 'gardabaer', label: 'Garðabær' }
 *
 *   normalizePlaceForMemory('Reykjavík')
 *   → { key: 'reykjavik', label: 'Reykjavík' }
 *
 *   normalizePlaceForMemory('Melás 8')   // no locality
 *   → null
 */

type PlaceNormEntry = {
  patterns: RegExp[]
  key: string
  label: string
}

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

/**
 * Normalize a place name and optional formatted address to a specific Icelandic
 * place key and human-readable label.
 *
 * Returns null when no recognizable place name can be found — unrecognized inputs
 * (street addresses without a known locality, unknown towns) are not stored.
 */
export function normalizePlaceForMemory(
  name: string,
  formattedAddress?: string,
): { key: string; label: string } | null {
  const text = [name, formattedAddress].filter(Boolean).join(' ')
  for (const entry of PLACE_NORM_ENTRIES) {
    if (entry.patterns.some(p => p.test(text))) {
      return { key: entry.key, label: entry.label }
    }
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
