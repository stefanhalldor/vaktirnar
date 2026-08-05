import { notFound } from 'next/navigation'
import { BookkeepingCompanyLedger } from '@/components/bookkeeping/BookkeepingCompanyLedger'
import { BookkeepingShell } from '@/components/bookkeeping/BookkeepingShell'
import { getBookkeepingTranslations } from '@/components/bookkeeping/i18n.server'
import { guardBookkeepingAccess } from '@/lib/bookkeeping/guard'
import { getBookkeepingCompanyLedger } from '@/lib/bookkeeping/repository.server'
import { BookkeepingIdSchema } from '@/lib/bookkeeping/validation'

export default async function BookkeepingCompanyLedgerPage({ params }: { params: Promise<{ entityId: string }> }) {
  const [{ entityId }, { user }, t] = await Promise.all([params, guardBookkeepingAccess(), getBookkeepingTranslations()])
  if (!BookkeepingIdSchema.safeParse(entityId).success) notFound()
  const ledger = await getBookkeepingCompanyLedger(user.id, entityId)
  if (!ledger) notFound()
  return <BookkeepingShell title={ledger.entity.displayName} homeLabel={t('homeLabel')} backHref="/auth-mvp/bokhaldid" backLabel={t('back')}><BookkeepingCompanyLedger ledger={ledger} /></BookkeepingShell>
}
