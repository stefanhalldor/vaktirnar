import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  HouseholdChoreMemberCircleView,
} from '@/lib/household-chores/contracts'
import type { HouseholdChoreV2AssignmentDetail } from '@/lib/household-chores/contracts-v2'

const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  loadAssignment: vi.fn(),
  loadCircle: vi.fn(),
  loadDefinition: vi.fn(),
  loadTimeline: vi.fn(),
  loadAssignmentV2: vi.fn(),
  loadDefinitionV3: vi.fn(),
  loadPriorityV2: vi.fn(),
  loadTimelineV2: vi.fn(),
  noStore: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND')
  }),
  redirect: vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`)
  }),
}))

vi.mock('next/cache', () => ({ unstable_noStore: mocks.noStore }))
vi.mock('next/navigation', () => ({
  notFound: mocks.notFound,
  redirect: mocks.redirect,
}))
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))
vi.mock('@/lib/household-chores/guard', () => ({
  guardHouseholdChoreAccess: mocks.guard,
}))
vi.mock('@/lib/household-chores/repository.server', () => ({
  HouseholdChoreRepositoryError: class HouseholdChoreRepositoryError extends Error {
    code: string

    constructor(code: string) {
      super(code)
      this.code = code
    }
  },
  loadHouseholdChoreAssignment: mocks.loadAssignment,
  loadHouseholdChoreAssignmentTimeline: mocks.loadTimeline,
  loadHouseholdChoreCircle: mocks.loadCircle,
  loadHouseholdChoreDefinitionDetail: mocks.loadDefinition,
}))
vi.mock('@/lib/household-chores/repository-v2.server', () => ({
  HouseholdChoreV2RepositoryError: class HouseholdChoreV2RepositoryError extends Error {
    code: string

    constructor(code: string) {
      super(code)
      this.code = code
    }
  },
  loadHouseholdChoreAssignmentV2: mocks.loadAssignmentV2,
  loadHouseholdChoreAssignmentTimelineV2: mocks.loadTimelineV2,
  loadHouseholdChoreDefinitionDetailV3: mocks.loadDefinitionV3,
  loadHouseholdChorePriorityDashboardV2: mocks.loadPriorityV2,
}))
vi.mock('@/components/household-chores/ChoreAssignmentDetailV2', () => ({
  ChoreAssignmentDetailV2: () => null,
}))
vi.mock('@/components/household-chores/ChoreAssignmentForm', () => ({
  ChoreAssignmentForm: () => null,
}))
vi.mock('@/app/auth-mvp/verkefnin/HouseholdChoreShell', () => ({
  HouseholdChoreShell: ({ children }: { children: React.ReactNode }) => children,
}))

import HouseholdChoreAssignmentPage from '@/app/auth-mvp/verkefnin/(content)/[circleId]/framkvaemdir/[assignmentId]/page'
import HouseholdChoreAssignPage from '@/app/auth-mvp/verkefnin/(content)/[circleId]/utdeila/page'
import type { ChoreAssignmentActionState } from '@/components/household-chores/ChoreAssignmentActions'
import type { ChoreAssignmentDateActionState } from '@/components/household-chores/ChoreAssignmentDateActions'

const CIRCLE_ID = '10000000-0000-4000-8000-000000000001'
const USER_ID = '20000000-0000-4000-8000-000000000001'
const ASSIGNMENT_ID = '30000000-0000-4000-8000-000000000001'
const PARTICIPANT_ID = '40000000-0000-4000-8000-000000000001'
const FIRST_DEFINITION_ID = '50000000-0000-4000-8000-000000000001'
const SECOND_DEFINITION_ID = '50000000-0000-4000-8000-000000000002'

const baseAssignment = {
  assignmentId: ASSIGNMENT_ID,
  title: 'Ryksuga',
  description: 'Allt gólfið',
  materials: 'Ryksuga',
  participantLabel: 'Aron',
  participantIdentityMarker: 'current' as const,
  points: 7,
  origin: 'member_assigned' as const,
  status: 'open' as const,
  createdAt: '2026-08-18T01:00:00.000Z',
  completedAt: null,
  performedOn: null,
  recordedAt: null,
  cancelledAt: null,
  canCorrectDate: false,
}

const memberCircle: HouseholdChoreMemberCircleView = {
  viewerType: 'member',
  circle: {
    circleId: CIRCLE_ID,
    name: 'Heima',
    displayReference: 'ABC123',
    version: '9',
    memberCount: 2,
  },
  participants: [],
  definitions: [
    {
      definitionId: FIRST_DEFINITION_ID,
      title: 'Ryksuga',
      description: null,
      materials: null,
      status: 'active',
      version: '4',
    },
    {
      definitionId: SECOND_DEFINITION_ID,
      title: 'Taka úr vél',
      description: null,
      materials: null,
      status: 'active',
      version: '8',
    },
  ],
  openAssignments: [],
  recentAssignments: [],
  pointTotals: [],
  memberships: [],
  pendingInvitations: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.guard.mockResolvedValue({ user: { id: USER_ID } })
  mocks.loadTimeline.mockResolvedValue({ items: [], hasMore: false, nextCursor: null })
  mocks.loadPriorityV2.mockResolvedValue({ serverToday: '2026-08-19' })
})

function assignmentChild(
  page: React.ReactElement<{ children: React.ReactElement<{
    detail: HouseholdChoreV2AssignmentDetail
    dateActionState: ChoreAssignmentDateActionState | null
    legacyActionState: ChoreAssignmentActionState | null
  }> }>,
) {
  return page.props.children
}

describe('Household Chores assignment route capabilities', () => {
  it('maps a full member viewing an open assignment to member controls', async () => {
    const detail: HouseholdChoreV2AssignmentDetail = {
      viewerType: 'member',
      assignment: {
        ...baseAssignment,
        circleId: CIRCLE_ID,
        definitionId: FIRST_DEFINITION_ID,
        participantId: PARTICIPANT_ID,
        completionSequence: 0,
        version: '6',
        recorderLabel: null,
      },
      timeline: { items: [], hasMore: false, nextCursor: null },
    }
    mocks.loadAssignmentV2.mockResolvedValue(detail)

    const page = await HouseholdChoreAssignmentPage({
      params: Promise.resolve({ circleId: CIRCLE_ID, assignmentId: ASSIGNMENT_ID }),
      searchParams: Promise.resolve({}),
    }) as React.ReactElement<{ children: React.ReactElement<{
      detail: HouseholdChoreV2AssignmentDetail
      dateActionState: ChoreAssignmentDateActionState | null
      legacyActionState: ChoreAssignmentActionState | null
    }> }>
    const child = assignmentChild(page)

    expect(child.props.dateActionState).toEqual({
      circleId: CIRCLE_ID,
      assignmentId: ASSIGNMENT_ID,
      version: '6',
      serverToday: '2026-08-19',
      minimumPerformedOn: '2026-08-18',
      canComplete: true,
      correction: null,
    })
    expect(child.props.legacyActionState).toEqual({
      circleId: CIRCLE_ID,
      assignmentId: ASSIGNMENT_ID,
      version: '6',
      canComplete: false,
      canCancelAsMember: true,
      canCancelOwn: false,
      canUndo: false,
      repeatContext: null,
    })
    expect(child.props.detail).toBe(detail)
    expect(mocks.loadDefinitionV3).not.toHaveBeenCalled()
  })

  it('maps a child only to exact-own open capabilities without member-only controls', async () => {
    const detail: HouseholdChoreV2AssignmentDetail = {
      viewerType: 'child',
      assignment: {
        ...baseAssignment,
        ownAssignment: true,
        completionSequence: null,
        version: '6',
        canComplete: true,
        canCancel: true,
      },
      timeline: { items: [], hasMore: false, nextCursor: null },
    }
    mocks.loadAssignmentV2.mockResolvedValue(detail)

    const page = await HouseholdChoreAssignmentPage({
      params: Promise.resolve({ circleId: CIRCLE_ID, assignmentId: ASSIGNMENT_ID }),
      searchParams: Promise.resolve({}),
    }) as React.ReactElement<{ children: React.ReactElement<{
      detail: HouseholdChoreV2AssignmentDetail
      dateActionState: ChoreAssignmentDateActionState | null
      legacyActionState: ChoreAssignmentActionState | null
    }> }>
    const child = assignmentChild(page)

    expect(child.props.dateActionState).toEqual({
      circleId: CIRCLE_ID,
      assignmentId: ASSIGNMENT_ID,
      version: '6',
      serverToday: '2026-08-19',
      minimumPerformedOn: '2026-08-18',
      canComplete: true,
      correction: null,
    })
    expect(child.props.legacyActionState).toEqual({
      circleId: CIRCLE_ID,
      assignmentId: ASSIGNMENT_ID,
      version: '6',
      canComplete: false,
      canCancelAsMember: false,
      canCancelOwn: true,
      canUndo: false,
      repeatContext: null,
    })
    expect(child.props.detail.assignment).toEqual(expect.objectContaining({
      title: 'Ryksuga',
      participantLabel: 'Aron',
      status: 'open',
    }))
    expect(mocks.loadDefinitionV3).not.toHaveBeenCalled()
  })

  it('renders no mutation controls for a child without exact-own authority', async () => {
    const detail: HouseholdChoreV2AssignmentDetail = {
      viewerType: 'child',
      assignment: {
        ...baseAssignment,
        status: 'completed',
        performedOn: '2026-08-17',
        recordedAt: '2026-08-18T12:00:00.000Z',
        completedAt: '2026-08-18T12:00:00.000Z',
        participantLabel: 'Bjarni',
        ownAssignment: true,
        completionSequence: null,
        version: null,
        canComplete: false,
        canCancel: false,
      },
      timeline: { items: [], hasMore: false, nextCursor: null },
    }
    mocks.loadAssignmentV2.mockResolvedValue(detail)

    const page = await HouseholdChoreAssignmentPage({
      params: Promise.resolve({ circleId: CIRCLE_ID, assignmentId: ASSIGNMENT_ID }),
      searchParams: Promise.resolve({}),
    }) as React.ReactElement<{ children: React.ReactElement<{
      detail: HouseholdChoreV2AssignmentDetail
      dateActionState: ChoreAssignmentDateActionState | null
      legacyActionState: ChoreAssignmentActionState | null
    }> }>

    expect(assignmentChild(page).props.dateActionState).toBeNull()
    expect(assignmentChild(page).props.legacyActionState).toBeNull()
  })
})

describe('Household Chores assignment definition remount contract', () => {
  it('keys the form by the server-selected definition and supplies only its current values', async () => {
    mocks.loadCircle.mockResolvedValue(memberCircle)
    mocks.loadDefinition.mockResolvedValue({
      definition: memberCircle.definitions[1],
      participantValues: [{
        participantId: PARTICIPANT_ID,
        label: 'Aron',
        identityMarker: 'current',
        participantStatus: 'active',
        participantVersion: '2',
        valueStatus: 'active',
        valueVersion: '3',
        points: 7,
      }],
    })

    const page = await HouseholdChoreAssignPage({
      params: Promise.resolve({ circleId: CIRCLE_ID }),
      searchParams: Promise.resolve({ definitionId: SECOND_DEFINITION_ID }),
    }) as React.ReactElement<{ children: React.ReactElement<{
      selectedDefinition: HouseholdChoreMemberCircleView['definitions'][number]
      eligibleValues: Array<{ participantId: string; valueVersion: string }>
    }> }>
    const form = page.props.children

    expect(form.key).toBe(
      `${SECOND_DEFINITION_ID}|8|${PARTICIPANT_ID}:3`,
    )
    expect(form.props.selectedDefinition.definitionId).toBe(SECOND_DEFINITION_ID)
    expect(form.props.eligibleValues).toEqual([expect.objectContaining({
      participantId: PARTICIPANT_ID,
      valueVersion: '3',
    })])
    expect(mocks.loadDefinition).toHaveBeenCalledWith(
      USER_ID,
      CIRCLE_ID,
      SECOND_DEFINITION_ID,
    )
  })
})
