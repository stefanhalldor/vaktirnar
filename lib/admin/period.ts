/**
 * Smallest analytics PERIOD that covers a given elapsed time.
 * Used to auto-select the period filter based on time since last admin visit.
 */

const BREAKPOINTS: ReadonlyArray<[maxMs: number, period: string]> = [
  [5 * 60 * 1000, '5min'],
  [10 * 60 * 1000, '10min'],
  [15 * 60 * 1000, '15min'],
  [30 * 60 * 1000, '30min'],
  [60 * 60 * 1000, '1h'],
  [2 * 60 * 60 * 1000, '2h'],
  [6 * 60 * 60 * 1000, '6h'],
  [12 * 60 * 60 * 1000, '12h'],
  [24 * 60 * 60 * 1000, '24h'],
  [7 * 24 * 60 * 60 * 1000, '7d'],
  [30 * 24 * 60 * 60 * 1000, '30d'],
]

/**
 * Returns the smallest PERIOD value that covers `elapsedMs` milliseconds.
 *
 * @param elapsedMs Elapsed time in milliseconds since last admin page visit.
 *   <= 5 min  → '5min'
 *   <= 10 min → '10min'
 *   ... (see BREAKPOINTS above)
 *   <= 30 d   → '30d'
 *   > 30 d    → 'all'
 */
export function pickPeriod(elapsedMs: number): string {
  for (const [maxMs, period] of BREAKPOINTS) {
    if (elapsedMs <= maxMs) return period
  }
  return 'all'
}

/**
 * Resolves the initial analytics period from the localStorage timestamp.
 *
 * Safe fallback in all non-happy-path cases:
 *   - `stored` is null (first visit)      → '5min'
 *   - `stored` is non-numeric (corrupted) → '5min'
 *   - elapsed is negative (future clock)  → '5min'
 *   - valid elapsed                       → pickPeriod(elapsed)
 *
 * @param stored Raw string from localStorage, or null if absent.
 * @param now    Current timestamp in ms (Date.now() at read time).
 */
export function resolveInitialPeriod(stored: string | null, now: number): string {
  if (stored === null) return '5min'
  const trimmed = stored.trim()
  if (trimmed === '') return '5min'
  const timestamp = Number(trimmed)
  if (!isFinite(timestamp) || timestamp < 0) return '5min'
  const elapsed = now - timestamp
  if (elapsed < 0) return '5min'
  return pickPeriod(elapsed)
}
