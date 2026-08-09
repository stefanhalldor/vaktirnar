import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  resolveShell: vi.fn(),
  listCommunity: vi.fn(),
  listFeedback: vi.fn(),
  createNote: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}))
vi.mock('@/lib/weather/weatherBaseAccess.server', () => ({
  getWeatherEnabledMode: vi.fn(() => 'all'),
  resolveAuthenticatedWeatherShellAccess: mocks.resolveShell,
}))
vi.mock('@/lib/map-notes/repository.server', () => ({
  listCommunityMapNotes: mocks.listCommunity,
  listOwnTeskeidFeedback: mocks.listFeedback,
  createMapNote: mocks.createNote,
}))

import { GET, POST } from '@/app/api/auth-mvp/map-notes/route'

const user = { id: 'user-1', email: 'user@example.com' }
const validPayload = {
  kind: 'community',
  body: 'Grófur kafli',
  anchor: { lat: 64.1, lon: -21.9 },
  sourceContext: 'map',
  routeContext: null,
  clientMessageId: '00000000-0000-4000-8000-000000000001',
  idempotencyKey: '00000000-0000-4000-8000-000000000002',
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.AUTH_MVP_ENABLED = 'true'
  process.env.TESKEID_CHAT_ENABLED = 'true'
  mocks.getUser.mockResolvedValue({ data: { user } })
  mocks.resolveShell.mockResolvedValue({ mode: 'authenticated-public', userId: user.id })
  mocks.listCommunity.mockResolvedValue([])
  mocks.listFeedback.mockResolvedValue([])
  mocks.createNote.mockResolvedValue({ id: 'note-1' })
})

describe('map notes API', () => {
  it('returns only the fixed community repository projection', async () => {
    const response = await GET(new NextRequest('http://localhost/api/auth-mvp/map-notes?kind=community&q=gróft&hours=24'))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, max-age=15, stale-while-revalidate=45')
    expect(mocks.listCommunity).toHaveBeenCalledWith({ search: 'gróft', sinceHours: 24 })
    expect(mocks.listFeedback).not.toHaveBeenCalled()
  })

  it('supports the default unbounded community history', async () => {
    const response = await GET(new NextRequest('http://localhost/api/auth-mvp/map-notes?kind=community&hours=all'))
    expect(response.status).toBe(200)
    expect(mocks.listCommunity).toHaveBeenCalledWith({ search: '', sinceHours: null })
  })

  it('requires the signed-in owner for private feedback reads', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null } })
    const response = await GET(new NextRequest('http://localhost/api/auth-mvp/map-notes?kind=teskeid_feedback'))
    expect(response.status).toBe(401)
    expect(mocks.listFeedback).not.toHaveBeenCalled()
  })

  it('rejects cross-origin mutations before repository access', async () => {
    const response = await POST(new NextRequest('http://localhost/api/auth-mvp/map-notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
      body: JSON.stringify(validPayload),
    }))
    expect(response.status).toBe(403)
    expect(mocks.createNote).not.toHaveBeenCalled()
  })

  it('derives the author from auth and forwards idempotent validated content', async () => {
    const response = await POST(new NextRequest('http://localhost/api/auth-mvp/map-notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
      body: JSON.stringify(validPayload),
    }))
    expect(response.status).toBe(201)
    expect(mocks.createNote).toHaveBeenCalledWith(user.id, expect.objectContaining({
      kind: 'community', body: 'Grófur kafli', anchor: { lat: 64.1, lon: -21.9 },
    }))
  })
})
