import { BookkeepingDashboard } from '@/components/bookkeeping/BookkeepingDashboard'
import { BookkeepingShell } from '@/components/bookkeeping/BookkeepingPrivateShell.server'
import { getBookkeepingTranslations } from '@/components/bookkeeping/i18n.server'
import { guardBookkeepingAccess } from '@/lib/bookkeeping/guard'
import { getBookkeepingDashboard } from '@/lib/bookkeeping/repository.server'

export default async function BookkeepingPage() {
  const [{ user }, t] = await Promise.all([
    guardBookkeepingAccess(),
    getBookkeepingTranslations(),
  ])
  const dashboard = await getBookkeepingDashboard(user.id)
  const referenceDate = new Date().toISOString().slice(0, 10)

  return (
    <BookkeepingShell title={t('title')} homeLabel={t('homeLabel')} wide>
      <BookkeepingDashboard dashboard={dashboard} referenceDate={referenceDate} />
    </BookkeepingShell>
  )
}
