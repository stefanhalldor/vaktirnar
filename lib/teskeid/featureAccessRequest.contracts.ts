import { z } from 'zod'

export const REQUESTABLE_CLOSED_TESTING_FEATURE_IDS = [
  'utlagt-og-endurgreitt',
  'afmaeli-og-vidburdir',
  'bokhaldid',
  'kviss',
  'auglysandi',
  'bokanir',
] as const

export type RequestableClosedTestingFeatureId =
  typeof REQUESTABLE_CLOSED_TESTING_FEATURE_IDS[number]

export const FeatureAccessRequestSchema = z.object({
  feature_id: z.enum(REQUESTABLE_CLOSED_TESTING_FEATURE_IDS),
}).strict()

export type FeatureAccessRequestResult =
  | { ok: true; status: 'requested' | 'already_enabled' }
  | { ok: false; error: 'unavailable' | 'rate_limited' | 'send_failed' | 'invalid_input' }
