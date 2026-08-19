import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { ChoreDefinitionForm } from '@/components/household-chores/ChoreDefinitionForm'
import { guardHouseholdChoreAccess } from '@/lib/household-chores/guard'
import { householdChoreDefinitionsPath } from '@/lib/household-chores/paths'
import {
  HouseholdChoreRepositoryError,
  loadHouseholdChoreCircle,
} from '@/lib/household-chores/repository.server'
import { HouseholdChoreShell } from '../../../../HouseholdChoreShell'

export default async function NewHouseholdChoreDefinitionPage({
  params,
}: {
  params: Promise<{ circleId: string }>
}) {
  const [{ circleId }, { user }, t] = await Promise.all([
    params,
    guardHouseholdChoreAccess(),
    getTranslations('teskeid.householdChores'),
  ])
  try {
    const view = await loadHouseholdChoreCircle(user.id, circleId)
    if (view.viewerType !== 'member') notFound()
  } catch (error) {
    if (error instanceof HouseholdChoreRepositoryError
      && (error.code === 'not_found' || error.code === 'not_allowed')) notFound()
    throw error
  }

  return (
    <HouseholdChoreShell
      title={t('definitions.new')}
      homeLabel={t('homeLabel')}
      backHref={householdChoreDefinitionsPath(circleId)}
      backLabel={t('common.back')}
    >
      <ChoreDefinitionForm circleId={circleId} />
    </HouseholdChoreShell>
  )
}
