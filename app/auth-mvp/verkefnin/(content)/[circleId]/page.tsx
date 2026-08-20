import { notFound } from 'next/navigation'
import { unstable_noStore as noStore } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { CircleDashboard } from '@/components/household-chores/CircleDashboard'
import { HOUSEHOLD_CHORES_PATH } from '@/lib/household-chores/contracts'
import { guardHouseholdChoreAccess } from '@/lib/household-chores/guard'
import {
  HouseholdChoreRepositoryError,
  loadHouseholdChoreCircle,
} from '@/lib/household-chores/repository.server'
import {
  HouseholdChoreV2RepositoryError,
  loadHouseholdChorePriorityDashboardV2,
} from '@/lib/household-chores/repository-v2.server'
import { HouseholdChoreShell } from '../../HouseholdChoreShell'

export default async function HouseholdChoreCirclePage({
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
  let priorityView
  try {
    ;[view, priorityView] = await Promise.all([
      loadHouseholdChoreCircle(user.id, circleId),
      loadHouseholdChorePriorityDashboardV2(user.id, circleId),
    ])
  } catch (error) {
    if ((error instanceof HouseholdChoreRepositoryError
      || error instanceof HouseholdChoreV2RepositoryError)
      && (error.code === 'not_found' || error.code === 'not_allowed')) {
      notFound()
    }
    throw error
  }

  return (
    <HouseholdChoreShell
      title={view.circle.name}
      homeLabel={t('homeLabel')}
      backHref={HOUSEHOLD_CHORES_PATH}
      backLabel={t('common.back')}
    >
      <CircleDashboard circleId={circleId} view={view} priorityView={priorityView} />
    </HouseholdChoreShell>
  )
}
