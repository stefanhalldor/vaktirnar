import { redirect } from 'next/navigation'
import { unstable_noStore as noStore } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import {
  CircleMemberManager,
  type HouseholdChoreInviteCandidateLoader,
} from '@/components/household-chores/CircleMemberManager'
import { CircleRenameForm } from '@/components/household-chores/CircleRenameForm'
import { HOUSEHOLD_CHORES_PATH } from '@/lib/household-chores/contracts'
import { guardHouseholdChoreAccess } from '@/lib/household-chores/guard'
import { householdChoreCirclePath } from '@/lib/household-chores/paths'
import { loadHouseholdChoreInviteCandidates } from '@/lib/household-chores/relationships.server'
import {
  HouseholdChoreRepositoryError,
  loadHouseholdChoreCircle,
} from '@/lib/household-chores/repository.server'
import { HouseholdChoreShell } from '../../../HouseholdChoreShell'

export default async function HouseholdChorePeoplePage({
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
      && (error.code === 'not_found' || error.code === 'not_allowed')) {
      redirect(HOUSEHOLD_CHORES_PATH)
    }
    throw error
  }

  // This branch runs on the server before any management DTO is handed to a
  // Client Component. A child therefore receives only the safe circle route.
  if (view.viewerType !== 'member') {
    redirect(householdChoreCirclePath(circleId))
  }

  let inviteCandidates
  try {
    inviteCandidates = await loadHouseholdChoreInviteCandidates(user.id, circleId, { limit: 50 })
  } catch (error) {
    if (error instanceof HouseholdChoreRepositoryError
      && (error.code === 'not_found' || error.code === 'not_allowed')) {
      redirect(HOUSEHOLD_CHORES_PATH)
    }
    throw error
  }

  const loadInviteCandidates: HouseholdChoreInviteCandidateLoader = async (cursor) => {
    'use server'
    noStore()
    const { user: currentUser } = await guardHouseholdChoreAccess()
    try {
      const currentView = await loadHouseholdChoreCircle(currentUser.id, circleId)
      if (currentView.viewerType !== 'member') {
        return { ok: false, error: 'access_changed' }
      }
      const data = await loadHouseholdChoreInviteCandidates(currentUser.id, circleId, {
        cursor,
        limit: 50,
      })
      return { ok: true, data }
    } catch (error) {
      if (error instanceof HouseholdChoreRepositoryError
        && (error.code === 'not_found'
          || error.code === 'not_allowed'
          || error.code === 'feature_disabled')) {
        return { ok: false, error: 'access_changed' }
      }
      return { ok: false, error: 'load_failed' }
    }
  }

  return (
    <HouseholdChoreShell
      title={t('manage.title')}
      homeLabel={t('homeLabel')}
      backHref={householdChoreCirclePath(circleId)}
      backLabel={t('common.back')}
    >
      <div className="space-y-10">
        <CircleMemberManager
          view={view}
          inviteCandidates={inviteCandidates}
          loadInviteCandidates={loadInviteCandidates}
        />
        <CircleRenameForm
          key={`${circleId}:${view.circle.version}`}
          circleId={circleId}
          initialName={view.circle.name}
          version={view.circle.version}
        />
      </div>
    </HouseholdChoreShell>
  )
}
