import { notFound } from 'next/navigation'
import { BookkeepingEntryForm } from '@/components/bookkeeping/BookkeepingEntryForm'
import { BookkeepingShell } from '@/components/bookkeeping/BookkeepingPrivateShell.server'
import { getBookkeepingTranslations } from '@/components/bookkeeping/i18n.server'
import { guardBookkeepingAccess } from '@/lib/bookkeeping/guard'
import {
  getBookkeepingEntry,
  getBookkeepingPeriod,
} from '@/lib/bookkeeping/repository.server'
import { BookkeepingIdSchema } from '@/lib/bookkeeping/validation'

export default async function EditBookkeepingEntryPage({
  params,
}: {
  params: Promise<{ periodId: string; entryId: string }>
}) {
  const [{ periodId, entryId }, { user }, t] = await Promise.all([
    params,
    guardBookkeepingAccess(),
    getBookkeepingTranslations(),
  ])
  if (
    !BookkeepingIdSchema.safeParse(periodId).success
    || !BookkeepingIdSchema.safeParse(entryId).success
  ) notFound()
  const [view, entry] = await Promise.all([
    getBookkeepingPeriod(user.id, periodId),
    getBookkeepingEntry(user.id, entryId),
  ])
  if (!view || !entry || entry.periodId !== view.period.id || entry.voidedAt !== null) notFound()

  return (
    <BookkeepingShell
      title={t('entryForm.editTitle')}
      homeLabel={t('homeLabel')}
      backHref={`/auth-mvp/bokhaldid/timabil/${view.period.id}`}
      backLabel={t('back')}
    >
      {view.period.state !== 'draft' && view.period.state !== 'review' ? (
        <p className="mb-5 rounded-xl border border-amber-300/70 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
          {t(view.period.state === 'ready' ? 'period.readyLocked' : 'period.submittedLocked')}
        </p>
      ) : null}
      <BookkeepingEntryForm
        entityId={view.entity.id}
        registrationId={view.registration.id}
        period={view.period}
        initialDate={entry.reportingDate}
        entry={entry}
      />
    </BookkeepingShell>
  )
}
