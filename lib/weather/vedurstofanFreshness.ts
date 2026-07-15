/**
 * Veðurstofan forecast cycle freshness helpers.
 *
 * Veðurstofan issues forecasts on a 3-hour UTC cadence (00, 03, 06, 09, 12, 15, 18, 21).
 * A cached payload is considered fresh only when its atimeIso matches the current expected cycle.
 * A 10-minute grace window avoids false stale-alerts while the provider publishes new data.
 *
 * Key distinction:
 *   atimeIso  — which Veðurstofan forecast cycle the data belongs to
 *   fetchedAtIso — when Teskeið fetched it (observability only, not freshness)
 *
 * Pure functions — safe to use in both server and client contexts.
 */

export const VEDURSTOFAN_CADENCE_MS = 3 * 60 * 60 * 1000 // 3 hours
export const VEDURSTOFAN_GRACE_MS = 10 * 60 * 1000 // 10 minutes

/**
 * Returns the ISO timestamp of the most recent expected Veðurstofan forecast cycle
 * boundary at or before the given time (UTC, rounded down to the nearest 3-hour mark).
 *
 * Examples (UTC): 12:05 → "...T12:00:00.000Z", 14:59 → "...T12:00:00.000Z", 15:00 → "...T15:00:00.000Z"
 */
export function getExpectedVedurstofanCycleIso(now: Date): string {
  const dayStartMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const msInDay =
    now.getUTCHours() * 3_600_000 +
    now.getUTCMinutes() * 60_000 +
    now.getUTCSeconds() * 1_000 +
    now.getUTCMilliseconds()
  const cycleOffsetMs = Math.floor(msInDay / VEDURSTOFAN_CADENCE_MS) * VEDURSTOFAN_CADENCE_MS
  return new Date(dayStartMs + cycleOffsetMs).toISOString()
}

/**
 * Returns the ISO timestamp of the next expected Veðurstofan forecast cycle after now.
 * Used for display: "ný gögn væntanleg kl. HH:mm".
 */
export function getNextVedurstofanCycleIso(now: Date): string {
  return new Date(Date.parse(getExpectedVedurstofanCycleIso(now)) + VEDURSTOFAN_CADENCE_MS).toISOString()
}

/**
 * Returns true when the payload's atimeIso is considered fresh for display and calculation.
 *
 * Rules:
 * - If still within the grace window after a cycle boundary, data is fresh (provider may not have published yet).
 * - After the grace window, data must be from the current expected cycle.
 * - A recently-fetched payload with an old atimeIso is still stale.
 */
/**
 * Returns the ISO timestamp of the forecast cycle that immediately follows the given atime.
 * Used to display "ný spá var/væntanleg kl. HH:mm" in the freshness banner.
 */
export function getNextCycleAfterAtimeIso(atimeIso: string): string {
  return new Date(Date.parse(atimeIso) + VEDURSTOFAN_CADENCE_MS).toISOString()
}

export function isVedurstofanCycleFresh(atimeIso: string | null, now: Date): boolean {
  if (!atimeIso) return false
  const atimeMs = Date.parse(atimeIso)
  if (isNaN(atimeMs)) return false
  const expectedCycleMs = Date.parse(getExpectedVedurstofanCycleIso(now))
  const prevCycleMs = expectedCycleMs - VEDURSTOFAN_CADENCE_MS
  // Within grace window: accept current OR immediately previous cycle only.
  // Prevents arbitrarily old data from looking fresh during grace.
  if (now.getTime() - expectedCycleMs < VEDURSTOFAN_GRACE_MS) {
    return atimeMs >= prevCycleMs - 60_000
  }
  // After grace: data must be from the current expected cycle.
  // Allow ±1 min for minor UTC rounding differences in provider timestamps.
  return atimeMs >= expectedCycleMs - 60_000
}
