import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGuardSession, mockCheckFeatureAccess, mockRedirect } = vi.hoisted(() => ({
  mockGuardSession: vi.fn(),
  mockCheckFeatureAccess: vi.fn(),
  mockRedirect: vi.fn((href: string) => { throw new Error(`NEXT_REDIRECT:${href}`) }),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ redirect: mockRedirect }))
vi.mock('@/lib/auth/guard', () => ({ guardTeskeidSession: mockGuardSession }))
vi.mock('@/lib/loans/guard', () => ({ checkFeatureAccess: mockCheckFeatureAccess }))

import {
  canUseHouseholdChores,
  guardHouseholdChoreAccess,
  guardHouseholdChoreSession,
  isHouseholdChoresGloballyEnabled,
} from '@/lib/household-chores/guard'
import {
  AssignHouseholdChoreSchema,
  CreateHouseholdChoreDefinitionSchema,
  CreateHouseholdChoreParticipantSchema,
  DeleteHouseholdChoreCircleSchema,
  SetHouseholdChoreParticipantValueSchema,
  LinkHouseholdChoreParticipantSchema,
  RenameHouseholdChoreParticipantSchema,
} from '@/lib/household-chores/validation'

const user = { id: '81000000-0000-4000-8000-000000000001', email: 'user@example.com' }
const circleId = '82000000-0000-4000-8000-000000000001'
const definitionId = '83000000-0000-4000-8000-000000000001'
const participantId = '84000000-0000-4000-8000-000000000001'
const requestId = '85000000-0000-4000-8000-000000000001'

describe('Household Chores private-beta boundaries', () => {
  const savedFlag = process.env.HOUSEHOLD_CHORES_ENABLED

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.HOUSEHOLD_CHORES_ENABLED = 'true'
    mockGuardSession.mockResolvedValue({ user })
    mockCheckFeatureAccess.mockResolvedValue(true)
  })

  afterEach(() => {
    if (savedFlag === undefined) delete process.env.HOUSEHOLD_CHORES_ENABLED
    else process.env.HOUSEHOLD_CHORES_ENABLED = savedFlag
  })

  it('keeps the session-only boundary independent of rollout and entitlement', async () => {
    delete process.env.HOUSEHOLD_CHORES_ENABLED

    await expect(guardHouseholdChoreSession()).resolves.toEqual({ user })
    expect(mockCheckFeatureAccess).not.toHaveBeenCalled()
  })

  it('fails closed when the global switch is off or the session lacks email', async () => {
    delete process.env.HOUSEHOLD_CHORES_ENABLED
    await expect(canUseHouseholdChores(user as never)).resolves.toBe(false)

    process.env.HOUSEHOLD_CHORES_ENABLED = 'true'
    await expect(canUseHouseholdChores({ ...user, email: undefined } as never)).resolves.toBe(false)
    expect(mockCheckFeatureAccess).not.toHaveBeenCalled()
  })

  it('checks the exact entitlement only after the global gate', async () => {
    await expect(canUseHouseholdChores(user as never)).resolves.toBe(true)
    expect(mockCheckFeatureAccess).toHaveBeenCalledWith(
      user.id,
      user.email,
      'heimilisverkin',
    )
  })

  it('redirects full content when exact entitlement is unavailable', async () => {
    mockCheckFeatureAccess.mockResolvedValue(false)
    await expect(guardHouseholdChoreAccess()).rejects.toThrow('NEXT_REDIRECT:/')
  })

  it('returns only the verified session user after both full gates pass', async () => {
    await expect(guardHouseholdChoreAccess()).resolves.toEqual({ user })
  })

  it('uses an exact lowercase true switch', () => {
    expect(isHouseholdChoresGloballyEnabled({ HOUSEHOLD_CHORES_ENABLED: 'true' } as unknown as NodeJS.ProcessEnv)).toBe(true)
    expect(isHouseholdChoresGloballyEnabled({ HOUSEHOLD_CHORES_ENABLED: 'TRUE' } as unknown as NodeJS.ProcessEnv)).toBe(false)
  })
})

describe('Household Chores mutation validation', () => {
  it('accepts PostgreSQL bigint versions but rejects overflow and leading zeroes', () => {
    const base = {
      requestId,
      circleId,
      definitionId,
      participantId,
      expectedDefinitionVersion: '1',
      expectedValueVersion: '9223372036854775807',
    }
    expect(AssignHouseholdChoreSchema.safeParse(base).success).toBe(true)
    expect(AssignHouseholdChoreSchema.safeParse({
      ...base,
      expectedValueVersion: '9223372036854775808',
    }).success).toBe(false)
    expect(AssignHouseholdChoreSchema.safeParse({
      ...base,
      expectedValueVersion: '01',
    }).success).toBe(false)
  })

  it('normalizes definition copy and follows the SQL length contract', () => {
    const result = CreateHouseholdChoreDefinitionSchema.safeParse({
      requestId,
      circleId,
      title: `  ${'V'.repeat(120)}  `,
      description: 'Lýsing',
      materials: 'Efnin',
      cadenceDays: 7,
      completionScope: 'global',
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.title).toHaveLength(120)

    expect(CreateHouseholdChoreDefinitionSchema.safeParse({
      requestId,
      circleId,
      title: 'V'.repeat(121),
      description: null,
      materials: null,
      cadenceDays: 7,
      completionScope: 'per_participant',
    }).success).toBe(false)

    expect(CreateHouseholdChoreDefinitionSchema.safeParse({
      requestId,
      circleId,
      title: 'Ryksuga',
      description: null,
      materials: null,
      cadenceDays: 0,
      completionScope: 'global',
    }).success).toBe(false)
  })

  it('does not let email-like text cross the shared participant boundary', () => {
    expect(CreateHouseholdChoreParticipantSchema.safeParse({
      requestId,
      circleId,
      label: 'barn@example.com',
    }).success).toBe(false)
  })

  it('validates guest rename and identity-link inputs independently', () => {
    expect(RenameHouseholdChoreParticipantSchema.safeParse({
      requestId, circleId, participantId, expectedVersion: '1', label: '  Berglind  ',
    })).toMatchObject({ success: true })
    expect(RenameHouseholdChoreParticipantSchema.safeParse({
      requestId, circleId, participantId, expectedVersion: '1', label: 'berg@example.com',
    }).success).toBe(false)

    const link = LinkHouseholdChoreParticipantSchema.safeParse({
      requestId,
      circleId,
      participantId,
      expectedVersion: '1',
      recipientEmail: '  berg@example.com ',
      requestedType: 'child',
    })
    expect(link.success).toBe(true)
    if (link.success) expect(link.data.recipientEmail).toBe('berg@example.com')
  })

  it('requires points for an active rule and a real row before deactivation', () => {
    const base = {
      requestId,
      circleId,
      definitionId,
      participantId,
      expectedDefinitionVersion: '1',
    }

    expect(SetHouseholdChoreParticipantValueSchema.safeParse({
      ...base,
      expectedValueVersion: '0',
      points: null,
      active: true,
    }).success).toBe(false)
    expect(SetHouseholdChoreParticipantValueSchema.safeParse({
      ...base,
      expectedValueVersion: '0',
      points: 5,
      active: true,
    }).success).toBe(true)
    expect(SetHouseholdChoreParticipantValueSchema.safeParse({
      ...base,
      expectedValueVersion: '0',
      points: null,
      active: false,
    }).success).toBe(false)
  })

  it('requires the exact non-sensitive display reference for circle deletion', () => {
    const result = DeleteHouseholdChoreCircleSchema.safeParse({
      requestId,
      circleId,
      expectedVersion: '1',
      displayReference: ' abcd2345 ',
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.displayReference).toBe('ABCD2345')

    expect(DeleteHouseholdChoreCircleSchema.safeParse({
      requestId,
      circleId,
      expectedVersion: '1',
      displayReference: 'circle name',
    }).success).toBe(false)
  })
})
