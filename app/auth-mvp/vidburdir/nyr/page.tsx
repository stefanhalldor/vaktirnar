import { getTranslations } from 'next-intl/server'
import { EventCreateForm } from '@/components/events/EventCreateForm'
import type { ExpenseParticipantOption } from '@/lib/expenses/contracts'
import { getExpenseParticipantOptions } from '@/lib/expenses/participants.server'
import { guardEventAccess } from '@/lib/events/guard'
import { EventShell } from '../EventShell'

export const maxDuration = 60

export default async function NewEventPage() {
  const [{ user }, t] = await Promise.all([
    guardEventAccess(),
    getTranslations('teskeid.events'),
  ])
  let options: ExpenseParticipantOption[] = []
  let optionsError = false
  try {
    options = await getExpenseParticipantOptions(user.id)
  } catch {
    optionsError = true
  }
  return (
    <EventShell
      title={t('newTitle')}
      homeLabel={t('homeLabel')}
      backHref="/auth-mvp/vidburdir"
      backLabel={t('backToList')}
    >
      <EventCreateForm
        options={options}
        optionsError={optionsError}
      />
    </EventShell>
  )
}
