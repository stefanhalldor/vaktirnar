import { notFound } from 'next/navigation'
import { BookkeepingPeriodWorkspace } from '@/components/bookkeeping/BookkeepingPeriodWorkspace'
import { BookkeepingShell } from '@/components/bookkeeping/BookkeepingShell'
import { getBookkeepingTranslations } from '@/components/bookkeeping/i18n.server'
import { guardBookkeepingAccess } from '@/lib/bookkeeping/guard'
import { getBookkeepingPeriod } from '@/lib/bookkeeping/repository.server'
import { BookkeepingIdSchema } from '@/lib/bookkeeping/validation'

export default async function BookkeepingPeriodPage({
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
  if (!view) notFound()

  return (
    <BookkeepingShell
      title={t('period.summary')}
      homeLabel={t('homeLabel')}
      backHref="/auth-mvp/bokhaldid"
      backLabel={t('back')}
      wide
    >
      <BookkeepingPeriodWorkspace view={view} />
    </BookkeepingShell>
  )
}
