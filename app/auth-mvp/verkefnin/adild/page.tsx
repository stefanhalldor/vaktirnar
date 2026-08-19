import { unstable_noStore as noStore } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { MembershipAccessList } from '@/components/household-chores/MembershipAccessList'
import {
  canUseHouseholdChores,
  guardHouseholdChoreSession,
} from '@/lib/household-chores/guard'
import { loadHouseholdChoreMemberships } from '@/lib/household-chores/repository.server'
import { HouseholdChoreShell } from '../HouseholdChoreShell'

export default async function HouseholdChoreMembershipsPage() {
  noStore()
  const [{ user }, t] = await Promise.all([
    guardHouseholdChoreSession(),
    getTranslations('teskeid.householdChores'),
  ])
  const [view, contentAvailable] = await Promise.all([
    loadHouseholdChoreMemberships(user.id),
    canUseHouseholdChores(user),
  ])

  return (
    <HouseholdChoreShell
      title={t('membership.title')}
      homeLabel={t('homeLabel')}
      backHref="/auth-mvp/minn-profill"
      backLabel={t('common.back')}
    >
      <MembershipAccessList view={view} contentAvailable={contentAvailable} />
    </HouseholdChoreShell>
  )
}
