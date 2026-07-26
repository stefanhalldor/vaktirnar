import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetUser } = vi.hoisted(() => ({ mockGetUser: vi.fn() }))
const { mockCheckFeatureAccess } = vi.hoisted(() => ({ mockCheckFeatureAccess: vi.fn() }))
const { mockGetCandidates } = vi.hoisted(() => ({ mockGetCandidates: vi.fn() }))
const { mockGuestRateLimit } = vi.hoisted(() => ({ mockGuestRateLimit: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}))

vi.mock('@/lib/loans/guard', () => ({
  checkFeatureAccess: mockCheckFeatureAccess,
}))

vi.mock('@/lib/weather/ip-rate-limit.server', () => ({
  checkWeatherGuestRateLimit: mockGuestRateLimit,
}))

vi.mock('@/lib/iceland-routes/roadGraphCandidate.server', () => ({
  isTeskeidRouteCandidateEnabled: vi.fn(() => (
    process.env.TESKEID_ROUTE_CANDIDATE_ENABLED === 'true'
  )),
  getTeskeidRouteCandidatesOutcome: mockGetCandidates,
}))

import { POST } from '@/app/api/teskeid/weather/travel/route-candidate/route'

const ORIGIN = { lat: 64.1466, lon: -21.9426 }
const DESTINATION = { lat: 66.0748, lon: -23.134 }

function request(body: unknown = { origin: ORIGIN, destination: DESTINATION }) {
  return new Request('http://localhost/api/teskeid/weather/travel/route-candidate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.AUTH_MVP_ENABLED = 'true'
  process.env.WEATHER_ENABLED = 'Authenticated'
  process.env.TESKEID_ROUTE_CANDIDATE_ENABLED = 'true'
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'u1', email: 'user@example.com' } },
  })
  mockCheckFeatureAccess.mockImplementation(async (_uid: string, _email: string, key: string) => (
    key === 'vedrid' || key === 'teskeid-routing-v1'
  ))
  mockGetCandidates.mockResolvedValue({ status: 'ready', routes: [{ id: 'teskeid-road-graph-v1' }] })
  mockGuestRateLimit.mockResolvedValue(true)
})

describe('POST /api/teskeid/weather/travel/route-candidate — strict per-user gate', () => {
  it('returns the candidate for an explicitly allowed user', async () => {
    const res = await POST(request())
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      status: 'ready',
      route: { id: 'teskeid-road-graph-v1' },
    })
    expect(mockGetCandidates).toHaveBeenCalledOnce()
  })

  it('returns disabled and skips graph work when the user lacks routing access', async () => {
    mockCheckFeatureAccess.mockImplementation(async (_uid: string, _email: string, key: string) => (
      key === 'vedrid'
    ))

    const res = await POST(request())
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toMatchObject({ status: 'disabled', route: null })
    expect(mockGetCandidates).not.toHaveBeenCalled()
  })

  it('does not expose candidates to signed-out public weather users', async () => {
    process.env.WEATHER_ENABLED = 'All'
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const res = await POST(request())
    expect(res.status).toBe(404)
    expect(mockGetCandidates).not.toHaveBeenCalled()
    expect(mockGuestRateLimit).not.toHaveBeenCalled()
  })

  it('fails closed before auth work when the global switch is off', async () => {
    delete process.env.TESKEID_ROUTE_CANDIDATE_ENABLED

    const res = await POST(request())
    expect(res.status).toBe(404)
    expect(mockGetUser).not.toHaveBeenCalled()
    expect(mockGetCandidates).not.toHaveBeenCalled()
  })
})
