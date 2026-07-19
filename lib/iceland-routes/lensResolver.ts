/**
 * Curated corridor route lens resolver for /vedrid.
 *
 * Matches user-typed from/to text against hand-curated route family aliases
 * defined in routeFamilies.ts. This is a local registry lookup, not a cache
 * of previously computed Google routes.
 * Never calls Google Routes API. Returns 'cache_miss' if no match is found.
 */

import { ROUTE_FAMILIES } from './routeFamilies'
import type { OverviewRouteLensQuery, OverviewRouteLensResult } from './lensTypes'

/**
 * Normalize a place name for alias matching:
 * - Lowercase
 * - ð → d, þ → th, æ → ae (Icelandic letters not covered by NFD)
 * - NFD decomposition + strip combining marks (handles á, é, í, ó, ú, ö, etc.)
 * - Trim whitespace
 */
export function normalizePlaceName(s: string): string {
  return s
    .toLowerCase()
    .replace(/ð/g, 'd')
    .replace(/þ/g, 'th')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
}

function matchesAny(normalized: string, aliases: readonly string[]): boolean {
  // Only exact match or: the normalized input is a prefix of a multi-word alias (alias starts with input + space).
  // Deliberately NOT allowing alias.startsWith(normalized) to prevent very short inputs
  // (e.g. "vi", "l", "vest") from matching unrelated destinations.
  return aliases.some(alias => normalized === alias || alias.startsWith(normalized + ' '))
}

/**
 * Resolve a from/to pair against the local route family registry.
 * Matching is case-insensitive and accent-insensitive.
 * Both directions (from→to and to→from) are tried.
 *
 * Returns 'idle' if either input is empty.
 * Returns 'cache_miss' if no matching route family is found.
 * Returns 'resolved' with the matching route family if found.
 */
export function resolveOverviewRouteLensCacheOnly(
  query: OverviewRouteLensQuery,
): OverviewRouteLensResult {
  const { from, to } = query
  if (!from.trim() || !to.trim()) return { status: 'idle' }

  const normFrom = normalizePlaceName(from)
  const normTo = normalizePlaceName(to)

  for (const family of ROUTE_FAMILIES) {
    const fromMatchesOrigin = matchesAny(normFrom, family.fromAliases)
    const toMatchesDest = matchesAny(normTo, family.toAliases)
    const fromMatchesDest = matchesAny(normFrom, family.toAliases)
    const toMatchesOrigin = matchesAny(normTo, family.fromAliases)

    if ((fromMatchesOrigin && toMatchesDest) || (fromMatchesDest && toMatchesOrigin)) {
      return { status: 'resolved', query, routeFamily: family }
    }
  }

  return { status: 'cache_miss', query }
}
