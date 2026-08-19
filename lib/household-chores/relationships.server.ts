import 'server-only'

import { z } from 'zod'
import { getAdmin } from '@/lib/supabase/admin'
import type { HouseholdChoreInviteCandidatePage } from './contracts'
import { HouseholdChoreRepositoryError } from './repository.server'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const FORBIDDEN_CONTROLS = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u

const uuidSchema = z.string().regex(UUID_PATTERN)
const safeLabelSchema = z.string()
  .min(1)
  .max(120)
  .refine(value => value.trim() === value)
  .refine(value => !value.includes('@') && !FORBIDDEN_CONTROLS.test(value))
const cursorSchema = z.object({
  label: safeLabelSchema,
  relationshipId: uuidSchema,
}).strict()
const optionsSchema = z.object({
  cursor: cursorSchema.nullable().optional(),
  limit: z.number().int().min(1).max(50).optional(),
}).strict()
const candidateSchema = z.object({
  relationship_id: uuidSchema,
  label: safeLabelSchema,
}).strict()
const candidateCursorSchema = z.object({
  label: safeLabelSchema,
  relationship_id: uuidSchema,
}).strict()
const successEnvelopeSchema = z.object({
  ok: z.literal(true),
  code: z.literal('get_invite_candidates_loaded'),
  data: z.object({
    items: z.array(candidateSchema).max(50),
    has_more: z.boolean(),
    next_cursor: candidateCursorSchema.nullable(),
  }).strict(),
}).strict().superRefine((value, context) => {
  if (value.data.has_more !== (value.data.next_cursor !== null)) {
    context.addIssue({ code: 'custom', path: ['data', 'next_cursor'], message: 'invalid' })
    return
  }
  if (value.data.next_cursor) {
    const last = value.data.items.at(-1)
    if (!last || last.label !== value.data.next_cursor.label
      || last.relationship_id !== value.data.next_cursor.relationship_id) {
      context.addIssue({ code: 'custom', path: ['data', 'next_cursor'], message: 'invalid' })
    }
  }
})
const failureEnvelopeSchema = z.object({
  ok: z.literal(false),
  code: z.enum([
    'not_found',
    'not_allowed',
    'feature_unavailable',
    'deletion_pending',
    'conflict',
  ]),
  data: z.object({}).strict(),
}).strict()

export interface HouseholdChoreInviteCandidateOptions {
  cursor?: { label: string; relationshipId: string } | null
  limit?: number
}

/**
 * The only Relationship adapter used by Household Chores. The database RPC
 * resolves eligibility and returns an opaque Relationship id plus a safe
 * display label; this layer never reads Relationship tables or private fields.
 */
export async function loadHouseholdChoreInviteCandidates(
  actorUserId: string,
  circleId: string,
  options: HouseholdChoreInviteCandidateOptions = {},
): Promise<HouseholdChoreInviteCandidatePage> {
  const actor = uuidSchema.safeParse(actorUserId)
  const circle = uuidSchema.safeParse(circleId)
  const parsedOptions = optionsSchema.safeParse(options)
  if (!actor.success || !circle.success || !parsedOptions.success) {
    throw new HouseholdChoreRepositoryError('invalid_input')
  }

  const cursor = parsedOptions.data.cursor ?? null
  let raw: unknown
  try {
    const { data, error } = await getAdmin().rpc(
      'household_chore_get_invite_candidates',
      {
        p_actor_id: actor.data,
        p_circle_id: circle.data,
        p_cursor_label: cursor?.label ?? null,
        p_cursor_relationship_id: cursor?.relationshipId ?? null,
        p_limit: parsedOptions.data.limit ?? 50,
      },
    )
    if (error) {
      console.error('[household-chores] invite candidate request failed')
      throw new HouseholdChoreRepositoryError('save_failed')
    }
    raw = data
  } catch (error) {
    if (error instanceof HouseholdChoreRepositoryError) throw error
    console.error('[household-chores] invite candidate request failed')
    throw new HouseholdChoreRepositoryError('save_failed')
  }

  const success = successEnvelopeSchema.safeParse(raw)
  if (success.success) {
    return {
      items: success.data.data.items.map(item => ({
        relationshipId: item.relationship_id,
        label: item.label,
      })),
      hasMore: success.data.data.has_more,
      nextCursor: success.data.data.next_cursor
        ? {
            label: success.data.data.next_cursor.label,
            relationshipId: success.data.data.next_cursor.relationship_id,
          }
        : null,
    }
  }

  const failure = failureEnvelopeSchema.safeParse(raw)
  if (failure.success) {
    if (failure.data.code === 'feature_unavailable'
      || failure.data.code === 'deletion_pending') {
      throw new HouseholdChoreRepositoryError('feature_disabled')
    }
    throw new HouseholdChoreRepositoryError(failure.data.code)
  }

  console.error('[household-chores] invite candidate response rejected')
  throw new HouseholdChoreRepositoryError('save_failed')
}
