import 'server-only'
import { createHmac } from 'crypto'
import { getAdmin } from '@/lib/supabase/admin'

const DEFAULT_DAILY_LIMIT = 5
const MAX_DAILY_LIMIT = 1_000

function getWeatherGuestDailyLimit(): number {
  const raw = Number(process.env.WEATHER_PUBLIC_IP_DAILY_LIMIT)
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_DAILY_LIMIT
  return Math.min(Math.floor(raw), MAX_DAILY_LIMIT)
}

// Uses Reykjavik calendar date so the limit resets at local midnight.
// Prefixed with 'w.' to keep weather buckets distinct from auth IP buckets
// in the same check_and_increment_ip_rate_limit RPC table.
function getWindowKey(): string {
  const date = new Date().toLocaleDateString('sv-SE', { timeZone: 'Atlantic/Reykjavik' })
  return 'w.' + date
}

// HMAC(ip, HMAC(windowKey, secret)) — same algorithm as auth ip-rate-limit.
// Exported for unit testing only.
export function hashWeatherIp(ip: string, windowKey: string, secret: string): string {
  const dateKey = createHmac('sha256', secret).update(windowKey).digest('hex')
  return createHmac('sha256', dateKey).update(ip).digest('hex')
}

// Returns true = within limit (allowed), false = limit exceeded (blocked).
// Fails open: errors allow the request through. The rate limit is best-effort
// abuse mitigation — failing closed would block legitimate guests during
// Supabase outages.
export async function checkWeatherGuestRateLimit(ip: string): Promise<boolean> {
  if (!ip) {
    console.error('[weather/ip-rate-limit] no IP header — skipping rate-limit check')
    return true
  }

  const secret = process.env.AUTH_CODE_SECRET
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    console.error('[weather/ip-rate-limit] AUTH_CODE_SECRET missing or too short — skipping rate-limit check')
    return true
  }

  const windowKey = getWindowKey()
  const ipHash = hashWeatherIp(ip, windowKey, secret)

  try {
    const { data, error } = await getAdmin().rpc('check_and_increment_ip_rate_limit', {
      p_ip_hash:      ipHash,
      p_window_date:  windowKey,
      p_max_requests: getWeatherGuestDailyLimit(),
    })

    if (error) {
      console.error('[weather/ip-rate-limit] RPC error — fail open')
      return true
    }

    return data === true
  } catch {
    console.error('[weather/ip-rate-limit] unexpected error — fail open')
    return true
  }
}
