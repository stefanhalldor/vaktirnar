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
