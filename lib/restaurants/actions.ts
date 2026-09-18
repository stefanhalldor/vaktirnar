'use server'

import { revalidatePath } from 'next/cache'
import { getAdmin } from '@/lib/supabase/admin'
import { menuSubmitSchema, preorderSchema, tableBindSchema } from './contracts'
import { requireRestaurantGuest } from './server'

type Result = { ok: true; splitVersion?: number } | { ok: false; error: 'login' | 'denied' | 'conflict' | 'invalid' | 'failed' }
function failed(error: unknown): Result {
  const message = error instanceof Error ? error.message : ''
  if (message === 'restaurant_login') return { ok: false, error: 'login' }
  if (/not_found|not_allowed/.test(message)) return { ok: false, error: 'denied' }
  if (/conflict|claimed|return_claims/.test(message)) return { ok: false, error: 'conflict' }
  if (/invalid/.test(message)) return { ok: false, error: 'invalid' }
  return { ok: false, error: 'failed' }
}

export async function submitRestaurantMenuItem(input: unknown): Promise<Result> {
  try {
    const user = await requireRestaurantGuest()
    const value = menuSubmitSchema.parse(input)
    const { data, error } = await getAdmin().rpc('restaurant_submit_menu_item_v1', {
      p_actor_id: user.id, p_request_id: value.requestId,
      p_table_session_id: value.tableSessionId, p_split_id: value.splitId,
      p_expected_split_version: value.expectedSplitVersion, p_menu_item_id: value.menuItemId,
      p_quantity: value.quantity, p_modifiers: value.modifiers, p_service_note: value.serviceNote,
    })
    if (error) throw new Error(error.message)
    const result = data as { splitVersion?: number }
    revalidatePath('/auth-mvp/splitta-reikningnum/' + value.splitId)
    return { ok: true, splitVersion: result.splitVersion }
  } catch (error) { return failed(error) }
}

export async function bindRestaurantTable(input: unknown): Promise<Result> {
  try {
    const user = await requireRestaurantGuest()
    const value = tableBindSchema.parse(input)
    const { error } = await getAdmin().rpc('restaurant_bind_split_to_table_v1', {
      p_actor_id: user.id, p_request_id: value.requestId,
      p_table_session_id: value.tableSessionId, p_split_id: value.splitId,
      p_expected_session_revision: value.expectedSessionRevision,
    })
    if (error) throw new Error(error.message)
    return { ok: true }
  } catch (error) { return failed(error) }
}

export async function createRestaurantPreorder(input: unknown): Promise<Result> {
  try {
    const user = await requireRestaurantGuest()
    const value = preorderSchema.parse(input)
    const { error } = await getAdmin().rpc('restaurant_create_preorder_v1', {
      p_actor_id: user.id, p_request_id: value.requestId, p_venue_id: value.venueId,
      p_split_id: value.splitId, p_arrival_at: value.arrivalAt, p_party_size: value.partySize,
    })
    if (error) throw new Error(error.message)
    return { ok: true }
  } catch (error) { return failed(error) }
}
