/**
 * Validates and resolves a `?next` login redirect parameter.
 *
 * Only internal paths are allowed:
 *   - /auth-mvp/... (any sub-path)
 *   - /vedrid exactly, or /vedrid/ /vedrid? /vedrid# (strict boundary — not /vedrid-anything)
 *
 * Returns null for external URLs, protocol-relative URLs, or untrusted paths.
 * Never throws.
 */
function isAllowedInternalPath(path: string): boolean {
  if (path.startsWith('/auth-mvp/')) return true
  if (path === '/vedrid') return true
  if (path.startsWith('/vedrid/') || path.startsWith('/vedrid?') || path.startsWith('/vedrid#')) return true
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
