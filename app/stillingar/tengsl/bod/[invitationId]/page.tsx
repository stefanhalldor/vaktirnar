import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { RelationshipCircleInvitationActions } from '@/components/tengsl/RelationshipCircleInvitationActions'
import { guardTeskeidSession } from '@/lib/auth/guard'
import { guardFeatureAccess } from '@/lib/loans/guard'
import { getRelationshipCircleInvitation } from '@/lib/relationships/repository-v2.server'

export default async function RelationshipCircleInvitationPage({ params }: { params: Promise<{ invitationId: string }> }) {
  const { invitationId } = await params
  const { user } = await guardTeskeidSession()
  await guardFeatureAccess(user.email!, 'tengsl')
  const [t, invitation] = await Promise.all([getTranslations('teskeid.stillingar.tengsl'), getRelationshipCircleInvitation(user.id, user.email!, invitationId)])
  if (!invitation) notFound()
  return <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 px-4 pb-10 pt-8"><div><h1 className="text-lg font-semibold text-primary">{t('invitationTitle')}</h1><p className="mt-2 text-sm">{invitation.circle.name}</p>{invitation.inviterDisplayName ? <p className="text-xs text-muted-foreground">{t('invitedBy', { name: invitation.inviterDisplayName })}</p> : null}</div><section><h2 className="mb-2 text-sm font-semibold">{t('members')}</h2><p className="mb-3 text-xs leading-5 text-muted-foreground">{t('invitationFullRosterConsent')}</p><ul className="divide-y divide-border border-y border-border">{invitation.circle.members.map((member) => <li key={member.id} className="min-h-12 py-3 text-sm">{member.displayName}{member.role === 'owner' ? ` · ${t('owner')}` : ''}</li>)}</ul></section><RelationshipCircleInvitationActions invitationId={invitation.invitationId} /></main>
}
