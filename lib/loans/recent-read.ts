export const RECENT_READ_COOKIE = 'teskeid_recent_read_v2'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days
const MAX_KEYS = 80
const KEY_REGEX = /^[0-9a-f]{32}$/

export function parseRecentReadCookie(value: string | null | undefined): Set<string> {
  if (!value) return new Set()
  return new Set(value.split('.').filter((k) => KEY_REGEX.test(k)))
}

export function serializeRecentReadKeys(
  existing: Set<string>,
  newKeys: string[]
): string {
  const merged = [...new Set([...existing, ...newKeys])]
  return merged.slice(-MAX_KEYS).join('.')
}

export function writeRecentReadCookie(serialized: string): void {
  const secure =
    typeof window !== 'undefined' && window.location.protocol === 'https:'
      ? '; Secure'
      : ''
  document.cookie = `${RECENT_READ_COOKIE}=${serialized}; path=/; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}${secure}`
}
