import { notFound } from 'next/navigation'
import { unstable_noStore as noStore } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { CircleInvitationConsent } from '@/components/household-chores/CircleInvitationConsent'
import {
  canUseHouseholdChores,
  guardHouseholdChoreSession,
} from '@/lib/household-chores/guard'
import { householdChoreMembershipsPath } from '@/lib/household-chores/paths'
import {
  HouseholdChoreRepositoryError,
  loadHouseholdChoreInvitationPreview,
} from '@/lib/household-chores/repository.server'
import { HouseholdChoreShell } from '../../HouseholdChoreShell'

export default async function HouseholdChoreInvitationPage({
  params,
}: {
  params: Promise<{ invitationId: string }>
}) {
  noStore()
  const [{ invitationId }, { user }, t] = await Promise.all([
    params,
    guardHouseholdChoreSession(),
    getTranslations('teskeid.householdChores'),
  ])

  let invitation
  try {
    invitation = await loadHouseholdChoreInvitationPreview(user.id, invitationId)
  } catch (error) {
    if (error instanceof HouseholdChoreRepositoryError
      && (error.code === 'not_found' || error.code === 'not_allowed')) {
      notFound()
    }
    throw error
  }
  const acceptAvailable = invitation.acceptAvailable
    && await canUseHouseholdChores(user)

  return (
    <HouseholdChoreShell
      title={t('invitation.title')}
      homeLabel={t('homeLabel')}
      backHref={householdChoreMembershipsPath()}
      backLabel={t('common.back')}
    >
      <CircleInvitationConsent
        key={invitation.version}
        invitation={invitation}
        acceptAvailable={acceptAvailable}
      />
    </HouseholdChoreShell>
  )
}
