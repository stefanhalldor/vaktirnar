import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { HouseholdChoreHistoryPage } from '@/lib/household-chores/contracts'

vi.mock('next-intl', () => ({
  useLocale: () => 'is',
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    const templates: Record<string, string> = {
      'common.formerMember': 'Fyrrverandi meðlimur',
      'history.completedBy': `Lokið af ${values?.name}`,
      'history.completionNumber': `Verklok nr. ${values?.count}`,
      'history.event.cancelled': 'Hætt við verk',
      'history.event.completed': 'Verki lokið',
      'history.event.completion_reversed': 'Verklok afturkölluð',
      'history.noPoints': 'Engin stig skráð',
      'history.notReopened': 'Verkið var ekki opnað aftur',
      'history.origin.member_assigned': 'Úthlutað af fullum meðlimi',
      'history.origin.self_assigned': 'Tekið að sér',
      'history.pointsAdded': `${values?.count} stigum bætt við`,
      'history.pointsRemoved': `${values?.count} stig dregin frá`,
      'history.recordedBy': `Skráð af ${values?.name}`,
      'history.recordedByFormerMember': 'Skráð af fyrrverandi meðlimi',
    }
    return templates[key] ?? key
  },
}))

import { ChoreHistoryList } from '@/components/household-chores/ChoreHistoryList'

const CIRCLE_ID = '10000000-0000-4000-8000-000000000001'
const ASSIGNMENT_ID = '20000000-0000-4000-8000-000000000001'

const page: HouseholdChoreHistoryPage = {
  hasMore: false,
  nextCursor: null,
  items: [
    {
      eventId: '30000000-0000-4000-8000-000000000001',
      assignmentId: ASSIGNMENT_ID,
      title: 'Þrífa baðherbergi',
      eventType: 'completed',
      occurredAt: '2026-08-18T08:00:00.000Z',
      participantLabel: 'Anna',
      participantIdentityMarker: 'current',
      assignmentOrigin: 'self_assigned',
      snapshotPoints: 7,
      statusAfter: 'completed',
      actorKind: 'participant',
      actorLabel: 'Anna',
      completionSequence: 1,
      completedAt: '2026-08-18T08:00:00.000Z',
      pointsDelta: 7,
      cancellationReason: null,
      reopenOutcome: null,
    },
    {
      eventId: '30000000-0000-4000-8000-000000000002',
      assignmentId: ASSIGNMENT_ID,
      title: 'Þrífa baðherbergi',
      eventType: 'completion_reversed',
      occurredAt: '2026-08-18T09:00:00.000Z',
      participantLabel: null,
      participantIdentityMarker: 'former_member',
      assignmentOrigin: 'self_assigned',
      snapshotPoints: 7,
      statusAfter: 'cancelled',
      actorKind: 'former_member',
      actorLabel: null,
      completionSequence: 1,
      completedAt: null,
      pointsDelta: -7,
      cancellationReason: null,
      reopenOutcome: 'cancelled',
    },
    {
      eventId: '30000000-0000-4000-8000-000000000003',
      assignmentId: ASSIGNMENT_ID,
      title: 'Þrífa baðherbergi',
      eventType: 'cancelled',
      occurredAt: '2026-08-18T10:00:00.000Z',
      participantLabel: 'Anna',
      participantIdentityMarker: 'current',
      assignmentOrigin: 'member_assigned',
      snapshotPoints: 7,
      statusAfter: 'cancelled',
      actorKind: 'member',
      actorLabel: 'Bjarni',
      completionSequence: null,
      completedAt: null,
      pointsDelta: null,
      cancellationReason: 'member_cancelled',
      reopenOutcome: null,
    },
  ],
}

describe('Household Chores history UI', () => {
  it('shows immutable title, actor, origin and event-specific point semantics', () => {
    render(<ChoreHistoryList circleId={CIRCLE_ID} page={page} nextHref={null} />)

    expect(screen.getAllByText('Þrífa baðherbergi')).toHaveLength(3)
    expect(screen.getByText('Lokið af Anna')).toBeInTheDocument()
    expect(screen.getByText(/7 stigum bætt við/)).toBeInTheDocument()
    expect(screen.getByText(/7 stig dregin frá/)).toBeInTheDocument()
    expect(screen.getByText(/Engin stig skráð/)).toBeInTheDocument()
    expect(screen.getByText('Skráð af fyrrverandi meðlimi')).toBeInTheDocument()
    expect(screen.getByText('Verkið var ekki opnað aftur')).toBeInTheDocument()
    expect(screen.getAllByText(/Tekið að sér/)).toHaveLength(2)
    expect(screen.getByText(/Úthlutað af fullum meðlimi/)).toBeInTheDocument()

    const assignmentLinks = screen.getAllByRole('link')
    expect(assignmentLinks[0]).toHaveAccessibleName(/Verki lokið.*Anna/)
    expect(assignmentLinks[0])
      .toHaveAttribute('href', `/auth-mvp/verkefnin/${CIRCLE_ID}/framkvaemdir/${ASSIGNMENT_ID}`)
  })
})
