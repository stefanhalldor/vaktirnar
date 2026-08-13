import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  adminRpc: vi.fn(),
  getUser: vi.fn(),
  userRpc: vi.fn(),
  featureAccess: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  getAdmin: vi.fn(() => ({ rpc: mocks.adminRpc })),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    rpc: mocks.userRpc,
  })),
}))

vi.mock('@/lib/loans/guard', () => ({
  checkFeatureAccess: mocks.featureAccess,
}))

vi.mock('@/lib/auth/guard', () => ({
  guardTeskeidSession: vi.fn(),
}))

import { authorizeBookingAccess, requireBookingProviderApi } from '../access.server'

const PUBLIC_ID = '00000000-0000-4000-8000-000000000003'

function projection(actorKind: 'guest' | 'member' | 'provider' = 'guest') {
  return {
    access: { actorKind, memberRole: actorKind === 'member' ? 'owner' : null },
    permissions: {
      canCancel: true,
      canClaim: actorKind === 'guest',
      canManageMembers: actorKind === 'member',
      canSendMessage: true,
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.BOOKINGS_ENABLED = 'true'
  mocks.adminRpc.mockResolvedValue({ data: projection(), error: null })
  mocks.getUser.mockResolvedValue({ data: { user: null } })
  mocks.featureAccess.mockResolvedValue(true)
  mocks.userRpc.mockResolvedValue({ data: 'space-1', error: null })
})

describe('central booking authorization', () => {
  it('fails closed at the global flag before any auth or database work', async () => {
    process.env.BOOKINGS_ENABLED = 'false'
    expect(await authorizeBookingAccess({ publicId: PUBLIC_ID })).toBeNull()
    expect(mocks.getUser).not.toHaveBeenCalled()
    expect(mocks.adminRpc).not.toHaveBeenCalled()
  })

  it('never treats an unconfirmed session email as member identity', async () => {
    const user = {
      id: 'user-1', email: 'user@example.com', email_confirmed_at: null,
    } as never
    const access = await authorizeBookingAccess({
      publicId: PUBLIC_ID,
      user,
      sessionHash: 'a'.repeat(64),
    })
    expect(access).toMatchObject({ actorUserId: null, canonicalEmail: null, signedIn: false })
    expect(mocks.adminRpc).toHaveBeenCalledWith('booking_read_request', {
      p_public_id: PUBLIC_ID,
      p_actor_user_id: null,
      p_session_hash: 'a'.repeat(64),
    })
  })

  it('allows claim intent only for a signed-in link holder while read stays available', async () => {
    const user = {
      id: 'user-1',
      email: 'user@example.com',
      email_confirmed_at: '2026-08-11T12:00:00.000Z',
    } as never
    expect(await authorizeBookingAccess({
      publicId: PUBLIC_ID, user: null, sessionHash: 'a'.repeat(64), intent: 'claim',
    })).toBeNull()
    expect(await authorizeBookingAccess({
      publicId: PUBLIC_ID, user, sessionHash: 'a'.repeat(64), intent: 'claim',
    })).toMatchObject({ actorKind: 'guest', signedIn: true })
  })

  it('turns an RPC failure or throw into the same inaccessible result', async () => {
    mocks.adminRpc.mockRejectedValueOnce(new Error('private connection detail'))
    expect(await authorizeBookingAccess({ publicId: PUBLIC_ID, user: null })).toBeNull()
    mocks.adminRpc.mockResolvedValueOnce({ data: null, error: { message: 'private row detail' } })
    expect(await authorizeBookingAccess({ publicId: PUBLIC_ID, user: null })).toBeNull()
  })
})

describe('provider API gate', () => {
  it('requires a confirmed user, exact per-user feature and personal space', async () => {
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: 'provider-1',
          email: 'provider@example.com',
          email_confirmed_at: '2026-08-11T12:00:00.000Z',
        },
      },
    })
    expect(await requireBookingProviderApi()).toMatchObject({ ok: true, spaceId: 'space-1' })
    expect(mocks.featureAccess).toHaveBeenCalledWith(
      'provider-1', 'provider@example.com', 'bokanir',
    )

    mocks.featureAccess.mockResolvedValue(false)
    expect(await requireBookingProviderApi()).toEqual({ ok: false, status: 404 })
    expect(mocks.userRpc).toHaveBeenCalledTimes(1)
  })

  it('fails closed without leaking auth/service failures', async () => {
    mocks.getUser.mockRejectedValue(new Error('private auth detail'))
    expect(await requireBookingProviderApi()).toEqual({ ok: false, status: 404 })
  })
})
