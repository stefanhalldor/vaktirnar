import { notFound, redirect } from 'next/navigation'
import { unstable_noStore as noStore } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { ChoreAssignmentForm } from '@/components/household-chores/ChoreAssignmentForm'
import { guardHouseholdChoreAccess } from '@/lib/household-chores/guard'
import { householdChoreCirclePath } from '@/lib/household-chores/paths'
import {
  HouseholdChoreRepositoryError,
  loadHouseholdChoreCircle,
  loadHouseholdChoreDefinitionDetail,
} from '@/lib/household-chores/repository.server'
import { HouseholdChoreShell } from '../../../HouseholdChoreShell'

export default async function HouseholdChoreAssignPage({
  params,
  searchParams,
}: {
  params: Promise<{ circleId: string }>
  searchParams: Promise<{ definitionId?: string | string[] }>
}) {
  noStore()
  const [{ circleId }, query, { user }, t] = await Promise.all([
    params,
    searchParams,
    guardHouseholdChoreAccess(),
    getTranslations('teskeid.householdChores'),
  ])

  let circle
  try {
    circle = await loadHouseholdChoreCircle(user.id, circleId)
  } catch (error) {
    if (error instanceof HouseholdChoreRepositoryError
      && (error.code === 'not_found' || error.code === 'not_allowed')) {
      notFound()
    }
    throw error
  }
  if (circle.viewerType !== 'member') redirect(householdChoreCirclePath(circleId))

  const definitions = circle.definitions.filter((definition) => definition.status === 'active')
  const requestedId = typeof query.definitionId === 'string' ? query.definitionId : null
  const selectedDefinition = definitions.find((definition) => definition.definitionId === requestedId)
    ?? definitions[0]
    ?? null

  let detail = null
  if (selectedDefinition) {
    try {
      detail = await loadHouseholdChoreDefinitionDetail(
        user.id,
        circleId,
        selectedDefinition.definitionId,
      )
    } catch (error) {
      if (error instanceof HouseholdChoreRepositoryError
        && (error.code === 'not_found' || error.code === 'not_allowed')) {
        notFound()
      }
      throw error
    }
  }

  const eligibleValues = detail?.participantValues.flatMap((value) => (
    value.participantStatus === 'active'
      && value.valueStatus === 'active'
      && value.valueVersion !== '0'
      && value.points !== null
      && value.label !== null
      ? [{
          participantId: value.participantId,
          label: value.label,
          points: value.points,
          valueVersion: value.valueVersion,
        }]
      : []
  )) ?? []

  return (
    <HouseholdChoreShell
      title={t('assign.title')}
      homeLabel={t('homeLabel')}
      backHref={householdChoreCirclePath(circleId)}
      backLabel={t('common.back')}
    >
      <ChoreAssignmentForm
        key={[
          detail?.definition.definitionId ?? 'empty',
          detail?.definition.version ?? '0',
          ...eligibleValues.map((value) => `${value.participantId}:${value.valueVersion}`),
        ].join('|')}
        circleId={circleId}
        definitions={definitions}
        selectedDefinition={detail?.definition ?? null}
        eligibleValues={eligibleValues}
      />
    </HouseholdChoreShell>
  )
}
