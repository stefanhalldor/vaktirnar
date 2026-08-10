import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  requireCreator: vi.fn(),
  loadProjection: vi.fn(),
}))

vi.mock('@/lib/kviss/access.server', () => ({
  requireKvissCreatorApi: mocks.requireCreator,
}))
vi.mock('@/lib/kviss/repository.server', () => ({
  loadKvissHostProjection: mocks.loadProjection,
}))

import { GET } from '@/app/api/auth-mvp/kviss/live/route'

const sessionId = '00000000-0000-4000-8000-000000000011'
const user = { id: '00000000-0000-4000-8000-000000000012', email: 'owner@example.com' }
const spaceId = '00000000-0000-4000-8000-000000000013'
const projection = {
  session: {
    id: sessionId,
    joinCode: 'ABC234',
    title: 'Prufukviss',
    status: 'lobby',
    revision: 1,
    activeQuestionId: null,
    questionStartedAt: null,
    teamNames: [],
    createdAt: '2026-08-10T10:00:00.000Z',
    endedAt: null,
  },
  questions: [],
  activatedQuestionIds: [],
  activeAnswerCount: 0,
  participants: [],
  leaderboard: [],
  realtimeTopic: null,
}

function request(query: string) {
  return new NextRequest(`http://localhost/api/auth-mvp/kviss/live${query}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireCreator.mockResolvedValue({ ok: true, user, spaceId })
  mocks.loadProjection.mockResolvedValue(projection)
})

describe('GET /api/auth-mvp/kviss/live', () => {
  it.each([
    [{ ok: false, status: 401 }, 401],
    [{ ok: false, status: 404 }, 404],
  ] as const)('requires authenticated feature access', async (access, status) => {
    mocks.requireCreator.mockResolvedValue(access)

    const response = await GET(request(`?sessionId=${sessionId}`))

    expect(response.status).toBe(status)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.loadProjection).not.toHaveBeenCalled()
  })

  it.each([
    '',
    '?sessionId=not-a-uuid',
    `?sessionId=${sessionId}&extra=value`,
    `?sessionId=${sessionId}&sessionId=${sessionId}`,
  ])('rejects any query other than one exact UUID sessionId: %s', async query => {
    const response = await GET(request(query))

    expect(response.status).toBe(400)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.loadProjection).not.toHaveBeenCalled()
  })

  it('binds the projection to the authenticated actor and personal space', async () => {
    const response = await GET(request(`?sessionId=${sessionId}`))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.loadProjection).toHaveBeenCalledOnce()
    expect(mocks.loadProjection).toHaveBeenCalledWith(user.id, spaceId, sessionId)
    await expect(response.json()).resolves.toEqual(projection)
  })

  it('does not distinguish a missing or cross-owner session', async () => {
    mocks.loadProjection.mockResolvedValue(null)

    const response = await GET(request(`?sessionId=${sessionId}`))

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'not_found' })
  })

  it('fails closed when the repository cannot build an authoritative projection', async () => {
    mocks.loadProjection.mockRejectedValue(new Error('database unavailable'))

    const response = await GET(request(`?sessionId=${sessionId}`))

    expect(response.status).toBe(503)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toEqual({ error: 'unavailable' })
  })
})
