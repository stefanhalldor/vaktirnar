import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  listFeedback: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({})),
}))
vi.mock('@/lib/teskeid/admin-auth', () => ({
  requireAdmin: mocks.requireAdmin,
}))
vi.mock('@/lib/map-notes/repository.server', () => ({
  listTeskeidFeedbackForAdmin: mocks.listFeedback,
}))

import { GET } from '@/app/api/admin/map-notes/route'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireAdmin.mockResolvedValue({ user: { id: 'admin-1', email: 'admin@example.com' } })
  mocks.listFeedback.mockResolvedValue([{ id: 'feedback-1', body: 'Leiðin mætti vera betri' }])
})

describe('admin map notes API', () => {
  it('fails closed before reading private feedback for a non-admin', async () => {
    mocks.requireAdmin.mockResolvedValueOnce({
      error: new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }),
    })
    const response = await GET()
    expect(response.status).toBe(403)
    expect(mocks.listFeedback).not.toHaveBeenCalled()
  })

  it('returns the server-only private feedback projection to an admin', async () => {
    const response = await GET()
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await response.json()).toEqual({
      items: [{ id: 'feedback-1', body: 'Leiðin mætti vera betri' }],
    })
  })
})
