import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGuard, mockRevalidatePath, repository } = vi.hoisted(() => ({
  mockGuard: vi.fn(),
  mockRevalidatePath: vi.fn(),
  repository: {
    completeHouseholdChoreDefinitionV2: vi.fn(),
    completeHouseholdChoreAssignmentV2: vi.fn(),
    correctHouseholdChoreCompletionDate: vi.fn(),
  },
}))

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('@/lib/household-chores/guard', () => ({
  guardHouseholdChoreAccess: mockGuard,
}))
vi.mock('@/lib/household-chores/repository-v2.server', () => repository)

import {
  completeHouseholdChoreAssignmentV2Action,
  completeHouseholdChoreDefinitionV2Action,
  correctHouseholdChoreCompletionDateAction,
} from '@/lib/household-chores/actions-v2'

const ACTOR = '11111111-1111-4111-8111-111111111111'
const CLIENT_ACTOR = '22222222-2222-4222-8222-222222222222'
const CIRCLE = '33333333-3333-4333-8333-333333333333'
const PARTICIPANT = '44444444-4444-4444-8444-444444444444'
const DEFINITION = '55555555-5555-4555-8555-555555555555'
const ASSIGNMENT = '66666666-6666-4666-8666-666666666666'
const REQUEST = '77777777-7777-4777-8777-777777777777'
const TOKEN = 'a'.repeat(64)
const RECORDED_AT = '2026-08-19T14:00:00+00:00'

const completionSuccess = {
  ok: true as const,
  data: {
    resourceId: ASSIGNMENT,
    definitionId: DEFINITION,
    participantId: PARTICIPANT,
    version: '2',
    status: 'completed' as const,
    completionSequence: '1',
    pointsDelta: 10,
    performedOn: '2026-08-18',
    recordedAt: RECORDED_AT,
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGuard.mockResolvedValue({ user: { id: ACTOR } })
})

describe('SQL146 v2 server actions', () => {
  it('derives the actor only from authenticated feature access', async () => {
    repository.completeHouseholdChoreDefinitionV2.mockResolvedValue(completionSuccess)
    await expect(completeHouseholdChoreDefinitionV2Action({
      requestId: REQUEST,
      circleId: CIRCLE,
      definitionId: DEFINITION,
      participantId: PARTICIPANT,
      expectedStateToken: TOKEN,
      performedOn: '2026-08-18',
    })).resolves.toMatchObject({ ok: true })
    expect(mockGuard).toHaveBeenCalledOnce()
    expect(repository.completeHouseholdChoreDefinitionV2).toHaveBeenCalledWith(ACTOR, {
      requestId: REQUEST,
      circleId: CIRCLE,
      definitionId: DEFINITION,
      participantId: PARTICIPANT,
      expectedStateToken: TOKEN,
      performedOn: '2026-08-18',
    })
  })

  it('rejects client-supplied actor data instead of forwarding it', async () => {
    await expect(completeHouseholdChoreDefinitionV2Action({
      requestId: REQUEST,
      circleId: CIRCLE,
      definitionId: DEFINITION,
      participantId: PARTICIPANT,
      expectedStateToken: TOKEN,
      actorId: CLIENT_ACTOR,
    })).resolves.toEqual({ ok: false, error: 'invalid_input' })
    expect(mockGuard).toHaveBeenCalledOnce()
    expect(repository.completeHouseholdChoreDefinitionV2).not.toHaveBeenCalled()
  })

  it('keeps member and child completion authority in the authenticated SQL call', async () => {
    repository.completeHouseholdChoreDefinitionV2.mockResolvedValue(completionSuccess)
    await completeHouseholdChoreDefinitionV2Action({
      requestId: REQUEST,
      circleId: CIRCLE,
      definitionId: DEFINITION,
      participantId: PARTICIPANT,
      expectedStateToken: TOKEN,
    })
    expect(repository.completeHouseholdChoreDefinitionV2).toHaveBeenCalledWith(
      ACTOR,
      expect.objectContaining({ participantId: PARTICIPANT }),
    )

    repository.completeHouseholdChoreAssignmentV2.mockResolvedValue(completionSuccess)
    await completeHouseholdChoreAssignmentV2Action({
      requestId: REQUEST,
      circleId: CIRCLE,
      assignmentId: ASSIGNMENT,
      expectedVersion: '1',
    })
    expect(repository.completeHouseholdChoreAssignmentV2).toHaveBeenCalledWith(ACTOR, {
      requestId: REQUEST,
      circleId: CIRCLE,
      assignmentId: ASSIGNMENT,
      expectedVersion: '1',
    })
  })

  it('sends exact correction version/sequence/date and never supplies performer or recorder', async () => {
    repository.correctHouseholdChoreCompletionDate.mockResolvedValue({
      ok: true,
      data: {
        resourceId: ASSIGNMENT,
        version: '3',
        status: 'completed',
        completionSequence: '1',
        performedOn: '2026-08-17',
        recordedAt: RECORDED_AT,
        pointsDelta: 0,
      },
    })
    await correctHouseholdChoreCompletionDateAction({
      requestId: REQUEST,
      circleId: CIRCLE,
      assignmentId: ASSIGNMENT,
      expectedVersion: '2',
      completionSequence: 1,
      performedOn: '2026-08-17',
    })
    expect(repository.correctHouseholdChoreCompletionDate).toHaveBeenCalledWith(ACTOR, {
      requestId: REQUEST,
      circleId: CIRCLE,
      assignmentId: ASSIGNMENT,
      expectedVersion: '2',
      completionSequence: 1,
      performedOn: '2026-08-17',
    })
    const forwarded = repository.correctHouseholdChoreCompletionDate.mock.calls[0]?.[1]
    expect(forwarded).not.toHaveProperty('participantId')
    expect(forwarded).not.toHaveProperty('points')
    expect(forwarded).not.toHaveProperty('recordedAt')
  })

  it('does not revalidate on bounded failures and hides thrown repository detail', async () => {
    repository.completeHouseholdChoreAssignmentV2.mockResolvedValueOnce({
      ok: false,
      error: 'stale_version',
    })
    await expect(completeHouseholdChoreAssignmentV2Action({
      requestId: REQUEST,
      circleId: CIRCLE,
      assignmentId: ASSIGNMENT,
      expectedVersion: '1',
    })).resolves.toEqual({ ok: false, error: 'stale_version' })
    expect(mockRevalidatePath).not.toHaveBeenCalled()

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    repository.completeHouseholdChoreAssignmentV2.mockRejectedValueOnce(
      new Error('private@example.com'),
    )
    await expect(completeHouseholdChoreAssignmentV2Action({
      requestId: REQUEST,
      circleId: CIRCLE,
      assignmentId: ASSIGNMENT,
      expectedVersion: '1',
    })).resolves.toEqual({ ok: false, error: 'save_failed' })
    expect(JSON.stringify(consoleSpy.mock.calls)).not.toContain('private@example.com')
    consoleSpy.mockRestore()
  })
})
