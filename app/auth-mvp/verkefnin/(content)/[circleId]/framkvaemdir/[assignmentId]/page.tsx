import { notFound } from 'next/navigation'
import { unstable_noStore as noStore } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { ChoreAssignmentDetail } from '@/components/household-chores/ChoreAssignmentDetail'
import type { ChoreAssignmentActionState } from '@/components/household-chores/ChoreAssignmentActions'
import { guardHouseholdChoreAccess } from '@/lib/household-chores/guard'
import {
  householdChoreAssignmentPath,
  householdChoreCirclePath,
} from '@/lib/household-chores/paths'
import {
  HouseholdChoreRepositoryError,
  loadHouseholdChoreAssignment,
  loadHouseholdChoreAssignmentTimeline,
  loadHouseholdChoreDefinitionDetail,
} from '@/lib/household-chores/repository.server'
import { HouseholdChoreShell } from '../../../../HouseholdChoreShell'

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
    && Number.isFinite(Date.parse(query.cursorAt))
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(query.cursorId)
    ? { occurredAt: query.cursorAt, eventId: query.cursorId }
    : null

  let detail
  let timeline
  try {
    ;[detail, timeline] = await Promise.all([
      loadHouseholdChoreAssignment(user.id, circleId, assignmentId),
      loadHouseholdChoreAssignmentTimeline(user.id, circleId, assignmentId, {
        cursor,
        limit: 20,
      }),
    ])
  } catch (error) {
    if (error instanceof HouseholdChoreRepositoryError
      && (error.code === 'not_found' || error.code === 'not_allowed')) {
      notFound()
    }
    throw error
  }

  const nextTimelineHref = timeline.nextCursor
    ? `${householdChoreAssignmentPath(circleId, assignmentId)}?cursorAt=${encodeURIComponent(timeline.nextCursor.occurredAt)}&cursorId=${timeline.nextCursor.eventId}`
    : null

  const assignment = detail.assignment
  let repeatContext: ChoreAssignmentActionState['repeatContext'] = null
  if (detail.viewerType === 'member' && detail.assignment.status !== 'open') {
    try {
      const definition = await loadHouseholdChoreDefinitionDetail(
        user.id,
        circleId,
        detail.assignment.definitionId,
      )
      const value = definition.participantValues.find(
        (item) => item.participantId === detail.assignment.participantId,
      )
      if (definition.definition.status === 'active'
        && value?.participantStatus === 'active'
        && value.valueStatus === 'active'
        && value.valueVersion !== '0') {
        repeatContext = {
          definitionVersion: definition.definition.version,
          valueVersion: value.valueVersion,
        }
      }
    } catch (error) {
      if (!(error instanceof HouseholdChoreRepositoryError
        && (error.code === 'not_found' || error.code === 'not_allowed'))) {
        throw error
      }
    }
  }

  let actionState: ChoreAssignmentActionState | null = null
  if (detail.viewerType === 'member') {
    actionState = {
        circleId,
        assignmentId,
        version: detail.assignment.version,
        canComplete: detail.assignment.status === 'open',
        canCancelAsMember: detail.assignment.status === 'open',
        canCancelOwn: false,
        canUndo: detail.assignment.status === 'completed',
        repeatContext,
      }
  } else if (detail.assignment.version !== null
    && (detail.assignment.canComplete || detail.assignment.canCancel)) {
    actionState = {
      circleId,
      assignmentId,
      version: detail.assignment.version,
      canComplete: detail.assignment.canComplete,
      canCancelAsMember: false,
      canCancelOwn: detail.assignment.canCancel,
      canUndo: false,
      repeatContext: null,
    }
  }

  return (
    <HouseholdChoreShell
      title={assignment.title}
      homeLabel={t('homeLabel')}
      backHref={householdChoreCirclePath(circleId)}
      backLabel={t('common.back')}
    >
      <ChoreAssignmentDetail
        circleId={circleId}
        assignment={{
          title: assignment.title,
          description: assignment.description,
          materials: assignment.materials,
          participantLabel: assignment.participantLabel,
          participantIdentityMarker: assignment.participantIdentityMarker,
          points: assignment.points,
          status: assignment.status,
          createdAt: assignment.createdAt,
          completedAt: assignment.completedAt,
          cancelledAt: assignment.cancelledAt,
        }}
        timeline={timeline}
        nextTimelineHref={nextTimelineHref}
        actionState={actionState}
      />
    </HouseholdChoreShell>
  )
}
