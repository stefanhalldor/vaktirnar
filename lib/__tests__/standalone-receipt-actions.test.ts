import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), user: vi.fn(), read: vi.fn(), storage: vi.fn(), provider: vi.fn(), legacy: vi.fn() }))
vi.mock('@/lib/receipt-split/legacy.server', () => ({ readLegacyReceiptLines: mocks.legacy }))
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/receipt-split/server', () => ({ splitUser: mocks.user, readSplit: mocks.read, SPLIT_PATH: '/auth-mvp/splitta-reikningnum', SPLIT_BUCKET: 'bill-split-receipts' }))
vi.mock('@/lib/supabase/admin', () => ({ getAdmin: () => ({ rpc: mocks.rpc, storage: { from: mocks.storage } }) }))
vi.mock('@/lib/expenses/receipt-split.server', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/expenses/receipt-split.server')>()
  return { ...actual, extractExpenseReceipt: mocks.provider }
})
import { mutateSplit, mutateSplitV2, joinSplit, extractSplitImage, importLegacySplit } from '@/lib/receipt-split/actions'

const actor = '00000000-0000-4000-8000-000000000001'
const id = '00000000-0000-4000-8000-000000000002'
const requestId = '00000000-0000-4000-8000-000000000003'
const extraction = { title: 'Dinner', currency: 'EUR', incurred_on: '2026-09-15', receipt_total_minor: 1600,
  items: [{ kind: 'item', description: 'Espresso', quantity_milli: 4000, total_minor: 1600, confidence_basis_points: 10000, needs_review: false }] }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.user.mockResolvedValue({ id: actor })
  mocks.rpc.mockResolvedValue({ data: { id }, error: null })
  mocks.read.mockResolvedValue({ id, isOwner: true, state: 'review', version: 4 })
})
describe('standalone action boundary', () => {
  it('binds an added shared item to the signed-in actor and the append-only RPC', async () => {
    const value = { command: 'add_item', id, requestId, description: 'Cake', quantity: 1000, amount: 450 }
    expect((await mutateSplit(value)).ok).toBe(true)
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('receipt_split_add_item_v1', {
      p_actor_id: actor, p_request_id: requestId, p_split_id: id,
      p_payload: { description: 'Cake', quantity: 1000, amount: 450 },
    })
    expect((await mutateSplit({ ...value, actorId: id })).ok).toBe(false)
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })
  it('creates JSON without storage, provider, image metadata or an Expense RPC', async () => {
    expect(await mutateSplit({ command: 'create', id, requestId, text: JSON.stringify(extraction) })).toEqual({ ok: true, data: { id } })
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('receipt_split_command_v2', {
      p_actor_id: actor, p_command: 'create', p_request_id: requestId, p_split_id: id,
      p_payload: { contractVersion: 2, quantityScale: 3000, extraction: {
        ...extraction, contract_version: 2, quantity_scale: 3000,
        items: extraction.items.map(({ quantity_milli, ...item }) => ({ ...item, quantity_units: quantity_milli * 3 })),
      } },
    })
    expect(mocks.storage).not.toHaveBeenCalled()
    expect(mocks.provider).not.toHaveBeenCalled()
  })
  it('requires login before all mutations and invite resolution', async () => {
    mocks.user.mockResolvedValue(null)
    expect(await mutateSplit({})).toEqual({ ok: false, error: 'login' })
    expect(await joinSplit({ token: 'a'.repeat(64), requestId })).toEqual({ ok: false, error: 'login' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('preserves zero-price lines in the exact JSON sent to the independent RPC', async () => {
    const zero = { ...extraction, items: [{ ...extraction.items[0], total_minor: 0 }] }
    expect((await mutateSplit({ command: 'create', id, requestId, text: JSON.stringify(zero) })).ok).toBe(true)
    expect(mocks.rpc.mock.calls[0][1].p_payload.extraction.items[0].total_minor).toBe(0)
  })
  it('rejects a negative item, unknown fields and forged identity before RPC', async () => {
    for (const value of [
      { command: 'create', id, requestId, text: JSON.stringify({ ...extraction, items: [{ ...extraction.items[0], total_minor: -1 }] }) },
      { command: 'claim', id, requestId, itemId: id, previous: 0, quantity: 1000, memberToken: actor },
      { command: 'create', id, requestId, text: JSON.stringify({ ...extraction, owner: actor }) },
    ]) expect((await mutateSplit(value)).ok).toBe(false)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('binds claims to the session and preserves compare-and-set quantities', async () => {
    await mutateSplit({ command: 'claim', id, requestId, itemId: id, previous: 1000, quantity: 2000 })
    expect(mocks.rpc.mock.calls[0][1]).toMatchObject({ p_actor_id: actor, p_payload: { itemId: id, previous: 1000, quantity: 2000 } })
  })
  it('returns a safe conflict without raw database details', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'split_conflict private@example.test' } })
    expect(await mutateSplit({ command: 'confirm', id, requestId, version: 3 })).toEqual({ ok: false, error: 'conflict' })
  })
  it('saves review state and confirms against the resulting version in one action', async () => {
    expect(await mutateSplitV2({ command: 'confirm_review', id, requestId, version: 3 })).toEqual({ ok: true, data: { id } })
    expect(mocks.rpc).toHaveBeenCalledTimes(2)
    expect(mocks.rpc.mock.calls[0][1]).toMatchObject({ p_command: 'save_review', p_request_id: requestId, p_payload: { contractVersion: 2, quantityScale: 3000, version: 3 } })
    expect(mocks.read).toHaveBeenCalledWith(actor, id)
    expect(mocks.rpc.mock.calls[1][1]).toMatchObject({ p_command: 'confirm', p_payload: { contractVersion: 2, quantityScale: 3000, version: 4 } })
  })
  it('joins exactly one split using a token and a session actor', async () => {
    await joinSplit({ token: 'a'.repeat(64), requestId })
    expect(mocks.rpc.mock.calls[0][0]).toBe('receipt_split_command_v2')
    expect(mocks.rpc.mock.calls[0][1]).toEqual({ p_actor_id: actor, p_command: 'join', p_request_id: requestId, p_split_id: null,
      p_payload: { contractVersion: 2, quantityScale: 3000, token: 'a'.repeat(64) } })
  })
  it('does not invoke the provider if an extraction lease is refused', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'split_conflict' } })
    expect((await extractSplitImage(id)).ok).toBe(false)
    expect(mocks.provider).not.toHaveBeenCalled()
    expect(mocks.storage).not.toHaveBeenCalled()
  })
  it('does not complete deletion while storage removal has failed', async () => {
    const remove = vi.fn().mockResolvedValue({ error: { message: 'offline' } })
    mocks.storage.mockReturnValue({ remove })
    mocks.rpc.mockResolvedValue({ data: { id, path: actor + '/' + id, mime: 'image/jpeg', size: 100 }, error: null })
    const input = { command: 'delete', id, requestId, version: 3 }
    expect(await mutateSplit(input)).toEqual({ ok: false, error: 'failed' })
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    remove.mockResolvedValue({ error: null })
    expect((await mutateSplit(input)).ok).toBe(true)
    expect(mocks.rpc.mock.calls[1][1].p_request_id).toBe(requestId)
    expect(mocks.rpc.mock.calls[2][1]).toMatchObject({ p_command: 'complete_delete', p_payload: { scope: 'split' } })
  })
  it('copies only an authorized legacy snapshot and rejects stale versions', async () => {
    mocks.legacy.mockResolvedValue({ version: 3, extraction })
    expect((await importLegacySplit({ id, requestId, version: 2 })).ok).toBe(false)
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect((await importLegacySplit({ id, requestId, version: 3 })).ok).toBe(true)
    expect(mocks.legacy).toHaveBeenCalledWith(actor, id)
    expect(mocks.rpc.mock.calls[0][0]).toBe('receipt_split_command_v2')
    expect(mocks.rpc.mock.calls[0][1]).toMatchObject({ p_command: 'create', p_payload: { extraction: {
      contract_version: 2, quantity_scale: 3000, items: [{ quantity_units: 12000 }],
    } } })
    expect(mocks.storage).not.toHaveBeenCalled()
  })
  it('fails closed when the legacy receipt is not an owned private review', async () => {
    mocks.legacy.mockResolvedValue(null)
    expect((await importLegacySplit({ id, requestId, version: 3 })).ok).toBe(false)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
