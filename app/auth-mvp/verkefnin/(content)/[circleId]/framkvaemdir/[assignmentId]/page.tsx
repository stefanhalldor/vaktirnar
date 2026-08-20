import { notFound } from 'next/navigation'
import { unstable_noStore as noStore } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { ChoreAssignmentDetailV2 } from '@/components/household-chores/ChoreAssignmentDetailV2'
import type { ChoreAssignmentActionState } from '@/components/household-chores/ChoreAssignmentActions'
import type { ChoreAssignmentDateActionState } from '@/components/household-chores/ChoreAssignmentDateActions'
import { guardHouseholdChoreAccess } from '@/lib/household-chores/guard'
import {
  householdChoreAssignmentPath,
  householdChoreCirclePath,
} from '@/lib/household-chores/paths'
import { reykjavikDateOnlyFromInstant } from '@/lib/household-chores/priority-v2'
import {
  HouseholdChoreV2RepositoryError,
  loadHouseholdChoreAssignmentTimelineV2,
  loadHouseholdChoreAssignmentV2,
  loadHouseholdChoreDefinitionDetailV3,
  loadHouseholdChorePriorityDashboardV2,
} from '@/lib/household-chores/repository-v2.server'
import { HouseholdChoreShell } from '../../../../HouseholdChoreShell'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export default async function HouseholdChoreAssignmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ circleId: string; assignmentId: string }>
  searchParams: Promise<{ cursorAt?: string; cursorId?: string }>
}) {
  noStore()
  const [{ circleId, assignmentId }, query, { user }, t] = await Promise.all([
    params,
    searchParams,
    guardHouseholdChoreAccess(),
    getTranslations('teskeid.householdChores'),
  ])
  const cursor = query.cursorAt && query.cursorId
    && Number.isFinite(Date.parse(query.cursorAt)) && UUID.test(query.cursorId)
    ? { occurredAt: query.cursorAt, eventId: query.cursorId }
    : null

  let detail
  let dashboard
  try {
    ;[detail, dashboard] = await Promise.all([
      loadHouseholdChoreAssignmentV2(user.id, circleId, assignmentId),
      loadHouseholdChorePriorityDashboardV2(user.id, circleId),
    ])
  } catch (error) {
    if (error instanceof HouseholdChoreV2RepositoryError
      && (error.code === 'not_found' || error.code === 'not_allowed')) notFound()
    throw error
  }

  let timeline = detail.timeline
  if (cursor) {
    try {
      timeline = await loadHouseholdChoreAssignmentTimelineV2(user.id, circleId, assignmentId, {
        cursor,
        limit: 20,
      })
    } catch (error) {
      if (error instanceof HouseholdChoreV2RepositoryError
        && (error.code === 'not_found' || error.code === 'not_allowed')) notFound()
      throw error
    }
  }

  const assignment = detail.assignment
  const nextTimelineHref = timeline.nextCursor
    ? `${householdChoreAssignmentPath(circleId, assignmentId)}?cursorAt=${encodeURIComponent(timeline.nextCursor.occurredAt)}&cursorId=${timeline.nextCursor.eventId}`
    : null

  let repeatContext: ChoreAssignmentActionState['repeatContext'] = null
  if (detail.viewerType === 'member' && assignment.status !== 'open') {
    const memberAssignment = detail.assignment
    try {
      const definition = await loadHouseholdChoreDefinitionDetailV3(
        user.id,
        circleId,
        memberAssignment.definitionId,
      )
      if (definition.viewerType === 'member') {
        const value = definition.definition.participantStates.find(
          item => item.participantId === memberAssignment.participantId,
        )
        if (value) {
          repeatContext = {
            definitionVersion: definition.definition.version,
            valueVersion: value.valueVersion,
          }
        }
      }
    } catch (error) {
      if (!(error instanceof HouseholdChoreV2RepositoryError
        && (error.code === 'not_found' || error.code === 'not_allowed'))) throw error
    }
  }

  let legacyActionState: ChoreAssignmentActionState | null = null
  if (detail.viewerType === 'member') {
    const memberAssignment = detail.assignment
    legacyActionState = {
      circleId,
      assignmentId,
      version: memberAssignment.version,
      canComplete: false,
      canCancelAsMember: memberAssignment.status === 'open',
      canCancelOwn: false,
      canUndo: memberAssignment.status === 'completed',
      repeatContext,
    }
  } else if (detail.assignment.version !== null && detail.assignment.canCancel) {
    legacyActionState = {
      circleId,
      assignmentId,
      version: detail.assignment.version,
      canComplete: false,
      canCancelAsMember: false,
      canCancelOwn: true,
      canUndo: false,
      repeatContext: null,
    }
  }

  const version = detail.assignment.version
  const completionSequence = detail.assignment.completionSequence
  const canComplete = detail.viewerType === 'member'
    ? detail.assignment.status === 'open'
    : detail.assignment.canComplete
  const correction = assignment.canCorrectDate
    && assignment.performedOn !== null
    && version !== null
    && completionSequence !== null
    ? { completionSequence, performedOn: assignment.performedOn }
    : null
  const dateActionState: ChoreAssignmentDateActionState | null = version !== null
    && (canComplete || correction !== null)
    ? {
        circleId,
        assignmentId,
        version,
        serverToday: dashboard.serverToday,
        ...(assignment.origin === 'quick_completed'
          ? {}
          : { minimumPerformedOn: reykjavikDateOnlyFromInstant(assignment.createdAt) }),
        canComplete,
        correction,
      }
    : null

  return (
    <HouseholdChoreShell
      title={assignment.title}
      homeLabel={t('homeLabel')}
      backHref={householdChoreCirclePath(circleId)}
      backLabel={t('common.back')}
    >
      <ChoreAssignmentDetailV2
        circleId={circleId}
        detail={detail}
        timeline={timeline}
        nextTimelineHref={nextTimelineHref}
        dateActionState={dateActionState}
        legacyActionState={legacyActionState}
      />
    </HouseholdChoreShell>
  )
}
