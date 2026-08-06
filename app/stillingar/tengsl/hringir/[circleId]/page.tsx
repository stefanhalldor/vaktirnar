import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { RelationshipCircleInviteForm } from '@/components/tengsl/RelationshipCircleInviteForm'
import { RelationshipCircleLifecycleActions } from '@/components/tengsl/RelationshipCircleLifecycleActions'
import { guardTeskeidSession } from '@/lib/auth/guard'
import { guardFeatureAccess } from '@/lib/loans/guard'
import { getRelationshipCircle, getRelationshipCircleInviteOptions } from '@/lib/relationships/repository-v2.server'

export default async function RelationshipCirclePage({ params }: { params: Promise<{ circleId: string }> }) {
  const { circleId } = await params
  const { user } = await guardTeskeidSession()
  await guardFeatureAccess(user.email!, 'tengsl')
  const [t, circle] = await Promise.all([getTranslations('teskeid.stillingar.tengsl'), getRelationshipCircle(user.id, circleId)])
  if (!circle) notFound()
  const options = circle.canManage ? await getRelationshipCircleInviteOptions(user.id) : []
  return <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 px-4 pb-10 pt-8"><Link href="/stillingar/tengsl/hringir" className="self-start rounded text-sm text-muted-foreground focus-visible:ring-2">{t('backToCircles')}</Link><div><h1 className="text-lg font-semibold text-primary">{circle.name}</h1>{circle.description ? <p className="mt-1 text-sm text-muted-foreground">{circle.description}</p> : null}</div><section><h2 className="mb-2 text-sm font-semibold">{t('members')}</h2><ul className="divide-y divide-border border-y border-border">{circle.members.map((member) => <li key={member.id} className="flex min-h-12 items-center justify-between gap-3 py-3 text-sm"><span>{member.displayName}{member.isSelf ? ` (${t('you')})` : ''}</span>{member.role === 'owner' ? <span className="rounded-full bg-muted px-2 py-1 text-xs">{t('owner')}</span> : null}</li>)}</ul></section>{circle.canManage ? <RelationshipCircleInviteForm circleId={circle.id} options={options} /> : null}<RelationshipCircleLifecycleActions circle={circle} /></main>
}
