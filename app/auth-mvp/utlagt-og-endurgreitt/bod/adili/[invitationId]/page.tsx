import { notFound } from 'next/navigation'
import { ExpenseMemberInvitationActions } from '@/components/expenses/ExpenseMemberInvitationActions'
import { ExpenseShell } from '@/components/expenses/ExpenseShell'
import { getExpenseTranslations } from '@/components/expenses/i18n.server'
import { guardExpenseSession } from '@/lib/expenses/guard'
import { getExpenseMemberInvitation } from '@/lib/expenses/repository.server'

export default async function ExpenseMemberInvitationPage({
  params,
}: {
  params: Promise<{ invitationId: string }>
}) {
  const [{ invitationId }, { user }, t] = await Promise.all([
    params,
    guardExpenseSession(),
    getExpenseTranslations(),
  ])
  const invitation = await getExpenseMemberInvitation(user.id, invitationId)
  if (!invitation) notFound()

  return (
    <ExpenseShell
      title={t('memberInvitation.title')}
      homeLabel={t('homeLabel')}
      backHref="/auth-mvp/utlagt-og-endurgreitt"
      backLabel={t('back')}
    >
      <div className="space-y-6">
        <div className="space-y-3 border-y border-border py-5">
          <p className="text-lg font-semibold">{invitation.contextTitle}</p>
          <dl className="space-y-2 text-sm">
            {invitation.inviterDisplayName ? (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{t('memberInvitation.from')}</dt>
                <dd className="text-right font-medium">{invitation.inviterDisplayName}</dd>
              </div>
            ) : null}
          </dl>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">
          {t('memberInvitation.privacyNotice')}
        </p>
        <ExpenseMemberInvitationActions invitationId={invitation.invitationId} />
      </div>
    </ExpenseShell>
  )
}
