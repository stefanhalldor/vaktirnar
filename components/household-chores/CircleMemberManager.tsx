'use client'

import { useTranslations } from 'next-intl'
import type {
  HouseholdChoreInviteCandidatePage,
  HouseholdChoreMemberCircleView,
} from '@/lib/household-chores/contracts'
import {
  HouseholdChorePersonPicker,
  type HouseholdChoreInviteCandidateLoader,
} from './HouseholdChorePersonPicker'
import { HouseholdChorePeopleList } from './HouseholdChorePeopleList'

export type { HouseholdChoreInviteCandidateLoader } from './HouseholdChorePersonPicker'

export function CircleMemberManager({
  view,
  inviteCandidates,
  loadInviteCandidates,
}: {
  view: HouseholdChoreMemberCircleView
  inviteCandidates: HouseholdChoreInviteCandidatePage
  loadInviteCandidates: HouseholdChoreInviteCandidateLoader
}) {
  const t = useTranslations('teskeid.householdChores')
  const circleId = view.circle.circleId

  return (
    <div className="space-y-8">
      <HouseholdChorePersonPicker
        circleId={circleId}
        inviteCandidates={inviteCandidates}
        loadInviteCandidates={loadInviteCandidates}
      />

      <section aria-labelledby="household-people-heading" className="space-y-3">
        <h2 id="household-people-heading" className="text-base font-semibold">
          {t('manage.peopleHeading')}
        </h2>
        <HouseholdChorePeopleList
          circleId={circleId}
          memberships={view.memberships}
          pendingInvitations={view.pendingInvitations}
          participants={view.participants}
        />
      </section>
    </div>
  )
}
