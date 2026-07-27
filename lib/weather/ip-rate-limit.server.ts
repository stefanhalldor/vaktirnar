import 'server-only'
import { createHmac } from 'crypto'
import { getAdmin } from '@/lib/supabase/admin'

const DEFAULT_DAILY_LIMIT = 5
const DEFAULT_TESKEID_CANDIDATE_DAILY_LIMIT = 60
const MAX_DAILY_LIMIT = 1_000

export type WeatherGuestRateLimitScope = 'route-options' | 'teskeid-candidate'

function getWeatherGuestDailyLimit(scope: WeatherGuestRateLimitScope): number {
  if (scope === 'teskeid-candidate') return DEFAULT_TESKEID_CANDIDATE_DAILY_LIMIT
  const raw = Number(process.env.WEATHER_PUBLIC_IP_DAILY_LIMIT)
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_DAILY_LIMIT
  return Math.min(Math.floor(raw), MAX_DAILY_LIMIT)
}

// Uses Reykjavik calendar date so the limit resets at local midnight.
// The RPC parameter is SQL DATE, so the domain separation belongs in the
// HMAC input rather than in the date value sent to Supabase.
function getWindowDate(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Atlantic/Reykjavik' })
}

// HMAC(ip, HMAC(weather scope + date, secret)). The scope keeps weather
// buckets separate from auth and lets the self-owned candidate graph have a
// bounded budget without double-charging the paid route-options budget.
// Exported for unit testing only.
export function hashWeatherIp(
  ip: string,
  windowDate: string,
  secret: string,
  scope: WeatherGuestRateLimitScope = 'route-options',
): string {
  const dateKey = createHmac('sha256', secret)
    .update(`weather:${scope}:${windowDate}`)
    .digest('hex')
  return createHmac('sha256', dateKey).update(ip).digest('hex')
}

// Returns true = within limit (allowed), false = blocked.
// Paid route options retain the existing availability-first fail-open policy.
// The self-owned candidate scope fails closed because graph work must not
// become unbounded when the limiter or forwarding headers are unavailable.
export async function checkWeatherGuestRateLimit(
  ip: string,
  scope: WeatherGuestRateLimitScope = 'route-options',
): Promise<boolean> {
  const failureFallback = scope === 'route-options'
  if (!ip) {
    console.error('[weather/ip-rate-limit] no IP header — applying scope fallback')
    return failureFallback
  }

  const secret = process.env.AUTH_CODE_SECRET
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    console.error('[weather/ip-rate-limit] AUTH_CODE_SECRET missing or too short — applying scope fallback')
    return failureFallback
  }

  const windowDate = getWindowDate()
  const ipHash = hashWeatherIp(ip, windowDate, secret, scope)

  try {
    const { data, error } = await getAdmin().rpc('check_and_increment_ip_rate_limit', {
      p_ip_hash:      ipHash,
      p_window_date:  windowDate,
      p_max_requests: getWeatherGuestDailyLimit(scope),
    })

    if (error) {
      console.error('[weather/ip-rate-limit] RPC error — applying scope fallback')
      return failureFallback
    }

    return data === true
  } catch {
    console.error('[weather/ip-rate-limit] unexpected error — applying scope fallback')
    return failureFallback
  }
}
