import 'server-only'
import { createHmac } from 'crypto'
import { getAdmin } from '@/lib/supabase/admin'

export type UsageFeatureKey = 'vedrid' | 'minnid' | 'tengsl' | 'umonnun'

type UsageEventInput = {
  userId: string
  featureKey: UsageFeatureKey
  eventName: string
  path?: string
  metadata?: Record<string, unknown>
}

const BLOCKED_KEY_RE = /email|name|address|lat|lon|place|polyline|forecast|secret|token/i
const MAX_STR = 200

/** Strip keys with sensitive names and values that are too long or structurally unsafe. */
export function sanitizeUsageMetadata(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(input)) {
    if (BLOCKED_KEY_RE.test(key)) continue
    if (typeof val === 'string') {
      if (val.length <= MAX_STR) out[key] = val
    } else if (typeof val === 'number' || typeof val === 'boolean') {
      out[key] = val
    } else if (Array.isArray(val) && val.every(v => typeof v === 'string' && v.length <= MAX_STR)) {
      out[key] = val
    }
    // Nested objects and other types are dropped
  }
  return out
}

/**
 * Non-throwing usage event recorder. Callers should await this function so
 * serverless runtimes do not drop the insert before it completes.
 * Failures are caught and logged with a generic message only (no metadata in logs).
 */
export async function recordTeskeidUsageEvent(input: UsageEventInput): Promise<void> {
  try {
    const metadata = input.metadata ? sanitizeUsageMetadata(input.metadata) : {}
    const { error } = await getAdmin()
      .from('teskeid_usage_events')
      .insert({
        user_id: input.userId,
        feature_key: input.featureKey,
        event_name: input.eventName,
        path: input.path ?? '',
        metadata,
      })
    if (error) console.error('[usage] insert failed')
  } catch {
    console.error('[usage] insert failed')
  }
}

/**
 * HMAC fingerprint for an origin/destination pair using 3-decimal coordinate
 * precision (~100 m). Stores the hash only — never the source coordinates.
 * Returns null when USAGE_EVENT_SECRET is not set; callers must omit routePairHash
 * from metadata in that case so no unsalted hashes reach the database.
 */
export function routePairFingerprint(
  origin: { lat: number; lon: number },
  destination: { lat: number; lon: number },
): string | null {
  const secret = process.env.USAGE_EVENT_SECRET
  if (!secret) return null
  const key = `${origin.lat.toFixed(3)}:${origin.lon.toFixed(3)}->${destination.lat.toFixed(3)}:${destination.lon.toFixed(3)}`
  return createHmac('sha256', secret).update(key).digest('hex')
}
