import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  HouseholdChoreChildCircleView,
  HouseholdChoreMemberCircleView,
} from '@/lib/household-chores/contracts'
import type { HouseholdChoreInviteCandidateLoader } from '@/components/household-chores/CircleMemberManager'

const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  loadCandidates: vi.fn(),
  loadCircle: vi.fn(),
  noStore: vi.fn(),
  redirect: vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`)
  }),
}))

vi.mock('next/cache', () => ({ unstable_noStore: mocks.noStore }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))
vi.mock('@/lib/household-chores/guard', () => ({
  guardHouseholdChoreAccess: mocks.guard,
}))
vi.mock('@/lib/household-chores/relationships.server', () => ({
  loadHouseholdChoreInviteCandidates: mocks.loadCandidates,
}))
vi.mock('@/lib/household-chores/repository.server', () => ({
  HouseholdChoreRepositoryError: class HouseholdChoreRepositoryError extends Error {
    code: string

    constructor(code: string) {
      super(code)
      this.code = code
    }
  },
  loadHouseholdChoreCircle: mocks.loadCircle,
}))
vi.mock('@/components/household-chores/CircleMemberManager', () => ({
  CircleMemberManager: () => null,
}))
vi.mock('@/components/household-chores/CircleRenameForm', () => ({
  CircleRenameForm: () => null,
}))
vi.mock('@/app/auth-mvp/verkefnin/HouseholdChoreShell', () => ({
  HouseholdChoreShell: ({ children }: { children: React.ReactNode }) => children,
}))

import HouseholdChorePeoplePage from '@/app/auth-mvp/verkefnin/(content)/[circleId]/folk/page'

const CIRCLE_ID = '10000000-0000-4000-8000-000000000001'
const USER_ID = '20000000-0000-4000-8000-000000000001'

const childView: HouseholdChoreChildCircleView = {
  viewerType: 'child',
  circle: { name: 'Heima', displayReference: 'ABC123' },
  ownParticipantId: '30000000-0000-4000-8000-000000000001',
  participants: [],
  definitions: [],
  openAssignments: [],
  recentAssignments: [],
  pointTotals: [],
}

const memberView: HouseholdChoreMemberCircleView = {
  viewerType: 'member',
  circle: {
    circleId: CIRCLE_ID,
    name: 'Heima',
    displayReference: 'ABC123',
    version: '1',
    memberCount: 1,
  },
  participants: [],
  definitions: [],
  openAssignments: [],
  recentAssignments: [],
  pointTotals: [],
  memberships: [],
  pendingInvitations: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.guard.mockResolvedValue({ user: { id: USER_ID } })
  mocks.loadCandidates.mockResolvedValue({ items: [], hasMore: false, nextCursor: null })
})

describe('Household Chores member-management route boundary', () => {
  it('redirects a child before loading or serializing member-management data', async () => {
    mocks.loadCircle.mockResolvedValue(childView)

    await expect(HouseholdChorePeoplePage({
      params: Promise.resolve({ circleId: CIRCLE_ID }),
    })).rejects.toThrow(`REDIRECT:/auth-mvp/verkefnin/${CIRCLE_ID}`)

    expect(mocks.loadCandidates).not.toHaveBeenCalled()
  })

  it('loads a bounded safe candidate page only after full-member proof', async () => {
    mocks.loadCircle.mockResolvedValue(memberView)
    const candidatePage = {
      items: [{
        relationshipId: '40000000-0000-4000-8000-000000000001',
        label: 'Anna',
      }],
      hasMore: false,
      nextCursor: null,
    }
    mocks.loadCandidates.mockResolvedValue(candidatePage)

    const page = await HouseholdChorePeoplePage({
      params: Promise.resolve({ circleId: CIRCLE_ID }),
    }) as React.ReactElement<{ children: React.ReactElement<{ children: React.ReactNode }> }>
    const [manager] = React.Children.toArray(page.props.children.props.children) as Array<React.ReactElement<{
      view: HouseholdChoreMemberCircleView
      inviteCandidates: typeof candidatePage
      loadInviteCandidates: HouseholdChoreInviteCandidateLoader
    }>>

    expect(mocks.loadCircle).toHaveBeenCalledWith(USER_ID, CIRCLE_ID)
    expect(mocks.loadCandidates).toHaveBeenCalledWith(USER_ID, CIRCLE_ID, { limit: 50 })
    expect(manager.props.view).toBe(memberView)
    expect(manager.props.inviteCandidates).toBe(candidatePage)

    const cursor = candidatePage.items[0]
    await expect(manager.props.loadInviteCandidates(cursor)).resolves.toEqual({
      ok: true,
      data: candidatePage,
    })
    expect(mocks.loadCandidates).toHaveBeenLastCalledWith(USER_ID, CIRCLE_ID, {
      cursor,
      limit: 50,
    })
  })

  it('rechecks full membership before every candidate page and returns no data after demotion', async () => {
    mocks.loadCircle
      .mockResolvedValueOnce(memberView)
      .mockResolvedValueOnce(childView)
    const candidatePage = { items: [], hasMore: false, nextCursor: null }
    mocks.loadCandidates.mockResolvedValue(candidatePage)

    const page = await HouseholdChorePeoplePage({
      params: Promise.resolve({ circleId: CIRCLE_ID }),
    }) as React.ReactElement<{ children: React.ReactElement<{ children: React.ReactNode }> }>
    const [manager] = React.Children.toArray(page.props.children.props.children) as Array<React.ReactElement<{
      loadInviteCandidates: HouseholdChoreInviteCandidateLoader
    }>>

    const result = await manager.props.loadInviteCandidates(null)
    expect(result).toEqual({ ok: false, error: 'access_changed' })
    expect(mocks.loadCandidates).toHaveBeenCalledOnce()
  })
})
