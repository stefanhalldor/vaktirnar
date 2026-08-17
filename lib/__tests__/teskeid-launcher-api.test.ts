import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetUser, mockResolveLauncher, mockResolveVisibility, mockCanAccess, mockRecordOpen, mockLoadInbox } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockResolveLauncher: vi.fn(),
  mockResolveVisibility: vi.fn(),
  mockCanAccess: vi.fn(),
  mockRecordOpen: vi.fn(),
  mockLoadInbox: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mockGetUser } }),
}))
vi.mock('@/lib/teskeid/launcher.server', () => ({
  resolveTeskeidLauncher: mockResolveLauncher,
  resolveTeskeidLauncherVisibility: mockResolveVisibility,
  canAccessTeskeidLauncherFeature: mockCanAccess,
}))
vi.mock('@/lib/teskeid/launcherUsage.server', () => ({
  recordTeskeidLauncherOpen: mockRecordOpen,
}))
vi.mock('@/lib/recent-events/inbox.server', () => ({
  loadRecentEventInbox: mockLoadInbox,
}))

import { GET as getLauncher, POST } from '@/app/api/auth-mvp/launcher/route'
import { GET as getCapabilities } from '@/app/api/auth-mvp/capabilities/route'
import { issueTeskeidLauncherCommitProof } from '@/lib/teskeid/launcherCommitProof.server'

const USER = { id: 'user-a', email: 'a@example.com' }

function post(
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
  userId = USER.id,
) {
  return new Request('https://teskeid.is/api/auth-mvp/launcher', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://teskeid.is', ...headers },
    body: JSON.stringify({ commitProof: issueTeskeidLauncherCommitProof(userId), ...body }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.AUTH_CODE_SECRET = 'launcher-api-test-secret-at-least-32-bytes-long'
  mockGetUser.mockResolvedValue({ data: { user: USER } })
  mockResolveLauncher.mockResolvedValue({
    featureIds: ['bokanir', 'vedrid'], usageAvailable: true, agentCollaborationAvailable: false,
  })
  mockResolveVisibility.mockResolvedValue(['kviss', 'bokanir'])
  mockCanAccess.mockResolvedValue(true)
  mockRecordOpen.mockResolvedValue('recorded')
  mockLoadInbox.mockResolvedValue({ ok: true, sources: [], rows: [], unreadBySource: {} })
})

describe('legacy capabilities projection', () => {
  it('uses the same canonical visibility resolver for compatibility booleans', async () => {
    const response = await getCapabilities()
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toEqual({ kviss: true, advertiser: false, bookings: true })
    expect(mockResolveVisibility).toHaveBeenCalledWith(USER)
  })
})

describe('private launcher projection API', () => {
  it('returns 401 private/no-store without a session and leaks no IDs', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const response = await getLauncher()
    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('vary')).toBe('Cookie')
    expect(await response.json()).toEqual({ error: 'unauthorized' })
    expect(mockResolveLauncher).not.toHaveBeenCalled()
  })

  it('returns only ordered safe IDs and booleans, never user/timestamps/rows', async () => {
    const response = await getLauncher()
    const body = await response.json()
    expect(body).toEqual({
      featureIds: ['bokanir', 'vedrid'], usageAvailable: true, agentCollaborationAvailable: false,
      unreadCounts: {},
    })
    expect(JSON.stringify(body)).not.toMatch(/user-a|example\.com|created_at|metadata/)
  })

  it('returns only positive counts for visible Teskeiðar', async () => {
    mockResolveLauncher.mockResolvedValue({
      featureIds: ['utlagt-og-endurgreitt', 'afmaeli-og-vidburdir'],
      usageAvailable: true,
      agentCollaborationAvailable: false,
    })
    mockLoadInbox.mockResolvedValue({
      ok: true,
      sources: ['loans', 'expenses', 'events'],
      rows: [],
      unreadBySource: { loans: 9, expenses: 3, events: 1 },
    })
    const response = await getLauncher()
    expect(await response.json()).toEqual({
      featureIds: ['utlagt-og-endurgreitt', 'afmaeli-og-vidburdir'],
      usageAvailable: true,
      agentCollaborationAvailable: false,
      unreadCounts: {
        'utlagt-og-endurgreitt': 3,
        'afmaeli-og-vidburdir': 1,
      },
    })
  })

  it('rejects cross-origin, non-JSON, oversized and unknown feature writes', async () => {
    expect((await POST(post({ featureId: 'vedrid' }, { Origin: 'https://evil.invalid' }))).status).toBe(403)
    expect((await POST(new Request('https://teskeid.is/api/auth-mvp/launcher', {
      method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'vedrid',
    }))).status).toBe(415)
    expect((await POST(post({ featureId: 'x'.repeat(300) }))).status).toBe(400)
    expect((await POST(post({ featureId: '/arbitrary' }))).status).toBe(400)
    expect(mockRecordOpen).not.toHaveBeenCalled()
  })

  it('rechecks current feature access and hides revoked features', async () => {
    mockCanAccess.mockResolvedValue(false)
    const response = await POST(post({ featureId: 'vedrid' }))
    expect(response.status).toBe(404)
    expect(mockRecordOpen).not.toHaveBeenCalled()
  })

  it('rejects a queued write bound to the previous account before feature access or storage', async () => {
    const response = await POST(post({ featureId: 'vedrid' }, {}, 'user-from-previous-session'))
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'stale_session' })
    expect(mockCanAccess).not.toHaveBeenCalled()
    expect(mockRecordOpen).not.toHaveBeenCalled()
  })

  it('fails closed when the server cannot issue or verify an account proof', async () => {
    delete process.env.AUTH_CODE_SECRET
    const response = await POST(post({ featureId: 'vedrid', commitProof: 'forged' }))
    expect(response.status).toBe(403)
    expect(mockRecordOpen).not.toHaveBeenCalled()
  })

  it('derives the user server-side and treats SQL71 failure as best-effort', async () => {
    mockRecordOpen.mockResolvedValue('unavailable')
    const response = await POST(post({ featureId: 'vedrid', userId: 'attacker' }))
    expect(response.status).toBe(204)
    expect(mockCanAccess).toHaveBeenCalledWith(USER, 'vedrid')
    expect(mockRecordOpen).toHaveBeenCalledWith(USER.id, 'vedrid')
  })
})
