import 'server-only'

import { z } from 'zod'
import { getAdmin } from '@/lib/supabase/admin'

const reservationSchema = z.object({
  allowed: z.boolean(),
  reason: z.enum(['reserved', 'replay', 'daily', 'capacity', 'burst']),
  exempt: z.boolean(),
  reservationId: z.string().uuid().nullable(),
}).strict()

const exemptionSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
  enabled: z.boolean(),
  note: z.string().max(240),
  updatedAt: z.string(),
}).strict()

function boundedEnv(name: string, fallback: number, maximum: number) {
  const value = Number(process.env[name])
  return Number.isSafeInteger(value) && value >= 1 ? Math.min(value, maximum) : fallback
}

export function receiptAiQuotaLimits() {
  return {
    perUserDaily: 1,
    globalDaily: boundedEnv('EXPENSE_RECEIPT_AI_GLOBAL_DAILY_LIMIT', 100, 10_000),
    exemptPerMinute: boundedEnv('EXPENSE_RECEIPT_AI_EXEMPT_MINUTE_LIMIT', 5, 20),
  }
}

export async function readReceiptAiAvailability(userId: string) {
  const limits = receiptAiQuotaLimits()
  const { data, error } = await getAdmin().rpc('receipt_split_ai_availability_v1', {
    p_actor_id: userId,
    p_user_daily_limit: limits.perUserDaily,
    p_global_daily_limit: limits.globalDaily,
    p_exempt_minute_limit: limits.exemptPerMinute,
  })
  if (error) throw new Error('receipt_ai_quota_unavailable')
  return z.enum(['available', 'daily', 'capacity', 'burst']).parse(data)
}

export async function reserveReceiptAiQuota(userId: string, splitId: string) {
  const limits = receiptAiQuotaLimits()
  const { data, error } = await getAdmin().rpc('receipt_split_reserve_ai_v1', {
    p_actor_id: userId,
    p_split_id: splitId,
    p_reykjavik_date: new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Atlantic/Reykjavik', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date()),
    p_user_daily_limit: limits.perUserDaily,
    p_global_daily_limit: limits.globalDaily,
    p_exempt_minute_limit: limits.exemptPerMinute,
  })
  if (error) throw new Error('receipt_ai_quota_unavailable')
  return reservationSchema.parse(data)
}

export async function finishReceiptAiQuota(userId: string, reservationId: string) {
  const { error } = await getAdmin().rpc('receipt_split_finish_ai_v1', {
    p_actor_id: userId, p_reservation_id: reservationId,
  })
  if (error) throw new Error('receipt_ai_quota_finish_failed')
}

export async function listReceiptAiExemptions() {
  const { data, error } = await getAdmin().rpc('receipt_split_admin_list_ai_exemptions_v1')
  if (error) throw new Error('receipt_ai_exemptions_unavailable')
  return z.array(exemptionSchema).parse(data)
}

export async function setReceiptAiExemption(input: {
  adminUserId: string
  email: string
  enabled: boolean
  note: string
}) {
  const { data, error } = await getAdmin().rpc('receipt_split_admin_set_ai_exemption_v1', {
    p_admin_actor_id: input.adminUserId,
    p_email: input.email.trim().toLowerCase(),
    p_enabled: input.enabled,
    p_note: input.note.trim(),
  })
  if (error) {
    if (/user_not_found/.test(error.message)) throw new Error('receipt_ai_user_not_found')
    throw new Error('receipt_ai_exemption_failed')
  }
  return exemptionSchema.parse(data)
}
