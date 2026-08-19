import { notFound } from 'next/navigation'
import { unstable_noStore as noStore } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { ChoreDefinitionList } from '@/components/household-chores/ChoreDefinitionList'
import { guardHouseholdChoreAccess } from '@/lib/household-chores/guard'
import { householdChoreCirclePath } from '@/lib/household-chores/paths'
import {
  HouseholdChoreRepositoryError,
  loadHouseholdChoreCircle,
} from '@/lib/household-chores/repository.server'
import { HouseholdChoreShell } from '../../../HouseholdChoreShell'

export default async function HouseholdChoreDefinitionsPage({
  params,
}: {
  params: Promise<{ circleId: string }>
}) {
  noStore()
  const [{ circleId }, { user }, t] = await Promise.all([
    params,
    guardHouseholdChoreAccess(),
    getTranslations('teskeid.householdChores'),
  ])
  let view
  try {
    view = await loadHouseholdChoreCircle(user.id, circleId)
  } catch (error) {
    if (error instanceof HouseholdChoreRepositoryError
      && (error.code === 'not_found' || error.code === 'not_allowed')) notFound()
    throw error
  }

  return (
    <HouseholdChoreShell
      title={t('definitions.title')}
      homeLabel={t('homeLabel')}
      backHref={householdChoreCirclePath(circleId)}
      backLabel={t('common.back')}
    >
      <ChoreDefinitionList circleId={circleId} view={view} />
    </HouseholdChoreShell>
  )
}
