/** Normalize Icelandic place text for deterministic prefix search. */
export function normalizePlaceSearchText(value: string): string {
  return value
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

export function cleanPlaceText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

/** Preserve leading zeroes while tolerating spreadsheet-style integer decimals. */
export function normalizeFixedNumericCode(value: unknown, width: number): string | null {
  const cleaned = cleanPlaceText(value)
  const match = /^(\d+)(?:\.0+)?$/.exec(cleaned)
  if (!match || match[1].length > width) return null
  return match[1].padStart(width, '0')
}

export function buildNormalizedSearchText(parts: readonly (string | null | undefined)[]): string {
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const part of parts) {
    const value = normalizePlaceSearchText(part ?? '')
    if (!value || seen.has(value)) continue
    seen.add(value)
    normalized.push(value)
  }
  return normalized.join(' ')
}
