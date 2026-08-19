import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HouseholdChorePriorityDashboardView } from '@/lib/household-chores/contracts'
import { PrioritizedTaskList } from '../PrioritizedTaskList'

const refresh = vi.fn()
const completeDefinition = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    if (key === 'dashboard.priority.complete') return 'Klára'
    if (key === 'dashboard.priority.askEveryTime') return 'Spyrja í hvert sinn'
    if (key === 'dashboard.priority.choosePerformerTitle') return `Hver kláraði ${values?.task}?`
    if (key === 'dashboard.priority.workAs') return 'Vinna sem'
    if (key === 'dashboard.priority.filterPeople') return 'Sía eftir þátttakendum'
    if (key === 'dashboard.priority.clearFilter') return 'Hreinsa síu'
    if (key === 'common.cancel') return 'Hætta við'
    if (key === 'dashboard.points') return `${values?.count} stig`
    return key
  },
}))

vi.mock('@/lib/household-chores/actions', () => ({
  completeHouseholdChoreDefinitionAction: (input: unknown) => completeDefinition(input),
}))

const circleId = '82000000-0000-4000-8000-000000000001'
const definitionId = '86000000-0000-4000-8000-000000000001'
const emilId = '87000000-0000-4000-8000-000000000001'
const berglindId = '87000000-0000-4000-8000-000000000002'

const view: HouseholdChorePriorityDashboardView = {
  viewerType: 'member',
  ownParticipantId: berglindId,
  participants: [
    { participantId: berglindId, label: 'Berglind', identityMarker: 'current', isViewer: true },
    { participantId: emilId, label: 'Emil', identityMarker: 'current', isViewer: false },
  ],
  definitions: [{
    definitionId,
    title: 'Þrífa baðherbergi',
    description: null,
    materials: null,
    cadenceDays: 7,
    completionScope: 'per_participant',
    priorityDueAt: '2026-08-18T12:00:00.000Z',
    participantStates: [
      {
        participantId: berglindId,
        label: 'Berglind',
        points: 3,
        baselineAt: '2026-08-11T12:00:00.000Z',
        dueAt: '2026-08-18T12:00:00.000Z',
        latestCompletedAt: null,
        oldestOpenAssignmentId: null,
        oldestOpenAssignmentVersion: null,
        expectedStateToken: 'a'.repeat(64),
      },
      {
        participantId: emilId,
        label: 'Emil',
        points: 3,
        baselineAt: '2026-08-12T12:00:00.000Z',
        dueAt: '2026-08-19T12:00:00.000Z',
        latestCompletedAt: null,
        oldestOpenAssignmentId: null,
        oldestOpenAssignmentVersion: null,
        expectedStateToken: 'b'.repeat(64),
      },
    ],
    openAssignments: [],
    openAssignmentCount: 0,
  }],
}

describe('PrioritizedTaskList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    completeDefinition.mockResolvedValue({
      ok: true,
      data: { resourceId: 'assignment', version: '1', status: 'completed' },
    })
  })

  it('asks who completed the task when work-as is neutral', async () => {
    render(<PrioritizedTaskList circleId={circleId} view={view} initialNow="2026-08-19T08:00:00.000Z" />)

    fireEvent.click(screen.getByRole('button', { name: 'Klára' }))

    expect(screen.getByRole('dialog', { name: 'Hver kláraði Þrífa baðherbergi?' })).toBeInTheDocument()
    expect(completeDefinition).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /Emil/ }))
    await waitFor(() => expect(completeDefinition).toHaveBeenCalledWith(expect.objectContaining({
      circleId,
      definitionId,
      participantId: emilId,
      expectedStateToken: 'b'.repeat(64),
    })))
  })

  it('completes in one action for the selected work-as participant', async () => {
    render(<PrioritizedTaskList circleId={circleId} view={view} initialNow="2026-08-19T08:00:00.000Z" />)

    fireEvent.change(screen.getByLabelText('Vinna sem'), { target: { value: emilId } })
    fireEvent.click(screen.getByRole('button', { name: 'Klára' }))

    await waitFor(() => expect(completeDefinition).toHaveBeenCalledWith(expect.objectContaining({
      circleId,
      definitionId,
      participantId: emilId,
      expectedStateToken: 'b'.repeat(64),
    })))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(refresh).toHaveBeenCalled()
  })
})
