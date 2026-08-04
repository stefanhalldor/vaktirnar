import { notFound } from 'next/navigation'
import { ExpenseInvitationActions } from '@/components/expenses/ExpenseInvitationActions'
import { ExpenseShell } from '@/components/expenses/ExpenseShell'
import { getExpenseTranslations } from '@/components/expenses/i18n.server'
import { guardExpenseAccess } from '@/lib/expenses/guard'
import { getExpenseInvitation } from '@/lib/expenses/repository.server'

export default async function ExpenseInvitationPage({ params }: { params: Promise<{ groupId: string }> }) {
  const [{ groupId }, { user }, t] = await Promise.all([params, guardExpenseAccess(), getExpenseTranslations()])
  const invitation = await getExpenseInvitation(user.id, groupId)
  if (!invitation) notFound()
  return (
    <ExpenseShell title={t('invitation.title')} homeLabel={t('homeLabel')} backHref="/auth-mvp/utlagt-og-endurgreitt" backLabel={t('back')}>
      <div className="space-y-5 border-y border-border py-5">
        <div><p className="text-lg font-semibold">{invitation.emoji} {invitation.name}</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{t('invitation.body', { name: invitation.name })}</p></div>
        <ExpenseInvitationActions invitation={invitation} />
      </div>
    </ExpenseShell>
  )
}
