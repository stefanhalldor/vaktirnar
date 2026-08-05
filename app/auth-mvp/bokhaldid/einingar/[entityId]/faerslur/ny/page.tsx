import { notFound } from 'next/navigation'
import { BookkeepingAttachmentUpload } from '@/components/bookkeeping/BookkeepingAttachmentUpload'
import { BookkeepingCompanyTransactionForm } from '@/components/bookkeeping/BookkeepingCompanyTransactionForm'
import { BookkeepingShell } from '@/components/bookkeeping/BookkeepingShell'
import { getBookkeepingTranslations } from '@/components/bookkeeping/i18n.server'
import { guardBookkeepingAccess } from '@/lib/bookkeeping/guard'
import { getBookkeepingCompanyLedger } from '@/lib/bookkeeping/repository.server'
import { BookkeepingIdSchema } from '@/lib/bookkeeping/validation'

export default async function NewCompanyTransactionPage({ params }: { params: Promise<{ entityId: string }> }) {
  const [{ entityId }, { user }, t] = await Promise.all([params, guardBookkeepingAccess(), getBookkeepingTranslations()])
  if (!BookkeepingIdSchema.safeParse(entityId).success) notFound()
  const ledger = await getBookkeepingCompanyLedger(user.id, entityId)
  if (!ledger) notFound()
  return <BookkeepingShell title={t('ledger.new')} homeLabel={t('homeLabel')} backHref={`/auth-mvp/bokhaldid/einingar/${entityId}/faerslur`} backLabel={t('back')}><div className="space-y-8"><BookkeepingCompanyTransactionForm entityId={entityId} /><div id="upload" className="scroll-mt-20"><BookkeepingAttachmentUpload entityId={entityId} /></div></div></BookkeepingShell>
}
