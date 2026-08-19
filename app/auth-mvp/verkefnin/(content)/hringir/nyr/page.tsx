import { getTranslations } from 'next-intl/server'
import { CreateCircleForm } from '@/components/household-chores/CreateCircleForm'
import { HOUSEHOLD_CHORES_PATH } from '@/lib/household-chores/contracts'
import { HouseholdChoreShell } from '../../../HouseholdChoreShell'

export default async function NewHouseholdChoreCirclePage() {
  const t = await getTranslations('teskeid.householdChores')
  return (
    <HouseholdChoreShell
      title={t('circleForm.title')}
      homeLabel={t('homeLabel')}
      backHref={HOUSEHOLD_CHORES_PATH}
      backLabel={t('common.back')}
    >
      <CreateCircleForm />
    </HouseholdChoreShell>
  )
}
