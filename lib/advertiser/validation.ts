import { z } from 'zod'
import { AD_PLACEMENTS } from './contracts'
import { normalizeSafeHttpsUrl } from './url'

const uuid = z.string().uuid()
const text = (min: number, max: number) => z.string().trim().min(min).max(max)
const safeUrl = z.string().transform((value, context) => {
  const normalized = normalizeSafeHttpsUrl(value)
  if (!normalized) {
    context.addIssue({ code: 'custom', message: 'unsafe_url' })
    return z.NEVER
  }
  return normalized
})

export const advertiserMutationSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('upsertProfile'), id: uuid.nullable().optional(),
    expectedRevision: z.number().int().positive().nullable().optional(),
    slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    displayName: text(1, 120), description: z.string().trim().max(500),
    websiteUrl: z.union([safeUrl, z.literal('')]).transform(value => value || null),
  }),
  z.object({
    action: z.literal('upsertCreative'), profileId: uuid,
    id: uuid.nullable().optional(), expectedRevision: z.number().int().positive().nullable().optional(),
    placement: z.enum(AD_PLACEMENTS), headline: text(1, 100), body: text(1, 300),
    ctaLabel: text(1, 40), destinationUrl: safeUrl,
  }),
  z.object({
    action: z.literal('transition'), creativeId: uuid,
    expectedRevision: z.number().int().positive(), transition: z.enum(['submit', 'activate', 'pause']),
    idempotencyKey: uuid,
  }),
])

export const advertiserReviewSchema = z.object({
  creativeId: uuid, expectedRevision: z.number().int().positive(),
  decision: z.enum(['approved', 'changes_requested', 'rejected', 'pause']),
  note: z.string().trim().max(500), idempotencyKey: uuid,
}).strict()
