import { notFound } from 'next/navigation'
import { ExpenseForm } from '@/components/expenses/ExpenseForm'
import { ExpenseShell } from '@/components/expenses/ExpenseShell'
import { getExpenseTranslations } from '@/components/expenses/i18n.server'
import { guardExpenseAccess } from '@/lib/expenses/guard'
import { getExpenseGroupView } from '@/lib/expenses/repository.server'

export default async function NewGroupExpensePage({ params }: { params: Promise<{ groupId: string }> }) {
  const [{ groupId }, { user }, t] = await Promise.all([params, guardExpenseAccess(), getExpenseTranslations()])
  const group = await getExpenseGroupView(user.id, groupId)
  if (!group || !group.canCreateExpense) notFound()
  return <ExpenseShell title={t('expenseForm.groupTitle')} homeLabel={t('homeLabel')} backHref={`/auth-mvp/utlagt-og-endurgreitt/hopar/${group.id}`} backLabel={t('back')}><ExpenseForm mode="group" groupId={group.id} defaultCurrency={group.defaultCurrency} initialDate={new Date().toISOString().slice(0, 10)} initialMembers={group.members.filter((member) => member.status === 'active').map((member) => ({ key: member.id, label: member.displayName, isSelf: member.isSelf, included: member.isSelf ? group.defaultIncludeCreator : true }))} /></ExpenseShell>
}
