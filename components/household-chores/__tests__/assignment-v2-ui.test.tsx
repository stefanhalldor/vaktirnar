import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HouseholdChoreV2HistoryPage } from '@/lib/household-chores/contracts-v2'
import { ChoreAssignmentDateActions } from '../ChoreAssignmentDateActions'
import { ChoreHistoryListV2 } from '../ChoreHistoryListV2'

const refresh = vi.fn()
const completeAssignment = vi.fn()
const correctDate = vi.fn()

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('next-intl', () => ({
  useLocale: () => 'is',
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    const messages: Record<string, string> = {
      'assignment.completeHeading': 'Skrá verklok',
      'assignment.completionDateHeading': 'Dagsetning verkloka',
      'assignment.complete': 'Merkja lokið',
      'assignment.completedNotice': 'Verklokin voru skráð.',
      'assignment.correctDate': 'Breyta dagsetningu',
      'assignment.correctDateTitle': 'Breyta dagsetningu verkloka',
      'assignment.correctDateDisclosure': 'Breytir aðeins dagsetningu.',
      'assignment.saveCorrectedDate': 'Vista dagsetningu',
      'assignment.correctionSaved': 'Dagsetningu breytt.',
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
      'common.saving': 'Vista…',
      'history.event.completion_date_corrected': 'Dagsetning verkloka leiðrétt',
      'history.event.completion_reversed': 'Verklok afturkölluð',
      'history.noPointChange': 'Engin breyting á stigum',
      'history.reopened': 'Verkefnið var opnað aftur',
      'history.notReopened': 'Verkefnið var ekki opnað aftur',
      'history.recordedBySystem': 'Skráð sjálfkrafa',
      'history.recordedByFormerMember': 'Skráð af fyrrverandi meðlimi',
      'history.older': 'Skoða eldri færslur',
      'history.empty': 'Engin saga',
      'common.formerMember': 'Fyrrverandi meðlimur',
    }
    if (key === 'performedDate.context') return `Unnið: ${values?.date}`
    if (key === 'history.correctedFromTo') return `Dagsetningu breytt úr ${values?.previous} í ${values?.date}`
    if (key === 'history.reversedWorkDate') return `Afturkölluð verklok voru unnin ${values?.date}`
    if (key === 'history.pointsRemoved') return `${values?.count} stig dregin frá`
    if (key === 'history.completionNumber') return `Verklok nr. ${values?.count}`
    if (key === 'history.origin.quick_completed') return 'Klárað beint af verkefnalista'
    if (key === 'history.recordedBy') return `Skráð af ${values?.name}`
    if (key.startsWith('errors.')) return key
    return messages[key] ?? key
  },
}))
vi.mock('@/lib/household-chores/actions-v2', () => ({
  completeHouseholdChoreAssignmentV2Action: (input: unknown) => completeAssignment(input),
  correctHouseholdChoreCompletionDateAction: (input: unknown) => correctDate(input),
}))

const circleId = '82000000-0000-4000-8000-000000000001'
const assignmentId = '83000000-0000-4000-8000-000000000001'

describe('SQL146 assignment UI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    completeAssignment.mockResolvedValue({ ok: true, data: { performedOn: '2026-08-18' } })
    correctDate.mockResolvedValue({ ok: true, data: { performedOn: '2026-08-17' } })
  })

  it('completes an assignment with the selected date and exact expected version', async () => {
    render(<ChoreAssignmentDateActions state={{
      circleId,
      assignmentId,
      version: '7',
      serverToday: '2026-08-19',
      canComplete: true,
      correction: null,
    }} />)

    fireEvent.click(screen.getByRole('button', { name: 'Unnið: Í dag' }))
    fireEvent.click(screen.getByRole('button', { name: 'Í gær' }))
    fireEvent.click(screen.getByRole('button', { name: 'Merkja lokið' }))

    await waitFor(() => expect(completeAssignment).toHaveBeenCalledWith(expect.objectContaining({
      circleId,
      assignmentId,
      expectedVersion: '7',
      performedOn: '2026-08-18',
    })))
    expect(refresh).toHaveBeenCalled()
  })

  it('corrects only through the frozen version, sequence and work date inputs', async () => {
    render(<ChoreAssignmentDateActions state={{
      circleId,
      assignmentId,
      version: '9',
      serverToday: '2026-08-19',
      canComplete: false,
      correction: { completionSequence: 3, performedOn: '2026-08-18' },
    }} />)

    fireEvent.click(screen.getByRole('button', { name: 'Breyta dagsetningu' }))
    fireEvent.change(screen.getByLabelText('Dagsetning verks'), { target: { value: '2026-08-17' } })
    fireEvent.click(screen.getByRole('button', { name: 'Vista dagsetningu' }))

    await waitFor(() => expect(correctDate).toHaveBeenCalledWith(expect.objectContaining({
      circleId,
      assignmentId,
      expectedVersion: '9',
      completionSequence: 3,
      performedOn: '2026-08-17',
    })))
    expect(refresh).toHaveBeenCalled()
  })

  it('renders correction and reversal work dates without treating correction as points', () => {
    const base = {
      assignmentId,
      title: 'Þrífa',
      participantLabel: 'Emil',
      participantIdentityMarker: 'current' as const,
      assignmentOrigin: 'quick_completed' as const,
      snapshotPoints: 3,
      actorKind: 'member' as const,
      actorLabel: 'Stebbi',
    }
    const page: HouseholdChoreV2HistoryPage = {
      hasMore: false,
      nextCursor: null,
      items: [{
        ...base,
        eventId: '84000000-0000-4000-8000-000000000001',
        occurredAt: '2026-08-19T12:00:00+00:00',
        eventType: 'completion_date_corrected',
        statusAfter: 'completed',
        completionSequence: 1,
        previousPerformedOn: '2026-08-18',
        performedOn: '2026-08-17',
      }, {
        ...base,
        eventId: '84000000-0000-4000-8000-000000000002',
        occurredAt: '2026-08-19T13:00:00+00:00',
        eventType: 'completion_reversed',
        statusAfter: 'open',
        completionSequence: 1,
        reversedPerformedOn: '2026-08-17',
        pointsDelta: -3,
        reopenOutcome: 'open',
      }],
    }

    render(<ChoreHistoryListV2 circleId={circleId} page={page} nextHref={null} />)
    expect(screen.getByText('Dagsetningu breytt úr 18. ágúst 2026 í 17. ágúst 2026')).toBeInTheDocument()
    expect(screen.getByText('Engin breyting á stigum')).toBeInTheDocument()
    expect(screen.getByText('Afturkölluð verklok voru unnin 17. ágúst 2026')).toBeInTheDocument()
  })
})
