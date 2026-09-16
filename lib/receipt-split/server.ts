import 'server-only'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAdmin } from '@/lib/supabase/admin'
import { splitListSchema } from './contracts'
import { splitViewV2Schema } from './view-v2'

export const SPLIT_PATH = '/auth-mvp/splitta-reikningnum'
export const SPLIT_BUCKET = 'bill-split-receipts'
export async function splitUser() {
  if (process.env.AUTH_MVP_ENABLED !== 'true' || process.env.EXPENSE_RECEIPT_AI_ENABLED !== 'true') return null
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  return user?.email && user.email_confirmed_at ? user : null
}
export async function guardSplit(next = SPLIT_PATH) {
  if (process.env.AUTH_MVP_ENABLED !== 'true' || process.env.EXPENSE_RECEIPT_AI_ENABLED !== 'true') redirect('/')
  const user = await splitUser()
  if (!user) redirect('/innskraning?next=' + encodeURIComponent(next))
  return user
}
export async function readSplit(actor: string, id: string) {
  const { data, error } = await getAdmin().rpc('receipt_split_read_v2', { p_actor_id: actor, p_split_id: id })
  if (error) throw new Error('split_read_failed')
  return splitViewV2Schema.parse(data)
}
export async function listSplits(actor: string) {
  const { data, error } = await getAdmin().rpc('receipt_split_read_v1', { p_actor_id: actor, p_split_id: null })
  if (error) throw new Error('split_read_failed')
  return splitListSchema.parse(data)
}
