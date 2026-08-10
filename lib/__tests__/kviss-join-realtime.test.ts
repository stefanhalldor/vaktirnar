import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  join: vi.fn(),
  getTopic: vi.fn(),
  notify: vi.fn(),
  setCookie: vi.fn(),
}))

vi.mock('@/lib/kviss/repository.server', () => ({
  joinKviss: mocks.join,
  getSessionTopicAfterJoin: mocks.getTopic,
}))
vi.mock('@/lib/kviss/realtime.server', () => ({
  notifyKvissInvalidation: mocks.notify,
}))
vi.mock('@/lib/kviss/security.server', () => ({
  assertSameOriginMutation: () => true,
  createParticipantCapability: () => ({ token: 'participant-token', digest: 'digest' }),
  scopedJoinAttemptHash: () => 'scope-hash',
  setCapabilityCookie: mocks.setCookie,
}))

import { POST } from '@/app/api/kviss/public/join/route'

const sessionId = '00000000-0000-4000-8000-000000000031'
const topic = 'b'.repeat(43)

function request() {
  return new NextRequest('http://localhost/api/kviss/public/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'ABC234', nickname: 'Anna' }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.KVISS_ENABLED = 'true'
  mocks.join.mockResolvedValue({
    participantId: 'participant-1',
    sessionId,
    joinCode: 'ABC234',
  })
  mocks.getTopic.mockResolvedValue(topic)
  mocks.notify.mockResolvedValue(undefined)
})

describe('Kviss join realtime invalidation', () => {
  it('notifies the opaque session topic after a successful join without exposing it', async () => {
    const response = await POST(request())

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.getTopic).toHaveBeenCalledWith(sessionId)
    expect(mocks.notify).toHaveBeenCalledWith(topic)
    expect(mocks.setCookie).toHaveBeenCalledOnce()
    await expect(response.json()).resolves.toEqual({ joinCode: 'ABC234' })
  })

  it('does not look up or broadcast a topic when joining fails', async () => {
    mocks.join.mockRejectedValue(new Error('kviss_join_failed'))

    const response = await POST(request())

    expect(response.status).toBe(400)
    expect(mocks.getTopic).not.toHaveBeenCalled()
    expect(mocks.notify).not.toHaveBeenCalled()
  })
})
