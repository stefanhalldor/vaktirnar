import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { HOUSEHOLD_CHORES_PATH } from '@/lib/household-chores/contracts'
import { HouseholdChoreShell } from './HouseholdChoreShell'

export default async function HouseholdChoreNotFound() {
  const t = await getTranslations('teskeid.householdChores')

  return (
    <HouseholdChoreShell title={t('notFoundTitle')} homeLabel={t('homeLabel')}>
      <div className="space-y-6 border-y border-border py-6">
        <p className="text-sm leading-6 text-muted-foreground">
          {t('notFoundDescription')}
        </p>
        <Link
          href={HOUSEHOLD_CHORES_PATH}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t('notFoundAction')}
        </Link>
      </div>
    </HouseholdChoreShell>
  )
}
