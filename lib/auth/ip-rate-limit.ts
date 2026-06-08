import 'server-only'
import { createHmac } from 'crypto'
import { getAdmin } from '@/lib/supabase/admin'

// Maximum OTP requests per IP per rolling daily window.
const MAX_REQUESTS = 10

// Window keyed to Reykjavik calendar date so the limit resets at midnight
// local time regardless of server timezone.
function getWindowDate(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Atlantic/Reykjavik' })
}

// HMAC(ip, HMAC(windowDate, secret))
// windowDate and secret are passed in so the caller computes them once —
// p_ip_hash and p_window_date are always derived from the same date value.
// Exported for unit testing; not part of the public module surface.
export function hashIp(ip: string, windowDate: string, secret: string): string {
  const dateKey = createHmac('sha256', secret).update(windowDate).digest('hex')
  return createHmac('sha256', dateKey).update(ip).digest('hex')
}

// Returns true  = request is within limit (allowed).
// Returns false = limit exceeded (blocked).
//
// Failure mode: fail open.
// - Missing or short AUTH_CODE_SECRET: skip rate-limit check (no weak hash stored).
// - Missing IP header: skip rate-limit check (no shared bucket throttle).
// - RPC error or unexpected exception: allow the request through.
//
// Rationale: the IP rate-limit is best-effort abuse mitigation; the allowlist
// is the primary security gate. Failing closed would block all OTP requests
// during Supabase outages or misconfigured deployments.
export async function checkIpRateLimit(ip: string): Promise<boolean> {
  // Fail open: no IP header means we cannot distinguish users — do not create
  // a shared 'unknown' bucket that throttles all login requests at once.
  if (!ip) {
    console.error('[ip-rate-limit] no IP header present — skipping rate-limit check')
    return true
  }

  // Mirror the secret validation in lib/auth/codes.ts: missing or short secrets
  // must not be used as HMAC keys because the resulting hashes would be trivially
  // brute-forced for common IP addresses.
  const secret = process.env.AUTH_CODE_SECRET
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    console.error('[ip-rate-limit] AUTH_CODE_SECRET missing or too short — skipping rate-limit check')
    return true
  }

  const windowDate = getWindowDate()
  const ipHash     = hashIp(ip, windowDate, secret)

  try {
    const { data, error } = await getAdmin().rpc('check_and_increment_ip_rate_limit', {
      p_ip_hash:      ipHash,
      p_window_date:  windowDate,
      p_max_requests: MAX_REQUESTS,
    })

    if (error) {
      console.error('[ip-rate-limit] RPC error — fail open')
      return true // fail open
    }

    return data === true
  } catch {
    console.error('[ip-rate-limit] unexpected error')
    return true // fail open
  }
}
