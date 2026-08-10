import { isIP } from 'node:net'

const FORBIDDEN_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map(Number)
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return true
  const [a, b] = parts
  return a === 0 || a === 10 || a === 127
    || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
    || a >= 224
}

function isPrivateIpv6(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  return normalized === '::' || normalized === '::1'
    || normalized.startsWith('fc') || normalized.startsWith('fd')
    || /^fe[89ab]/.test(normalized)
    || normalized.startsWith('ff')
    // URL canonicalization rewrites dotted IPv4-mapped literals to hex. Ads
    // have no valid reason to target any mapped literal, so reject the whole
    // family instead of trying to maintain two private-range parsers.
    || normalized.startsWith('::ffff:')
}

export function normalizeSafeHttpsUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed || trimmed.length > 2048 || FORBIDDEN_CHARACTERS.test(trimmed)) return null
  let url: URL
  try { url = new URL(trimmed) } catch { return null }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) return null
  if (url.port && url.port !== '443') return null
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) return null
  const ipVersion = isIP(hostname.replace(/^\[|\]$/g, ''))
  if (ipVersion === 4 && isPrivateIpv4(hostname)) return null
  if (ipVersion === 6 && isPrivateIpv6(hostname)) return null
  url.hostname = hostname
  return url.toString()
}

export function advertiserDomain(url: string): string {
  return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
}
