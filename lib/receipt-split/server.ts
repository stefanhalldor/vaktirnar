import 'server-only'
import { redirect } from 'next/navigation'
import { z } from 'zod'
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
  const admin = getAdmin()
  const [{ data, error }, provenance] = await Promise.all([
    admin.rpc('receipt_split_read_v2', { p_actor_id: actor, p_split_id: id }),
    admin.rpc('receipt_split_item_provenance_v1', { p_actor_id: actor, p_split_id: id }),
  ])
  if (error) throw new Error('split_read_failed')
  const view = splitViewV2Schema.parse(data)
  if (provenance.error || !provenance.data) return view
  const detail = z.object({ creators: z.array(z.object({ itemId: z.string().uuid(), memberToken: z.string().uuid().nullable(), displayName: z.string().max(120), sourceKind: z.enum(['legacy','manual','restaurant_menu']) }).strict()), cancelledItemIds: z.array(z.string().uuid()) }).strict().safeParse(provenance.data)
  if (!detail.success) return view
  const cancelled = new Set(detail.data.cancelledItemIds)
  const creators = new Map(detail.data.creators.map(item => [item.itemId, item]))
  return { ...view,
    items: view.items.filter(item => !cancelled.has(item.id)).map(item => ({ ...item,
      createdByMemberToken: creators.get(item.id)?.memberToken ?? null,
      createdByName: creators.get(item.id)?.displayName ?? null,
      sourceKind: creators.get(item.id)?.sourceKind ?? 'legacy',
    })),
    claims: view.claims.filter(claim => !cancelled.has(claim.itemId)),
    dismissedItemIds: view.dismissedItemIds.filter(itemId => !cancelled.has(itemId)),
  }
}
export async function listSplits(actor: string) {
  const { data, error } = await getAdmin().rpc('receipt_split_read_v2', { p_actor_id: actor, p_split_id: null })
  if (error) {
    console.warn('[receipt-split-list] rpc', error.code ?? 'unknown')
    throw new Error('split_list_rpc_failed')
  }
  const parsed = splitListSchema.safeParse(data)
  if (!parsed.success) {
    console.error('[receipt-split-list] contract', parsed.error.issues.map(issue => ({ code: issue.code, path: issue.path })))
    throw new Error('split_list_contract_failed')
  }
  return parsed.data
}
