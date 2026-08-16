'use server'

import { guardTeskeidSession } from '@/lib/auth/guard'
import { normalizeEmailForAccess } from '@/lib/auth/email-normalization'
import {
  FeatureAccessRequestSchema,
  type FeatureAccessRequestResult,
  type RequestableClosedTestingFeatureId,
} from './featureAccessRequest.contracts'
import { sendFeatureAccessRequestEmail } from './featureAccessRequestEmail.server'
import {
  consumeFeatureAccessRequestQuota,
  getFeatureAccessEntitlementState,
} from './featureAccessRequest.server'

const GLOBAL_FEATURE_SWITCHES: Record<RequestableClosedTestingFeatureId, string> = {
  'utlagt-og-endurgreitt': 'EXPENSES_ENABLED',
  'afmaeli-og-vidburdir': 'EVENTS_ENABLED',
  bokhaldid: 'BOOKKEEPING_ENABLED',
  kviss: 'KVISS_ENABLED',
  auglysandi: 'ADVERTISER_ENABLED',
  bokanir: 'BOOKINGS_ENABLED',
}

export async function requestClosedTestingAccess(
  input: unknown,
): Promise<FeatureAccessRequestResult> {
  const parsed = FeatureAccessRequestSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid_input' }

  const featureId = parsed.data.feature_id
  if (process.env[GLOBAL_FEATURE_SWITCHES[featureId]] !== 'true') {
    return { ok: false, error: 'unavailable' }
  }

  const { user } = await guardTeskeidSession()
  const email = normalizeEmailForAccess(user.email ?? '')
  if (!email) return { ok: false, error: 'unavailable' }

  const entitlement = await getFeatureAccessEntitlementState(email, featureId)
  if (entitlement === 'unavailable') return { ok: false, error: 'unavailable' }
  if (entitlement === 'enabled') return { ok: true, status: 'already_enabled' }

  if (!await consumeFeatureAccessRequestQuota(user.id)) {
    return { ok: false, error: 'rate_limited' }
  }

  const delivery = await sendFeatureAccessRequestEmail({
    actorUserId: user.id,
    requesterEmail: email,
    featureId,
  })
  if (delivery !== 'accepted') return { ok: false, error: 'send_failed' }
  return { ok: true, status: 'requested' }
}
