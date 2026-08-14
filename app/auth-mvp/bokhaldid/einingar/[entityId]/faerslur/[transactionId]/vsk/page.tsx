import { notFound } from 'next/navigation'
import { BookkeepingShell } from '@/components/bookkeeping/BookkeepingPrivateShell.server'
import { BookkeepingVatLinkForm } from '@/components/bookkeeping/BookkeepingVatLinkForm'
import { getBookkeepingTranslations } from '@/components/bookkeeping/i18n.server'
import { guardBookkeepingAccess } from '@/lib/bookkeeping/guard'
import { getBookkeepingCompanyTransaction, getBookkeepingDashboard } from '@/lib/bookkeeping/repository.server'
import { BookkeepingIdSchema } from '@/lib/bookkeeping/validation'

export default async function CompanyTransactionVatPage({ params }: { params: Promise<{ entityId: string; transactionId: string }> }) {
  const [{ entityId, transactionId }, { user }, t] = await Promise.all([params, guardBookkeepingAccess(), getBookkeepingTranslations()])
  if (!BookkeepingIdSchema.safeParse(entityId).success || !BookkeepingIdSchema.safeParse(transactionId).success) notFound()
  const [view, dashboard] = await Promise.all([getBookkeepingCompanyTransaction(user.id, transactionId), getBookkeepingDashboard(user.id)])
  if (!view || view.transaction.entityId !== entityId || view.transaction.vatDisposition !== 'unclassified') notFound()
  const entityView = dashboard.entities.find((candidate) => candidate.entity.id === entityId)
  const registrations = new Map(entityView?.registrations.map((registration) => [registration.id, registration]))
  const periods = (entityView?.periods ?? []).filter(({ period }) => period.state === 'draft' || period.state === 'review').map(({ period }) => ({
    id: period.id, registrationId: period.vatRegistrationId, startsOn: period.startsOn,
    endsOn: period.endsOn, label: `${period.startsOn} – ${period.endsOn} · ${registrations.get(period.vatRegistrationId)?.label || registrations.get(period.vatRegistrationId)?.vatNumber || ''}`,
  }))
  return <BookkeepingShell title={t('ledger.vatLink.title')} homeLabel={t('homeLabel')} backHref={`/auth-mvp/bokhaldid/einingar/${entityId}/faerslur/${transactionId}`} backLabel={t('back')}><BookkeepingVatLinkForm transaction={view.transaction} periods={periods} /></BookkeepingShell>
}
