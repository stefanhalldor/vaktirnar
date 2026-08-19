import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockFullGuard,
  mockSessionGuard,
  mockRevalidatePath,
  mockRedirect,
  repository,
} = vi.hoisted(() => ({
  mockFullGuard: vi.fn(),
  mockSessionGuard: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockRedirect: vi.fn((destination: string) => {
    throw new Error(`NEXT_REDIRECT:${destination}`)
  }),
  repository: {
    acceptHouseholdChoreInvitation: vi.fn(),
    archiveHouseholdChoreDefinition: vi.fn(),
    archiveHouseholdChoreParticipant: vi.fn(),
    assignHouseholdChore: vi.fn(),
    cancelHouseholdChoreAssignment: vi.fn(),
    cancelHouseholdChoreInvitation: vi.fn(),
    cancelOwnHouseholdChoreAssignment: vi.fn(),
    changeHouseholdChoreMembershipType: vi.fn(),
    completeHouseholdChoreAssignment: vi.fn(),
    completeHouseholdChoreDefinition: vi.fn(),
    createHouseholdChoreCircle: vi.fn(),
    createHouseholdChoreDefinition: vi.fn(),
    createHouseholdChoreInvitation: vi.fn(),
    createHouseholdChoreParticipant: vi.fn(),
    declineHouseholdChoreInvitation: vi.fn(),
    deleteHouseholdChoreCircle: vi.fn(),
    leaveHouseholdChoreCircle: vi.fn(),
    linkHouseholdChoreParticipant: vi.fn(),
    reactivateHouseholdChoreDefinition: vi.fn(),
    reactivateHouseholdChoreParticipant: vi.fn(),
    removeHouseholdChoreMember: vi.fn(),
    renameHouseholdChoreCircle: vi.fn(),
    renameHouseholdChoreParticipant: vi.fn(),
    repeatHouseholdChoreAssignment: vi.fn(),
    selfAssignHouseholdChore: vi.fn(),
    setHouseholdChoreParticipantValue: vi.fn(),
    undoHouseholdChoreCompletion: vi.fn(),
    updateHouseholdChoreDefinition: vi.fn(),
  },
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('next/navigation', () => ({ redirect: mockRedirect }))
vi.mock('@/lib/household-chores/guard', () => ({
  guardHouseholdChoreAccess: mockFullGuard,
  guardHouseholdChoreSession: mockSessionGuard,
}))
vi.mock('@/lib/household-chores/repository.server', () => repository)

import {
  acceptHouseholdChoreInvitationAction,
  cancelOwnHouseholdChoreAssignmentAction,
  completeHouseholdChoreDefinitionAction,
  createHouseholdChoreCircleAction,
  declineHouseholdChoreInvitationAction,
  deleteHouseholdChoreCircleAction,
  leaveHouseholdChoreCircleAction,
  renameHouseholdChoreCircleAction,
} from '@/lib/household-chores/actions'

const actorId = '81000000-0000-4000-8000-000000000001'
const circleId = '82000000-0000-4000-8000-000000000001'
const invitationId = '83000000-0000-4000-8000-000000000001'
const assignmentId = '84000000-0000-4000-8000-000000000001'
const requestId = '85000000-0000-4000-8000-000000000001'
const definitionId = '86000000-0000-4000-8000-000000000001'
const participantId = '87000000-0000-4000-8000-000000000001'

const success = {
  ok: true as const,
  data: {
    resourceId: circleId,
    version: '1',
    status: 'active',
    circleId,
  },
}

describe('Household Chores server-action boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFullGuard.mockResolvedValue({ user: { id: actorId } })
    mockSessionGuard.mockResolvedValue({ user: { id: actorId } })
  })

  it('does not swallow full-access redirects', async () => {
    mockFullGuard.mockRejectedValueOnce(new Error('NEXT_REDIRECT:/'))
    await expect(createHouseholdChoreCircleAction({})).rejects.toThrow('NEXT_REDIRECT:/')
    expect(repository.createHouseholdChoreCircle).not.toHaveBeenCalled()
  })

  it('keeps decline, leave and exact circle deletion on the session-only boundary', async () => {
    const redirectSignal = new Error('NEXT_REDIRECT:/innskraning')

    for (const [action, input] of [
      [declineHouseholdChoreInvitationAction, {}],
      [leaveHouseholdChoreCircleAction, {}],
      [deleteHouseholdChoreCircleAction, {}],
    ] as const) {
      mockSessionGuard.mockRejectedValueOnce(redirectSignal)
      await expect(action(input)).rejects.toBe(redirectSignal)
    }

    expect(mockFullGuard).not.toHaveBeenCalled()
  })

  it('keeps invitation acceptance behind the full rollout boundary', async () => {
    mockFullGuard.mockRejectedValueOnce(new Error('NEXT_REDIRECT:/'))
    await expect(acceptHouseholdChoreInvitationAction({})).rejects.toThrow('NEXT_REDIRECT:/')
    expect(mockSessionGuard).not.toHaveBeenCalled()
  })

  it('validates only after authentication and never calls the repository for bad input', async () => {
    await expect(createHouseholdChoreCircleAction({ name: 'Hringur' })).resolves.toEqual({
      ok: false,
      error: 'invalid_input',
    })
    expect(mockFullGuard).toHaveBeenCalledOnce()
    expect(repository.createHouseholdChoreCircle).not.toHaveBeenCalled()
  })

  it('keeps quick completion behind full feature access and passes the state token', async () => {
    repository.completeHouseholdChoreDefinition.mockResolvedValue({
      ok: true,
      data: {
        resourceId: assignmentId,
        definitionId,
        participantId,
        version: '2',
        status: 'completed',
      },
    })
    await expect(completeHouseholdChoreDefinitionAction({
      requestId,
      circleId,
      definitionId,
      participantId,
      expectedStateToken: 'a'.repeat(64),
    })).resolves.toMatchObject({ ok: true })
    expect(repository.completeHouseholdChoreDefinition).toHaveBeenCalledWith(actorId, {
      requestId,
      circleId,
      definitionId,
      participantId,
      expectedStateToken: 'a'.repeat(64),
    })
    expect(mockFullGuard).toHaveBeenCalled()
  })

  it('passes only normalized validated input and revalidates bounded Household surfaces', async () => {
    repository.createHouseholdChoreCircle.mockResolvedValueOnce(success)

    await expect(createHouseholdChoreCircleAction({
      requestId,
      name: '  Heimilið  ',
    })).resolves.toEqual(success)

    expect(repository.createHouseholdChoreCircle).toHaveBeenCalledWith(actorId, {
      requestId,
      name: 'Heimilið',
    })
    expect(mockRevalidatePath).toHaveBeenCalledWith('/auth-mvp/verkefnin')
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/auth-mvp/verkefnin/${circleId}`)
    expect(mockRevalidatePath).toHaveBeenCalledWith('/auth-mvp/heim')
  })

  it('routes child correction to the own-assignment RPC', async () => {
    repository.cancelOwnHouseholdChoreAssignment.mockResolvedValueOnce({
      ...success,
      data: { ...success.data, resourceId: assignmentId },
    })

    await cancelOwnHouseholdChoreAssignmentAction({
      requestId,
      circleId,
      assignmentId,
      expectedVersion: '1',
    })

    expect(repository.cancelOwnHouseholdChoreAssignment).toHaveBeenCalledWith(actorId, {
      requestId,
      circleId,
      assignmentId,
      expectedVersion: '1',
    })
    expect(repository.cancelHouseholdChoreAssignment).not.toHaveBeenCalled()
  })

  it('does not revalidate on a sealed business failure', async () => {
    repository.declineHouseholdChoreInvitation.mockResolvedValueOnce({
      ok: false,
      error: 'terminal_state',
    })

    await expect(declineHouseholdChoreInvitationAction({
      requestId,
      invitationId,
      expectedVersion: '1',
    })).resolves.toEqual({ ok: false, error: 'terminal_state' })
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it('purges a stale member-only tree when SQL reports lost circle authority', async () => {
    repository.renameHouseholdChoreCircle.mockResolvedValueOnce({
      ok: false,
      error: 'not_allowed',
    })

    await expect(renameHouseholdChoreCircleAction({
      requestId,
      circleId,
      expectedVersion: '1',
      name: 'Nýtt heiti',
    })).rejects.toThrow('NEXT_REDIRECT:/auth-mvp/verkefnin')

    expect(mockRedirect).toHaveBeenCalledWith('/auth-mvp/verkefnin')
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it('preserves a committed success when cache revalidation fails', async () => {
    repository.createHouseholdChoreCircle.mockResolvedValueOnce(success)
    mockRevalidatePath.mockImplementationOnce(() => {
      throw new Error('cache backend unavailable')
    })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(createHouseholdChoreCircleAction({
      requestId,
      name: 'Heimilið',
    })).resolves.toEqual(success)

    expect(consoleSpy).toHaveBeenCalledWith('[household-chores] cache revalidation failed')
    expect(consoleSpy.mock.calls.flat().join(' ')).not.toContain('cache backend unavailable')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/auth-mvp/verkefnin')
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/auth-mvp/verkefnin/${circleId}`)

    consoleSpy.mockRestore()
  })

  it('returns a generic safe failure when the repository throws', async () => {
    repository.createHouseholdChoreCircle.mockRejectedValueOnce(new Error('sensitive detail'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(createHouseholdChoreCircleAction({
      requestId,
      name: 'Heimilið',
    })).resolves.toEqual({ ok: false, error: 'save_failed' })
    expect(consoleSpy).toHaveBeenCalledWith('[household-chores] create circle failed')
    expect(consoleSpy.mock.calls.flat().join(' ')).not.toContain('sensitive detail')

    consoleSpy.mockRestore()
  })
})
