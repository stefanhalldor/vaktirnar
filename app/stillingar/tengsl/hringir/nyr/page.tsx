import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { RelationshipCircleForm } from '@/components/tengsl/RelationshipCircleForm'
import { guardTeskeidSession } from '@/lib/auth/guard'
import { guardFeatureAccess } from '@/lib/loans/guard'

export default async function NewRelationshipCirclePage() {
  const { user } = await guardTeskeidSession()
  await guardFeatureAccess(user.email!, 'tengsl')
  const t = await getTranslations('teskeid.stillingar.tengsl')
  return <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 px-4 pb-10 pt-8"><Link href="/stillingar/tengsl/hringir" className="self-start rounded text-sm text-muted-foreground focus-visible:ring-2">{t('backToCircles')}</Link><h1 className="text-lg font-semibold text-primary">{t('newCircleTitle')}</h1><RelationshipCircleForm /></main>
}
