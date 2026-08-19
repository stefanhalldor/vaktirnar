import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }))

vi.mock('@/lib/supabase/admin', () => ({
  getAdmin: vi.fn(() => ({ rpc: mockRpc })),
}))

import { loadHouseholdChoreInviteCandidates } from '@/lib/household-chores/relationships.server'

const ACTOR = '11111111-1111-4111-8111-111111111111'
const CIRCLE = '22222222-2222-4222-8222-222222222222'
const RELATIONSHIP = '88888888-8888-4888-8888-888888888888'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Household Chores Relationship adapter', () => {
  it('calls only the bounded invite-candidate RPC and exposes id plus label', async () => {
    mockRpc.mockResolvedValue({
      data: {
        ok: true,
        code: 'get_invite_candidates_loaded',
        data: {
          items: [{ relationship_id: RELATIONSHIP, label: 'Maki' }],
          has_more: true,
          next_cursor: { label: 'Maki', relationship_id: RELATIONSHIP },
        },
      },
      error: null,
    })

    await expect(loadHouseholdChoreInviteCandidates(ACTOR, CIRCLE, {
      cursor: { label: 'Anna', relationshipId: RELATIONSHIP },
      limit: 25,
    })).resolves.toEqual({
      items: [{ relationshipId: RELATIONSHIP, label: 'Maki' }],
      hasMore: true,
      nextCursor: { label: 'Maki', relationshipId: RELATIONSHIP },
    })
    expect(mockRpc).toHaveBeenCalledTimes(1)
    expect(mockRpc).toHaveBeenCalledWith('household_chore_get_invite_candidates', {
      p_actor_id: ACTOR,
      p_circle_id: CIRCLE,
      p_cursor_label: 'Anna',
      p_cursor_relationship_id: RELATIONSHIP,
      p_limit: 25,
    })
  })

  it.each([
    ['email-like label', { relationship_id: RELATIONSHIP, label: 'private@example.com' }],
    ['private field', { relationship_id: RELATIONSHIP, label: 'Maki', private_note: 'secret' }],
    ['auth identity', { relationship_id: RELATIONSHIP, label: 'Maki', auth_user_id: ACTOR }],
  ])('fails closed on %s and does not leak it to logs', async (_label, item) => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockRpc.mockResolvedValue({
      data: {
        ok: true,
        code: 'get_invite_candidates_loaded',
        data: { items: [item], has_more: false, next_cursor: null },
      },
      error: null,
    })
    await expect(loadHouseholdChoreInviteCandidates(ACTOR, CIRCLE)).rejects.toMatchObject({
      code: 'save_failed',
    })
    const logs = JSON.stringify(errorSpy.mock.calls)
    expect(logs).not.toContain('private@example.com')
    expect(logs).not.toContain('secret')
    expect(logs).not.toContain(ACTOR)
    errorSpy.mockRestore()
  })

  it('rejects a cursor/has-more mismatch', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockRpc.mockResolvedValue({
      data: {
        ok: true,
        code: 'get_invite_candidates_loaded',
        data: { items: [], has_more: true, next_cursor: null },
      },
      error: null,
    })
    await expect(loadHouseholdChoreInviteCandidates(ACTOR, CIRCLE)).rejects.toMatchObject({
      code: 'save_failed',
    })
    errorSpy.mockRestore()
  })

  it('preserves business denial while converting transport failure to a generic error', async () => {
    mockRpc.mockResolvedValueOnce({
      data: { ok: false, code: 'not_found', data: {} },
      error: null,
    })
    await expect(loadHouseholdChoreInviteCandidates(ACTOR, CIRCLE)).rejects.toMatchObject({
      code: 'not_found',
    })

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: `private@example.com ${ACTOR}` },
    })
    await expect(loadHouseholdChoreInviteCandidates(ACTOR, CIRCLE)).rejects.toMatchObject({
      code: 'save_failed',
    })
    const logs = JSON.stringify(errorSpy.mock.calls)
    expect(logs).not.toContain('private@example.com')
    expect(logs).not.toContain(ACTOR)
    errorSpy.mockRestore()
  })

  it('rejects invalid ids before an RPC', async () => {
    await expect(loadHouseholdChoreInviteCandidates('bad-id', CIRCLE)).rejects.toMatchObject({
      code: 'invalid_input',
    })
    expect(mockRpc).not.toHaveBeenCalled()
  })
})
