import 'server-only'
import { z } from 'zod'
import { getAdmin } from '@/lib/supabase/admin'
import { splitUser } from './server'
import { splitEditV2Schema } from './contracts-v2'
import { splitViewV2Schema } from './view-v2'

// Prepared server implementation. No route/action calls this module before SQL184
// exact postflight and application cutover; it is not a browser server-action entry.
export async function readSplitV2(id: string) {
  const user = await splitUser()
  if (!user) throw new Error('split_login')
  z.string().uuid().parse(id)
  const { data, error } = await getAdmin().rpc('receipt_split_read_v2', { p_actor_id: user.id, p_split_id: id })
  if (error) throw new Error('split_read_failed')
  const view = splitViewV2Schema.parse(data)
  if (view.id !== id) throw new Error('split_read_failed')
  return view
}
export async function editSplitV2(input: unknown) {
  const user = await splitUser()
  if (!user) throw new Error('split_login')
  const { id, requestId, command, ...payload } = splitEditV2Schema.parse(input)
  const { data, error } = await getAdmin().rpc('receipt_split_command_v2', {
    p_actor_id: user.id, p_split_id: id, p_request_id: requestId, p_command: command, p_payload: payload,
  })
  // No blind retry after uncertain transport failure; caller must keep requestId.
  if (error) throw new Error(/split_conflict|split_upgrade_required/.test(error.message) ? 'split_conflict'
    : /split_return_claims_first/.test(error.message) ? 'split_return_claims_first'
    : /split_quantity_claimed/.test(error.message) ? 'split_quantity_claimed' : 'split_failed')
  const result = z.object({ id: z.string().uuid() }).strict().parse(data)
  if (result.id !== id) throw new Error('split_failed')
  return result
}
