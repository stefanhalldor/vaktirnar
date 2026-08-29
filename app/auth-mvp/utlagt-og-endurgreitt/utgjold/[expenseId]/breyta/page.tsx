import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ExpenseForm } from '@/components/expenses/ExpenseForm'
import { ExpenseShell } from '@/components/expenses/ExpenseShell'
import { getExpenseTranslations } from '@/components/expenses/i18n.server'
import { isExpenseEventContext } from '@/lib/events/repository.server'
import { guardExpenseAccess } from '@/lib/expenses/guard'
import { expenseDetailHref, parseExpenseDraftId, parseExpenseFlowStep } from '@/lib/expenses/flow'
import { canEditExpense } from '@/lib/expenses/policy'
import { getExpenseParticipantOptions } from '@/lib/expenses/participants.server'
import type { ExpenseParticipantOption } from '@/lib/expenses/contracts'
import {
  getCanonicalExpenseEditDraft,
  getExpenseItemView,
} from '@/lib/expenses/repository.server'

export default async function EditExpensePage({
  params,
  searchParams,
}: {
  params: Promise<{ expenseId: string }>
  searchParams: Promise<{ step?: string | string[]; draft?: string | string[] }>
}) {
  const [{ expenseId }, query, { user }, t] = await Promise.all([
    params,
    searchParams,
    guardExpenseAccess(),
    getExpenseTranslations(),
  ])
  const result = await getExpenseItemView(user.id, expenseId)
  if (!result) notFound()

  const { expense, group } = result
  const isEventContext = await isExpenseEventContext(user.id, group.id).catch(() => true)
  const hasReportedRepayment = group.repayments.some(
    (repayment) => repayment.status === 'reported',
  )
  const hasConfirmedRepayment = group.repayments.some(
    (repayment) => repayment.status === 'confirmed',
  )
  const canEdit = canEditExpense({
    expenseStatus: expense.status,
    groupStatus: group.status,
    createdBySelf: expense.createdBySelf,
    canManage: group.canManage,
  })
  if (!canEdit) notFound()

  const draftId = parseExpenseDraftId(query.draft)
  const canonical = await getCanonicalExpenseEditDraft(user.id, group.id, expense.id)
  if (canonical.status === 'ambiguous' || canonical.status === 'unavailable') {
    const detailHref = expenseDetailHref(expense.id)
    const retryHref = `${detailHref}/breyta?step=${parseExpenseFlowStep(query.step)}`
    const unavailable = canonical.status === 'unavailable'
    return (
      <ExpenseShell
        title={expense.title}
        homeLabel={t('homeLabel')}
        backHref={detailHref}
        backLabel={t('back')}
        closedTestingFeature="utlagt-og-endurgreitt"
      >
        <section
          role={unavailable ? 'status' : 'alert'}
          aria-labelledby="expense-edit-state-heading"
          className="space-y-4 border-y border-border py-6"
        >
          <div className="space-y-2">
            <h2 id="expense-edit-state-heading" className="text-base font-semibold">
              {t(unavailable ? 'editState.unavailableHeading' : 'editState.ambiguousHeading')}
            </h2>
            <p className="text-sm leading-6 text-muted-foreground">
              {t(unavailable ? 'editState.unavailableBody' : 'editState.ambiguousBody')}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            {unavailable ? (
              <Link
                href={retryHref}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {t('editState.retry')}
              </Link>
            ) : null}
            <Link
              href={detailHref}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t('editState.backToExpense')}
            </Link>
          </div>
        </section>
      </ExpenseShell>
    )
  }
  if (canonical.status === 'single' && draftId !== canonical.draft.id) {
    redirect(`${expenseDetailHref(expense.id)}/breyta?step=${canonical.draft.currentStep}&draft=${canonical.draft.id}`)
  }
  const safeDraft = canonical.status === 'single' ? canonical.draft : null
  const initialStep = safeDraft?.currentStep ?? parseExpenseFlowStep(query.step)
  const referencedMemberIds = new Set([
    ...expense.payments.map((payment) => payment.memberId),
    ...expense.shares.map((share) => share.memberId),
  ])
  const sharedMemberIds = new Set(expense.shares.map((share) => share.memberId))
  // Shared-share collaborators are identity actors, not additional financial
  // participants. Keep them out of the existing allocation editor so an edit
  // can never duplicate their canonical share.
  const collaboratorMemberIds = new Set((expense.shareCollaborators ?? [])
    .filter((collaborator) => collaborator.status === 'active')
    .map((collaborator) => collaborator.memberId))
  let participantOptions: ExpenseParticipantOption[] = []
  let participantOptionsError = false
  try {
    participantOptions = await getExpenseParticipantOptions(user.id)
  } catch {
    participantOptionsError = true
  }

  return (
    <ExpenseShell
      title={t('expenseForm.editTitle')}
      homeLabel={t('homeLabel')}
      backHref={`/auth-mvp/utlagt-og-endurgreitt/utgjold/${expense.id}`}
      backLabel={t('back')}
      closedTestingFeature="utlagt-og-endurgreitt"
    >
      <ExpenseForm
        mode={group.kind}
        groupId={group.id}
        defaultCurrency={expense.currency}
        initialDate={expense.incurredOn}
        initialStep={initialStep}
        participantOptions={participantOptions}
        participantOptionsError={participantOptionsError}
        eventContext={isEventContext}
        draft={safeDraft}
        initialDraftId={draftId ?? undefined}
        draftBaseHref={`${expenseDetailHref(expense.id)}/breyta`}
        initialMembers={group.members
          .filter((member) => (
            (member.status === 'active' || referencedMemberIds.has(member.id))
            && !collaboratorMemberIds.has(member.id)
          ))
          .map((member) => ({
            key: member.id,
            label: member.displayName,
            isSelf: member.isSelf,
            included: sharedMemberIds.has(member.id),
          }))}
        edit={{
          expense,
          expectedFinancialVersion: group.financialVersion,
          groupStatus: group.status,
          hasReportedRepayment,
          hasConfirmedRepayment,
          repayments: group.kind === 'one_off' ? group.repayments : [],
        }}
      />
    </ExpenseShell>
  )
}
