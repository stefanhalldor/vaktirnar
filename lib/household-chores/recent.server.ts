import 'server-only'

import { getAdmin } from '@/lib/supabase/admin'

const UNAVAILABLE_RPC_CODES = new Set(['PGRST202', '42883'])
const ACTOR_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_SYNC_COUNT = 100

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const expected = new Set(keys)
  return Object.keys(value).length === expected.size
    && Object.keys(value).every((key) => expected.has(key))
}

function rpcIsUnavailable(error: unknown): boolean {
  if (!error || typeof error !== 'object' || Array.isArray(error)) return false
  return UNAVAILABLE_RPC_CODES.has(String((error as Record<string, unknown>).code ?? ''))
}

function isSuccessfulSync(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const result = value as Record<string, unknown>
  if (
    !hasExactKeys(result, ['ok', 'code', 'data'])
    || result.ok !== true
    || result.code !== 'recent_synced'
    || !result.data
    || typeof result.data !== 'object'
    || Array.isArray(result.data)
  ) return false
  const data = result.data as Record<string, unknown>
  if (!hasExactKeys(data, ['inserted', 'updated', 'removed'])) return false
  return ['inserted', 'updated', 'removed'].every((key) => (
    Number.isSafeInteger(data[key])
    && Number(data[key]) >= 0
    && Number(data[key]) <= MAX_SYNC_COUNT
  ))
}

/**
 * Reconciles only the signed-in user's bounded Household Chores notifications.
 * This is intentionally independent from the rollout flag and entitlement so
 * invitation consent and membership-withdrawal notices remain discoverable.
 */
export async function syncHouseholdChoreRecentEvents(actorUserId: string): Promise<boolean> {
  if (!ACTOR_UUID_PATTERN.test(actorUserId)) return false
  try {
    const { data, error } = await getAdmin().rpc('household_chore_sync_recent', {
      p_actor_id: actorUserId,
    })
    if (error) {
      // The database-first rollout may intentionally lag this app source. Keep
      // the source hidden without producing a development error overlay.
      if (!rpcIsUnavailable(error)) {
        console.warn('[recent-events] household chores sync unavailable')
      }
      return false
    }
    if (!isSuccessfulSync(data)) {
      console.warn('[recent-events] household chores sync unavailable')
      return false
    }
    return true
  } catch {
    console.warn('[recent-events] household chores sync unavailable')
    return false
  }
}
