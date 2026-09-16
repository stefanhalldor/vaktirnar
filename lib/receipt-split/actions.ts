'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getAdmin } from '@/lib/supabase/admin'
import { extractExpenseReceipt, parseExpenseReceiptExtractionText, verifyExpenseReceiptImage } from '@/lib/expenses/receipt-split.server'
import { mutationSchema, type SplitResult } from './contracts'
import { parseSplitExtractionV2, parseSplitExtractionV2Text, splitEditV2Schema } from './contracts-v2'
import { SPLIT_BUCKET, SPLIT_PATH, readSplit, splitUser } from './server'
import { readLegacyReceiptLines } from './legacy.server'

const commandResult = z.object({
  id: z.string().uuid(), path: z.string().nullable().optional(),
  mime: z.enum(['image/jpeg', 'image/png', 'image/webp']).nullable().optional(),
  size: z.number().int().positive().max(10485760).nullable().optional(),
}).strict()
async function command(actor: string, operation: string, request: string, id: string | null, payload: object) {
  const { data, error } = await getAdmin().rpc(operation === 'add_item' ? 'receipt_split_add_item_v1' : 'receipt_split_command_v1', {
    p_actor_id: actor, ...(operation === 'add_item' ? {} : { p_command: operation }), p_request_id: request, p_split_id: id, p_payload: payload,
  })
  if (error) throw new Error(error.message)
  const result = commandResult.parse(data)
  if (id && result.id !== id) throw new Error('split_result_invalid')
  return result
}
async function commandV2(actor: string, operation: string, request: string, id: string | null, payload: object) {
  const { data, error } = await getAdmin().rpc('receipt_split_command_v2', {
    p_actor_id: actor, p_command: operation, p_request_id: request, p_split_id: id,
    p_payload: { contractVersion: 2, quantityScale: 3000, ...payload },
  })
  if (error) throw new Error(error.message)
  const result = commandResult.parse(data)
  if (id && result.id !== id) throw new Error('split_result_invalid')
  return result
}
function failure(error: unknown): SplitResult<never> {
  if (error instanceof z.ZodError || error instanceof SyntaxError) return { ok: false, error: 'invalid' }
  if (error instanceof Error && /split_invalid|expense_receipt_manual_extraction_invalid/.test(error.message)) return { ok: false, error: 'invalid' }
  if (error instanceof Error && /split_conflict|split_total_mismatch|split_upgrade_required|split_quantity_claimed|split_return_claims_first/.test(error.message)) return { ok: false, error: 'conflict' }
  return { ok: false, error: 'failed' }
}
const lifecycleV2Schema = z.discriminatedUnion('command', [
  z.object({ command: z.literal('confirm_review'), id: z.string().uuid(), requestId: z.string().uuid(), version: z.number().int().positive() }).strict(),
  z.object({ command: z.literal('rotate_invite'), id: z.string().uuid(), requestId: z.string().uuid() }).strict(),
  z.object({ command: z.literal('delete'), id: z.string().uuid(), requestId: z.string().uuid(), version: z.number().int().positive() }).strict(),
  z.object({ command: z.literal('delete_image'), id: z.string().uuid(), requestId: z.string().uuid(), version: z.number().int().positive() }).strict(),
])
export async function mutateSplitV2(input: unknown): Promise<SplitResult<{ id: string }>> {
  try {
    const user = await splitUser()
    if (!user) return { ok: false, error: 'login' }
    const parsedEdit = splitEditV2Schema.safeParse(input)
    const value = parsedEdit.success ? parsedEdit.data : lifecycleV2Schema.parse(input)
    if (value.command === 'confirm_review') {
      const { id, requestId, version } = value
      await commandV2(user.id, 'save_review', requestId, id, { version })
      const current = await readSplit(user.id, id)
      if (!current.isOwner) throw new Error('split_not_allowed')
      if (current.state !== 'sharing') await commandV2(user.id, 'confirm', randomUUID(), id, { version: current.version })
      refresh(id)
      return { ok: true, data: { id } }
    }
    const { command: operation, id, requestId, ...payload } = value
    const result = await commandV2(user.id, operation, requestId, id, payload)
    if (operation === 'delete' || operation === 'delete_image') {
      if (result.path) {
        const removed = await getAdmin().storage.from(SPLIT_BUCKET).remove([result.path])
        if (removed.error) return { ok: false, error: 'failed' }
      }
      await commandV2(user.id, 'complete_delete', randomUUID(), id, { scope: operation === 'delete' ? 'split' : 'image' })
    }
    refresh(result.id)
    return { ok: true, data: { id: result.id } }
  } catch (error) { return failure(error) }
}
function refresh(id: string) {
  revalidatePath(SPLIT_PATH)
  revalidatePath(SPLIT_PATH + '/' + id)
}
export async function mutateSplit(input: unknown): Promise<SplitResult<{ id: string }>> {
  try {
    const user = await splitUser()
    if (!user) return { ok: false, error: 'login' }
    const value = mutationSchema.parse(input)
    let payload: object = {}
    if ('text' in value) payload = { extraction: value.command === 'create' || value.command === 'apply_extraction'
      ? parseSplitExtractionV2Text(value.text) : parseExpenseReceiptExtractionText(value.text),
      ...('version' in value ? { version: value.version } : {}) }
    else if (value.command === 'add_item') payload = { description: value.description, quantity: value.quantity, amount: value.amount }
    else if (value.command === 'claim') payload = { itemId: value.itemId, previous: value.previous, quantity: value.quantity }
    else if ('version' in value) payload = { version: value.version }
    const result = value.command === 'create' || value.command === 'apply_extraction'
      ? await commandV2(user.id, value.command, value.requestId, value.id, payload)
      : await command(user.id, value.command, value.requestId, value.id, payload)
    // Tombstone access before removing a blob. Replaying the same request returns
    // the same authorized path, so a failed storage removal can be retried safely.
    if ((value.command === 'delete' || value.command === 'delete_image') && result.path) {
      const removed = await getAdmin().storage.from(SPLIT_BUCKET).remove([result.path])
      if (removed.error) return { ok: false, error: 'failed' }
    }
    if (value.command === 'delete' || value.command === 'delete_image') {
      await command(user.id, 'complete_delete', randomUUID(), value.id, { scope: value.command === 'delete' ? 'split' : 'image' })
    }
    refresh(result.id)
    return { ok: true, data: { id: result.id } }
  } catch (error) { return failure(error) }
}
export async function joinSplit(input: unknown): Promise<SplitResult<{ id: string }>> {
  try {
    const user = await splitUser()
    if (!user) return { ok: false, error: 'login' }
    const value = z.object({ token: z.string().regex(/^[0-9a-f]{64}$/), requestId: z.string().uuid() }).strict().parse(input)
    const result = await commandV2(user.id, 'join', value.requestId, null, { token: value.token })
    refresh(result.id)
    return { ok: true, data: { id: result.id } }
  } catch (error) { return failure(error) }
}
export async function importLegacySplit(input: unknown): Promise<SplitResult<{ id: string }>> {
  try {
    const user = await splitUser()
    if (!user) return { ok: false, error: 'login' }
    const value = z.object({ id: z.string().uuid(), requestId: z.string().uuid(), version: z.number().int().positive() }).strict().parse(input)
    const source = await readLegacyReceiptLines(user.id, value.id)
    if (!source || source.version !== value.version) return { ok: false, error: 'conflict' }
    const result = await commandV2(user.id, 'create', value.requestId, value.id, { extraction: parseSplitExtractionV2(source.extraction) })
    refresh(result.id)
    return { ok: true, data: { id: result.id } }
  } catch (error) { return failure(error) }
}
export async function prepareSplitImage(input: unknown): Promise<SplitResult<{ id: string; path: string; token: string }>> {
  try {
    const user = await splitUser()
    if (!user) return { ok: false, error: 'login' }
    const value = z.object({ id: z.string().uuid(), requestId: z.string().uuid(),
      mime: z.enum(['image/jpeg', 'image/png', 'image/webp']), size: z.number().int().min(1).max(10485760) }).strict().parse(input)
    const result = await commandV2(user.id, 'prepare_image', value.requestId, value.id, { mime: value.mime, size: value.size })
    if (!result.path) throw new Error('split_invalid_result')
    const signed = await getAdmin().storage.from(SPLIT_BUCKET).createSignedUploadUrl(result.path)
    if (signed.error || !signed.data?.token) throw new Error('split_sign_failed')
    refresh(result.id)
    return { ok: true, data: { id: result.id, path: result.path, token: signed.data.token } }
  } catch (error) { return failure(error) }
}
export async function extractSplitImage(id: string): Promise<SplitResult<{ id: string }>> {
  try {
    const user = await splitUser()
    if (!user) return { ok: false, error: 'login' }
    z.string().uuid().parse(id)
    // A fresh lease request deliberately cannot replay a provider call: the
    // database transitions uploading -> extracting exactly once.
    const target = await commandV2(user.id, 'begin_extraction', randomUUID(), id, {})
    if (!target.path || !target.mime || !target.size) throw new Error('split_image_missing')
    const blob = await getAdmin().storage.from(SPLIT_BUCKET).download(target.path)
    if (blob.error || !blob.data) throw new Error('split_image_missing')
    const bytes = new Uint8Array(await blob.data.arrayBuffer())
    verifyExpenseReceiptImage(bytes, target.mime, target.size)
    const extraction = await extractExpenseReceipt(bytes, target.mime)
    const result = await commandV2(user.id, 'apply_extraction', randomUUID(), id, { extraction: parseSplitExtractionV2(extraction) })
    refresh(id)
    return { ok: true, data: { id: result.id } }
  } catch (error) { return failure(error) }
}
export async function openSplitImage(id: string): Promise<SplitResult<{ url: string }>> {
  try {
    const user = await splitUser()
    if (!user) return { ok: false, error: 'login' }
    z.string().uuid().parse(id)
    const target = await commandV2(user.id, 'image_target', randomUUID(), id, {})
    if (!target.path) throw new Error('split_image_missing')
    const signed = await getAdmin().storage.from(SPLIT_BUCKET).createSignedUrl(target.path, 60)
    if (signed.error || !signed.data?.signedUrl) throw new Error('split_image_missing')
    return { ok: true, data: { url: signed.data.signedUrl } }
  } catch (error) { return failure(error) }
}
