import { notFound } from 'next/navigation'
import { unstable_noStore as noStore } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { ChildSelfServiceList } from '@/components/household-chores/ChildSelfServiceList'
import { guardHouseholdChoreAccess } from '@/lib/household-chores/guard'
import { householdChoreCirclePath } from '@/lib/household-chores/paths'
import {
  HouseholdChoreRepositoryError,
  loadHouseholdChoreSelfService,
} from '@/lib/household-chores/repository.server'
import { HouseholdChoreShell } from '../../../HouseholdChoreShell'

export default async function HouseholdChoreSelfServicePage({
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
    view = await loadHouseholdChoreSelfService(user.id, circleId)
  } catch (error) {
    if (error instanceof HouseholdChoreRepositoryError
      && (error.code === 'not_found' || error.code === 'not_allowed')) {
      notFound()
    }
    throw error
  }

  return (
    <HouseholdChoreShell
      title={t('selfService.title')}
      homeLabel={t('homeLabel')}
      backHref={householdChoreCirclePath(circleId)}
      backLabel={t('common.back')}
    >
      <ChildSelfServiceList view={view} />
    </HouseholdChoreShell>
  )
}
