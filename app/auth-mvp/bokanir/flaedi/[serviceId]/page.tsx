import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { BookingShell } from '@/components/bookings/BookingShell'
import { ProviderBookingWorkflowEditorClient } from '@/components/bookings/ProviderBookingWorkflowEditorClient'
import { guardBookingProvider } from '@/lib/bookings/access.server'
import { loadProviderBookingWorkflow } from '@/lib/bookings/repository.server'
import { bookingPublicIdSchema } from '@/lib/bookings/validation'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('bookings')
  return {
    title: `${t('workflow.editor.title')} · Teskeið`,
    description: t('workflow.editor.description'),
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  }
}

export default async function BookingWorkflowEditorPage({
  params,
}: {
  params: Promise<{ serviceId: string }>
}) {
  const [{ serviceId: rawServiceId }, { user, spaceId }, t] = await Promise.all([
    params,
    guardBookingProvider(),
    getTranslations('bookings'),
  ])
  const serviceId = bookingPublicIdSchema.safeParse(rawServiceId)
  if (!serviceId.success) notFound()

  const workflow = await loadProviderBookingWorkflow(user.id, spaceId, serviceId.data)
  if (!workflow) notFound()

  return (
    <BookingShell
      title={t('workflow.editor.title')}
      description={t('workflow.editor.description')}
      backHref="/auth-mvp/bokanir"
      backLabel={t('workflow.editor.back')}
      menuVariant="authenticated"
    >
      <ProviderBookingWorkflowEditorClient initialWorkflow={workflow} />
    </BookingShell>
  )
}
