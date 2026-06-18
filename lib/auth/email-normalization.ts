/**
 * Email normalization for feature access checks.
 *
 * Gmail and googlemail.com: remove dots from local-part and normalize
 * domain to gmail.com. This matches Gmail's delivery behaviour where
 * a.b@gmail.com and ab@gmail.com reach the same inbox.
 *
 * Other domains: trim + lowercase only. Dots are significant on other
 * mail systems and must not be removed.
 *
 * Returns null for invalid or empty input.
 */
export function normalizeEmailForAccess(email: string): string | null {
  if (typeof email !== 'string') return null
  const trimmed = email.trim().toLowerCase()
  if (!trimmed) return null
  const atIdx = trimmed.lastIndexOf('@')
  if (atIdx < 1) return null
  const local = trimmed.slice(0, atIdx)
  const domain = trimmed.slice(atIdx + 1)
  if (!local || !domain || !domain.includes('.') || /\s/.test(trimmed)) return null
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    const canonicalLocal = local.replace(/\./g, '')
    if (!canonicalLocal) return null
    return `${canonicalLocal}@gmail.com`
  }
  return `${local}@${domain}`
}
