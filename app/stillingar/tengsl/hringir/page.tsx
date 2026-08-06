import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { guardTeskeidSession } from '@/lib/auth/guard'
import { guardFeatureAccess } from '@/lib/loans/guard'
import { getPendingRelationshipCircleInvitations, getRelationshipCircles } from '@/lib/relationships/repository-v2.server'

export default async function RelationshipCirclesPage() {
  const { user } = await guardTeskeidSession()
  await guardFeatureAccess(user.email!, 'tengsl')
  const [t, state, invitations] = await Promise.all([
    getTranslations('teskeid.stillingar.tengsl'),
    getRelationshipCircles(user.id),
    getPendingRelationshipCircleInvitations(user.id, user.email!),
  ])
  return <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 px-4 pb-10 pt-8">
    <Link href="/stillingar/tengsl" className="self-start rounded text-sm text-muted-foreground focus-visible:ring-2">{t('backToList')}</Link>
    <div className="flex items-center justify-between gap-3"><h1 className="text-lg font-semibold text-primary">{t('circleListTitle')}</h1><Link href="/stillingar/tengsl/hringir/nyr" className="flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground">{t('newCircle')}</Link></div>
    {invitations.length > 0 ? <section><h2 className="mb-2 text-sm font-semibold">{t('pendingInvitations')}</h2><ul className="divide-y divide-border border-y border-border">{invitations.map((invitation) => <li key={invitation.invitationId}><Link href={`/stillingar/tengsl/bod/${invitation.invitationId}`} className="block min-h-14 py-3"><span className="block text-sm font-medium">{invitation.circle.name}</span><span className="text-xs text-muted-foreground">{t('reviewCircleInvitation')}</span></Link></li>)}</ul></section> : null}
    {!state.available ? <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{t('circlesNeedMigration')}</p> : state.circles.length === 0 ? <p className="text-sm text-muted-foreground">{t('noCircles')}</p> : <ul className="divide-y divide-border border-y border-border">{state.circles.map((circle) => <li key={circle.id}><Link href={`/stillingar/tengsl/hringir/${circle.id}`} className="block min-h-14 py-3"><span className="block text-sm font-medium">{circle.name}</span><span className="text-xs text-muted-foreground">{t('circleMemberCount', { count: circle.memberCount })}</span></Link></li>)}</ul>}
  </main>
}
