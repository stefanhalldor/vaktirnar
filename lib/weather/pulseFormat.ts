/**
 * Formats the short distance shown on pulse station pages without relying on
 * runtime ICU locale data. Server and browser must produce byte-identical text
 * during hydration.
 */
export function formatPulseDistanceKm(distanceM: number, locale: string): string {
  if (!Number.isFinite(distanceM) || distanceM < 0) {
    throw new Error('distanceM must be a non-negative finite number')
  }

  const rounded = (Math.round(distanceM / 100) / 10)
    .toFixed(1)
    .replace(/\.0$/, '')

  return locale.toLowerCase().startsWith('is')
    ? rounded.replace('.', ',')
    : rounded
}
