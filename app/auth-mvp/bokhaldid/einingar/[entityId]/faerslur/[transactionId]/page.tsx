import { notFound } from 'next/navigation'
import { BookkeepingCompanyTransactionDetail } from '@/components/bookkeeping/BookkeepingCompanyTransactionDetail'
import { BookkeepingShell } from '@/components/bookkeeping/BookkeepingPrivateShell.server'
import { getBookkeepingTranslations } from '@/components/bookkeeping/i18n.server'
import { guardBookkeepingAccess } from '@/lib/bookkeeping/guard'
import { getBookkeepingCompanyTransaction } from '@/lib/bookkeeping/repository.server'
import { BookkeepingIdSchema } from '@/lib/bookkeeping/validation'

export default async function CompanyTransactionPage({ params }: { params: Promise<{ entityId: string; transactionId: string }> }) {
  const [{ entityId, transactionId }, { user }, t] = await Promise.all([params, guardBookkeepingAccess(), getBookkeepingTranslations()])
  if (!BookkeepingIdSchema.safeParse(entityId).success || !BookkeepingIdSchema.safeParse(transactionId).success) notFound()
  const view = await getBookkeepingCompanyTransaction(user.id, transactionId)
  if (!view || view.transaction.entityId !== entityId) notFound()
  return <BookkeepingShell title={view.transaction.description || t('ledger.untitled')} homeLabel={t('homeLabel')} backHref={`/auth-mvp/bokhaldid/einingar/${entityId}/faerslur`} backLabel={t('back')}><BookkeepingCompanyTransactionDetail view={view} /></BookkeepingShell>
}
