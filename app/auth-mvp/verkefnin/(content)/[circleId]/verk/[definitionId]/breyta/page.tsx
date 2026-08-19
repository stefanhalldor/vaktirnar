import { notFound } from 'next/navigation'
import { unstable_noStore as noStore } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { ChoreDefinitionForm } from '@/components/household-chores/ChoreDefinitionForm'
import { ChoreDefinitionLifecycleActions } from '@/components/household-chores/ChoreDefinitionLifecycleActions'
import { ParticipantValueEditor } from '@/components/household-chores/ParticipantValueEditor'
import { guardHouseholdChoreAccess } from '@/lib/household-chores/guard'
import { householdChoreDefinitionPath } from '@/lib/household-chores/paths'
import {
  HouseholdChoreRepositoryError,
  loadHouseholdChoreDefinitionDetail,
} from '@/lib/household-chores/repository.server'
import { HouseholdChoreShell } from '../../../../../HouseholdChoreShell'

export default async function EditHouseholdChoreDefinitionPage({
  params,
}: {
  params: Promise<{ circleId: string; definitionId: string }>
}) {
  noStore()
  const [{ circleId, definitionId }, { user }, t] = await Promise.all([
    params,
    guardHouseholdChoreAccess(),
    getTranslations('teskeid.householdChores'),
  ])
  let detail
  try {
    detail = await loadHouseholdChoreDefinitionDetail(user.id, circleId, definitionId)
  } catch (error) {
    if (error instanceof HouseholdChoreRepositoryError
      && (error.code === 'not_found' || error.code === 'not_allowed')) notFound()
    throw error
  }

  return (
    <HouseholdChoreShell
      title={t('definitions.edit')}
      homeLabel={t('homeLabel')}
      backHref={householdChoreDefinitionPath(circleId, definitionId)}
      backLabel={t('common.back')}
    >
      <div className="space-y-8">
        <ChoreDefinitionForm
          key={`form:${detail.definition.version}`}
          circleId={circleId}
          definition={detail.definition}
        />
        <ParticipantValueEditor
          circleId={circleId}
          definitionId={definitionId}
          definitionVersion={detail.definition.version}
          values={detail.participantValues}
        />
        <ChoreDefinitionLifecycleActions circleId={circleId} definition={detail.definition} />
      </div>
    </HouseholdChoreShell>
  )
}
