import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), list: vi.fn(), set: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({})) }))
vi.mock('@/lib/teskeid/admin-auth', () => ({ requireAdmin: mocks.auth }))
vi.mock('@/lib/receipt-split/ai-quota.server', () => ({ listReceiptAiExemptions: mocks.list, setReceiptAiExemption: mocks.set }))

import { GET, POST } from '@/app/api/admin/receipt-ai-quota/route'

const user = { id: '00000000-0000-4000-8000-000000000001', email: 'admin@example.com' }
beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({ user }); mocks.list.mockResolvedValue([]) })

describe('receipt AI quota admin API', () => {
  it('fails closed before reading exemptions for non-admins', async () => {
    mocks.auth.mockResolvedValue({ error: new Response('{}', { status: 403 }) })
    expect((await GET()).status).toBe(403)
    expect(mocks.list).not.toHaveBeenCalled()
  })

  it('returns private no-store data to an admin', async () => {
    const response = await GET()
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })

  it('validates mutations and binds audit identity to the admin session', async () => {
    mocks.set.mockResolvedValue({ userId: user.id, email: 'owner@example.com', enabled: true, note: '', updatedAt: new Date().toISOString() })
    const response = await POST(new Request('http://localhost/api/admin/receipt-ai-quota', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'owner@example.com', enabled: true, note: '' }),
    }))
    expect(response.status).toBe(200)
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ adminUserId: user.id }))
  })
})
