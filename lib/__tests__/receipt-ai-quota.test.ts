import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ getAdmin: () => ({ rpc }) }))

import { listReceiptAiExemptions, receiptAiQuotaLimits, reserveReceiptAiQuota, setReceiptAiExemption } from '@/lib/receipt-split/ai-quota.server'

const userId = '00000000-0000-4000-8000-000000000001'
const splitId = '00000000-0000-4000-8000-000000000002'

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.EXPENSE_RECEIPT_AI_GLOBAL_DAILY_LIMIT
  delete process.env.EXPENSE_RECEIPT_AI_EXEMPT_MINUTE_LIMIT
})

describe('receipt AI quota boundary', () => {
  it('uses bounded cost controls', () => {
    expect(receiptAiQuotaLimits()).toEqual({ perUserDaily: 1, globalDaily: 100, exemptPerMinute: 5 })
    process.env.EXPENSE_RECEIPT_AI_GLOBAL_DAILY_LIMIT = '999999'
    process.env.EXPENSE_RECEIPT_AI_EXEMPT_MINUTE_LIMIT = '50'
    expect(receiptAiQuotaLimits()).toEqual({ perUserDaily: 1, globalDaily: 10000, exemptPerMinute: 20 })
  })

  it('reserves atomically through the private service-role RPC', async () => {
    rpc.mockResolvedValue({ data: { allowed: true, reason: 'reserved', exempt: false, reservationId: splitId }, error: null })
    await expect(reserveReceiptAiQuota(userId, splitId)).resolves.toMatchObject({ allowed: true })
    expect(rpc).toHaveBeenCalledWith('receipt_split_reserve_ai_v1', expect.objectContaining({
      p_actor_id: userId, p_split_id: splitId, p_user_daily_limit: 1,
      p_global_daily_limit: 100, p_exempt_minute_limit: 5,
    }))
    expect(rpc.mock.calls[0][1].p_reykjavik_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('does not leak database detail when quota storage is unavailable', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'private schema detail' } })
    await expect(reserveReceiptAiQuota(userId, splitId)).rejects.toThrow('receipt_ai_quota_unavailable')
  })

  it('normalizes admin email and parses only bounded exemption fields', async () => {
    const row = { userId, email: 'owner@example.com', enabled: true, note: 'Owner', updatedAt: '2026-09-16T12:00:00Z' }
    rpc.mockResolvedValue({ data: row, error: null })
    await expect(setReceiptAiExemption({ adminUserId: userId, email: ' OWNER@EXAMPLE.COM ', enabled: true, note: ' Owner ' })).resolves.toEqual(row)
    expect(rpc).toHaveBeenCalledWith('receipt_split_admin_set_ai_exemption_v1', expect.objectContaining({ p_email: 'owner@example.com', p_note: 'Owner' }))
  })

  it('lists exemptions without accepting arbitrary database shapes', async () => {
    rpc.mockResolvedValue({ data: [{ userId, email: 'owner@example.com', enabled: true, note: '', updatedAt: '2026-09-16T12:00:00Z' }], error: null })
    await expect(listReceiptAiExemptions()).resolves.toHaveLength(1)
  })
})
