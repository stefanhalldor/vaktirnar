import 'server-only'

import { createHmac } from 'node:crypto'

import { normalizeEmailForAccess } from '@/lib/auth/email-normalization'
import { getAdmin } from '@/lib/supabase/admin'
import type { RequestableClosedTestingFeatureId } from './featureAccessRequest.contracts'

const DAILY_REQUEST_LIMIT = 3

export type FeatureAccessEntitlementState = 'enabled' | 'missing' | 'unavailable'

export async function getFeatureAccessEntitlementState(
  email: string,
  featureId: RequestableClosedTestingFeatureId,
): Promise<FeatureAccessEntitlementState> {
  const canonical = normalizeEmailForAccess(email)
  if (!canonical) return 'unavailable'
  try {
    const { data, error } = await getAdmin()
      .from('feature_access')
      .select('email')
      .eq('email', canonical)
      .eq('feature_key', featureId)
      .maybeSingle()
    if (error) {
      console.error('[feature-access-request] entitlement lookup failed')
      return 'unavailable'
    }
    return data === null ? 'missing' : 'enabled'
  } catch {
    console.error('[feature-access-request] entitlement lookup failed')
    return 'unavailable'
  }
}

function reykjavikWindowDate(now: Date): string {
  return now.toLocaleDateString('sv-SE', { timeZone: 'Atlantic/Reykjavik' })
}

function actorRequestHash(actorUserId: string, windowDate: string, secret: string): string {
  const dateKey = createHmac('sha256', secret).update(windowDate).digest('hex')
  return createHmac('sha256', dateKey)
    .update(`feature-access-request:${actorUserId}`)
    .digest('hex')
}

/**
 * Reuses the existing private daily counter with a separately namespaced HMAC.
 * Failure is closed because this protects an administrator inbox and provider
 * spend, not an authentication path.
 */
export async function consumeFeatureAccessRequestQuota(
  actorUserId: string,
  now = new Date(),
): Promise<boolean> {
  const secret = process.env.AUTH_CODE_SECRET
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    console.error('[feature-access-request] rate limit is not configured')
    return false
  }

  const windowDate = reykjavikWindowDate(now)
  const hash = actorRequestHash(actorUserId, windowDate, secret)
  try {
    const { data, error } = await getAdmin().rpc('check_and_increment_ip_rate_limit', {
      p_ip_hash: hash,
      p_window_date: windowDate,
      p_max_requests: DAILY_REQUEST_LIMIT,
    })
    if (error || data !== true) {
      if (error) console.error('[feature-access-request] rate limit lookup failed')
      return false
    }
    return true
  } catch {
    console.error('[feature-access-request] rate limit lookup failed')
    return false
  }
}
