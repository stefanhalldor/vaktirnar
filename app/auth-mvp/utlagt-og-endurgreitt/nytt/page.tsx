import { ExpenseForm } from '@/components/expenses/ExpenseForm'
import { ExpenseShell } from '@/components/expenses/ExpenseShell'
import { getExpenseTranslations } from '@/components/expenses/i18n.server'
import { guardExpenseAccess } from '@/lib/expenses/guard'
import { getExpenseActorDisplayName, getExpenseParticipantOptions } from '@/lib/expenses/participants.server'
import type { ExpenseParticipantOption } from '@/lib/expenses/contracts'
import { parseExpenseDraftId } from '@/lib/expenses/flow'
import { getExpensePrivateDraft } from '@/lib/expenses/repository.server'
import { checkFeatureAccess } from '@/lib/loans/guard'
import { getRelationshipCircleOptions } from '@/lib/relationships/repository-v2.server'

export default async function NewOneOffExpensePage({ searchParams }: { searchParams: Promise<{ draft?: string | string[] }> }) {
  const [{ user }, t, query] = await Promise.all([guardExpenseAccess(), getExpenseTranslations(), searchParams])
  const actorName = await getExpenseActorDisplayName(user.id)
  let options: ExpenseParticipantOption[] = []
  let optionsError = false
  try { options = await getExpenseParticipantOptions(user.id) } catch { optionsError = true }
  const canUseCircles = await checkFeatureAccess(user.id, user.email!, 'tengsl')
  const circleOptions = canUseCircles ? await getRelationshipCircleOptions(user.id) : []
  const draftId = parseExpenseDraftId(query.draft)
  const draft = draftId ? await getExpensePrivateDraft(user.id, draftId) : null
  const safeDraft = draft?.contextType === 'one_off' ? draft : null
  return (
    <ExpenseShell title={t('expenseForm.oneOffTitle')} homeLabel={t('homeLabel')} backHref="/auth-mvp/utlagt-og-endurgreitt" backLabel={t('back')} closedTestingFeature="utlagt-og-endurgreitt">
      <ExpenseForm
        mode="one_off"
        defaultCurrency="ISK"
        initialDate={new Date().toISOString().slice(0, 10)}
        initialMembers={[{ key: 'self', label: actorName, input: { type: 'self', key: 'self' }, isSelf: true }]}
        participantOptions={options}
        participantOptionsError={optionsError}
        circleOptions={circleOptions}
        draft={safeDraft}
        draftBaseHref="/auth-mvp/utlagt-og-endurgreitt/nytt"
      />
    </ExpenseShell>
  )
}
