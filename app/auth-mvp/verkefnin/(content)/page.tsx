import { unstable_noStore as noStore } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { CircleList } from '@/components/household-chores/CircleList'
import { TeskeidUnreadSection } from '@/components/teskeid/TeskeidUnreadSection.server'
import { guardHouseholdChoreAccess } from '@/lib/household-chores/guard'
import { loadHouseholdChoreRoot } from '@/lib/household-chores/repository.server'
import { HouseholdChoreShell } from '../HouseholdChoreShell'

export default async function HouseholdChoresPage() {
  noStore()
  const [{ user }, t] = await Promise.all([
    guardHouseholdChoreAccess(),
    getTranslations('teskeid.householdChores'),
  ])
  const view = await loadHouseholdChoreRoot(user.id)

  return (
    <HouseholdChoreShell title={t('title')} homeLabel={t('homeLabel')}>
      <TeskeidUnreadSection user={user} source="heimilisverkin" />
      <CircleList view={view} />
    </HouseholdChoreShell>
  )
}
