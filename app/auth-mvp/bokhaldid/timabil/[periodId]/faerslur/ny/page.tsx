import { notFound } from 'next/navigation'
import { BookkeepingEntryForm } from '@/components/bookkeeping/BookkeepingEntryForm'
import { BookkeepingShell } from '@/components/bookkeeping/BookkeepingShell'
import { getBookkeepingTranslations } from '@/components/bookkeeping/i18n.server'
import { guardBookkeepingAccess } from '@/lib/bookkeeping/guard'
import { getBookkeepingPeriod } from '@/lib/bookkeeping/repository.server'
import { BookkeepingIdSchema } from '@/lib/bookkeeping/validation'

function initialEntryDate(startsOn: string, endsOn: string): string {
  const today = new Date().toISOString().slice(0, 10)
  return today >= startsOn && today <= endsOn ? today : startsOn
}

export default async function NewBookkeepingEntryPage({
  params,
}: {
  params: Promise<{ periodId: string }>
}) {
  const [{ periodId }, { user }, t] = await Promise.all([
    params,
    guardBookkeepingAccess(),
    getBookkeepingTranslations(),
  ])
  if (!BookkeepingIdSchema.safeParse(periodId).success) notFound()
  const view = await getBookkeepingPeriod(user.id, periodId)
  if (!view || (view.period.state !== 'draft' && view.period.state !== 'review')) notFound()

  return (
    <BookkeepingShell
      title={t('entryForm.newTitle')}
      homeLabel={t('homeLabel')}
      backHref={`/auth-mvp/bokhaldid/timabil/${view.period.id}`}
      backLabel={t('back')}
    >
      <BookkeepingEntryForm
        entityId={view.entity.id}
        registrationId={view.registration.id}
        period={view.period}
        initialDate={initialEntryDate(view.period.startsOn, view.period.endsOn)}
      />
    </BookkeepingShell>
  )
}
