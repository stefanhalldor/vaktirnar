import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HouseholdChoreV2PriorityDashboard } from '@/lib/household-chores/contracts-v2'
import { PrioritizedTaskList } from '../PrioritizedTaskList'

const refresh = vi.fn()
const completeDefinition = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}))

vi.mock('next-intl', () => ({
  useLocale: () => 'is',
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    const messages: Record<string, string> = {
      'dashboard.priority.heading': 'Forgangsraðaður verkefnalisti',
      'dashboard.priority.filterPeople': 'Sía eftir þátttakendum',
      'dashboard.priority.clearFilter': 'Hreinsa val',
      'dashboard.priority.matchMode': 'Hvernig valdir þátttakendur passa',
      'dashboard.priority.mode.and': 'OG',
      'dashboard.priority.mode.or': 'EÐA',
      'dashboard.priority.choosePerformer': 'Veldu hver kláraði',
      'dashboard.priority.choosePerformerDescription': 'Veldu þátttakandann.',
      'dashboard.priority.dueToday': 'Á að gera í dag',
      'dashboard.priority.noCadence': 'Tíðni ekki stillt',
      'dashboard.priority.everyoneDone': 'Allir búnir',
      'dashboard.priority.remainingForYou': 'Á eftir hjá þér',
      'dashboard.priority.doneForYou': 'Búið hjá þér',
      'performedDate.today': 'Í dag',
      'performedDate.yesterday': 'Í gær',
      'performedDate.todayInline': 'í dag',
      'performedDate.yesterdayInline': 'í gær',
      'performedDate.chooseDate': 'Velja dag',
      'performedDate.dateLabel': 'Dagsetning verks',
      'performedDate.sheetTitle': 'Hvenær var verkið unnið?',
      'performedDate.sheetDescription': 'Veldu dag.',
      'performedDate.useDate': 'Nota dagsetningu',
      'performedDate.resetToday': 'Setja á í dag',
      'common.cancel': 'Hætta við',
    }
    if (key === 'dashboard.priority.completeAria') return `Skrá ${values?.task} lokið`
    if (key === 'dashboard.priority.choosePerformerTitle') return `Hver kláraði ${values?.task}?`
    if (key === 'dashboard.priority.remainingNames') return `Á eftir hjá: ${values?.names}`
    if (key === 'dashboard.priority.remainingCount') return `Á eftir hjá ${values?.count}`
    if (key === 'dashboard.priority.completedAnnouncement') return `Skráð á ${values?.name} · unnið ${values?.date}`
    if (key === 'dashboard.priority.canWait') return `Má bíða í ${values?.count} daga`
    if (key === 'dashboard.priority.overdue') return `${values?.count} dögum yfir tíma`
    if (key === 'dashboard.points') return `${values?.count} stig`
    if (key === 'performedDate.context') return `Unnið: ${values?.date}`
    if (key.startsWith('errors.')) return key
    return messages[key] ?? key
  },
}))

vi.mock('@/lib/household-chores/actions-v2', () => ({
  completeHouseholdChoreDefinitionV2Action: (input: unknown) => completeDefinition(input),
}))

const circleId = '82000000-0000-4000-8000-000000000001'
const definitionId = '86000000-0000-4000-8000-000000000001'
const otherDefinitionId = '86000000-0000-4000-8000-000000000002'
const emilId = '87000000-0000-4000-8000-000000000001'
const berglindId = '87000000-0000-4000-8000-000000000002'

function memberState(participantId: string, label: string, token: string, remaining = true) {
  return {
    participantId,
    label,
    identityMarker: 'current' as const,
    points: 3,
    valueVersion: '1',
    baselineOn: '2026-08-12',
    dueOn: '2026-08-19',
    isRemaining: remaining,
    latestCompletionId: null,
    latestPerformedOn: null,
    recordedAt: null,
    oldestOpenAssignmentId: null,
    oldestOpenAssignmentVersion: null,
    expectedStateToken: token.repeat(64),
  }
}

const view: HouseholdChoreV2PriorityDashboard = {
  viewerType: 'member',
  ownParticipantId: berglindId,
  serverToday: '2026-08-19',
  nextDayBoundaryAt: '2099-08-20T00:00:00+00:00',
  participants: [
    { participantId: berglindId, label: 'Berglind', identityMarker: 'current', isViewer: true },
    { participantId: emilId, label: 'Emil', identityMarker: 'current', isViewer: false },
  ],
  definitions: [{
    definitionId,
    title: 'Þrífa baðherbergi',
    description: null,
    materials: null,
    version: '1',
    cadenceDays: 7,
    completionScope: 'per_participant',
    priorityDueOn: '2026-08-19',
    priorityDueAt: '2026-08-19T00:00:00+00:00',
    participantStates: [
      memberState(berglindId, 'Berglind', 'a'),
      memberState(emilId, 'Emil', 'b'),
    ],
    openAssignments: [],
    openAssignmentCount: 0,
    latestPerformer: null,
  }, {
    definitionId: otherDefinitionId,
    title: 'Ryksuga',
    description: null,
    materials: null,
    version: '1',
    cadenceDays: 7,
    completionScope: 'per_participant',
    priorityDueOn: '2026-08-19',
    priorityDueAt: '2026-08-19T00:00:00+00:00',
    participantStates: [memberState(berglindId, 'Berglind', 'c')],
    openAssignments: [],
    openAssignmentCount: 0,
    latestPerformer: null,
  }],
}

describe('PrioritizedTaskList v2', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    completeDefinition.mockResolvedValue({
      ok: true,
      data: {
        resourceId: '88000000-0000-4000-8000-000000000001',
        definitionId,
        participantId: emilId,
        version: '2',
        status: 'completed',
        completionSequence: '1',
        pointsDelta: 3,
        performedOn: '2026-08-19',
        recordedAt: '2026-08-19T12:00:00+00:00',
      },
    })
  })

  it('opens the eligible performer chooser when no participant is selected', async () => {
    render(<PrioritizedTaskList circleId={circleId} view={view} />)

    const completeButton = screen.getByRole('button', { name: 'Skrá Þrífa baðherbergi lokið' })
    fireEvent.click(completeButton)

    expect(screen.getByRole('dialog', { name: 'Hver kláraði Þrífa baðherbergi?' })).toBeInTheDocument()
    expect(completeDefinition).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /Emil/ }))
    await waitFor(() => expect(completeDefinition).toHaveBeenCalledWith(expect.objectContaining({
      circleId,
      definitionId,
      participantId: emilId,
      expectedStateToken: 'b'.repeat(64),
      performedOn: '2026-08-19',
    })))
    await waitFor(() => expect(completeButton).toHaveFocus())
  })

  it('uses one selected pill as direct performer and keeps a backdate through refresh', async () => {
    render(<PrioritizedTaskList circleId={circleId} view={view} />)

    fireEvent.click(screen.getByRole('button', { name: 'Emil' }))
    expect(screen.queryByText('Vinna sem')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Unnið: Í dag' }))
    fireEvent.click(screen.getByRole('button', { name: 'Í gær' }))
    fireEvent.click(screen.getByRole('button', { name: 'Skrá Þrífa baðherbergi lokið' }))

    await waitFor(() => expect(completeDefinition).toHaveBeenCalledWith(expect.objectContaining({
      participantId: emilId,
      performedOn: '2026-08-18',
    })))
    expect(screen.getByRole('button', { name: 'Unnið: Í gær' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Setja á í dag' })).toBeInTheDocument()
    expect(refresh).toHaveBeenCalled()
  })

  it('defaults 2+ filters to AND and restricts the chooser to selected eligible people', () => {
    render(<PrioritizedTaskList circleId={circleId} view={view} />)

    fireEvent.click(screen.getByRole('button', { name: 'Berglind' }))
    fireEvent.click(screen.getByRole('button', { name: 'Emil' }))
    expect(screen.getByRole('button', { name: 'OG' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('Ryksuga')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Skrá Þrífa baðherbergi lokið' }))
    expect(screen.getByRole('button', { name: /Berglind/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Emil/ })).toBeInTheDocument()
  })

  it('gives a child only the direct own-performer path', async () => {
    const childView: HouseholdChoreV2PriorityDashboard = {
      viewerType: 'child',
      ownParticipantId: emilId,
      serverToday: '2026-08-19',
      nextDayBoundaryAt: '2099-08-20T00:00:00+00:00',
      definitions: [{
        definitionId,
        title: 'Þrífa baðherbergi',
        description: null,
        materials: null,
        cadenceDays: 7,
        completionScope: 'per_participant',
        priorityDueOn: '2026-08-19',
        priorityDueAt: '2026-08-19T00:00:00+00:00',
        ownState: {
          participantId: emilId,
          label: 'Emil',
          points: 3,
          baselineOn: '2026-08-12',
          dueOn: '2026-08-19',
          isRemaining: true,
          latestCompletionId: null,
          latestPerformedOn: null,
          recordedAt: null,
          oldestOpenAssignmentId: null,
          oldestOpenAssignmentVersion: null,
          expectedStateToken: 'b'.repeat(64),
        },
      }],
    }
    render(<PrioritizedTaskList circleId={circleId} view={childView} />)

    expect(screen.queryByRole('group', { name: 'Sía eftir þátttakendum' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Skrá Þrífa baðherbergi lokið' }))

    await waitFor(() => expect(completeDefinition).toHaveBeenCalledWith(expect.objectContaining({
      participantId: emilId,
      expectedStateToken: 'b'.repeat(64),
    })))
    expect(screen.queryByRole('dialog', { name: /Hver kláraði/ })).not.toBeInTheDocument()
  })
})
