import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ user: vi.fn(), rpc: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/receipt-split/server', () => ({ splitUser: mocks.user }))
vi.mock('@/lib/supabase/admin', () => ({ getAdmin: () => ({ rpc: mocks.rpc }) }))
import { editSplitV2 } from '@/lib/receipt-split/service-v2.server'
const id = '00000000-0000-4000-8000-000000000001'
const input = { id, requestId: id, command: 'claim', contractVersion: 2, quantityScale: 3000,
  itemId: id, itemRevision: 1, previousUnits: 0, quantityUnits: 1000 }
beforeEach(() => { vi.clearAllMocks(); mocks.user.mockResolvedValue({ id: 'trusted-session' }); mocks.rpc.mockResolvedValue({ data: { id }, error: null }) })
describe('prepared v2 server boundary', () => {
  it('binds actor to authenticated session and sends explicit exact units and revisions', async () => {
    await expect(editSplitV2(input)).resolves.toEqual({ id })
    expect(mocks.rpc).toHaveBeenCalledWith('receipt_split_command_v2', expect.objectContaining({
      p_actor_id: 'trusted-session', p_payload: expect.objectContaining({ quantityUnits: 1000, itemRevision: 1, quantityScale: 3000 }),
    }))
  })
  it('rejects client actor spoofing and unsigned calls without touching RPC', async () => {
    await expect(editSplitV2({ ...input, actorId: 'other' })).rejects.toThrow()
    expect(mocks.rpc).not.toHaveBeenCalled()
    mocks.user.mockResolvedValue(null)
    await expect(editSplitV2(input)).rejects.toThrow('split_login')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('does not retry an uncertain write and returns bounded conflict messages', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'split_conflict' } })
    await expect(editSplitV2(input)).rejects.toThrow('split_conflict')
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })
  it('rejects stale-price requests missing item revision before RPC', async () => {
    await expect(editSplitV2({ ...input, itemRevision: undefined })).rejects.toThrow()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
