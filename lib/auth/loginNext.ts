/**
 * Validates and resolves a `?next` login redirect parameter.
 *
 * Only internal paths are allowed:
 *   - /auth-mvp/... (any sub-path)
 *   - /vedrid exactly, or /vedrid/ /vedrid? /vedrid# (strict boundary — not /vedrid-anything)
 *   - exact public Bookings provider/detail paths (no query or fragment)
 *
 * Returns null for external URLs, protocol-relative URLs, or untrusted paths.
 * Never throws.
 */
const BOOKING_SLUG = '[a-z0-9]+(?:-[a-z0-9]+)*'
const BOOKING_UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const BOOKING_PROVIDER_PATH = new RegExp(`^/bokanir/(${BOOKING_SLUG})$`)
const BOOKING_DETAIL_PATH = new RegExp(
  `^/bokanir/(${BOOKING_SLUG})/fyrirspurn/${BOOKING_UUID}$`,
)

export function isSafeBookingLoginNext(path: string | null | undefined): path is string {
  if (!path) return false
  const match = BOOKING_PROVIDER_PATH.exec(path) ?? BOOKING_DETAIL_PATH.exec(path)
  return Boolean(match && match[1].length >= 2 && match[1].length <= 80)
}

function isAllowedInternalPath(path: string): boolean {
  if (path.startsWith('/auth-mvp/')) return true
  if (path === '/vedrid') return true
  if (path.startsWith('/vedrid/') || path.startsWith('/vedrid?') || path.startsWith('/vedrid#')) return true
  if (isSafeBookingLoginNext(path)) return true
  return false
}

export function resolveSafeLoginNext(next: string | null | undefined): string | null {
  if (!next) return null
  try {
    if (next.startsWith('http://') || next.startsWith('https://') || next.startsWith('//')) return null
    if (!next.startsWith('/')) return null
    if (!isAllowedInternalPath(next)) return null
    return next
  } catch {
    return null
  }
}
