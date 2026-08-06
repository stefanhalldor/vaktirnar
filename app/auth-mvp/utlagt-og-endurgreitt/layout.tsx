import { guardExpenseSession } from '@/lib/expenses/guard'

export default async function ExpenseLayout({ children }: { children: React.ReactNode }) {
  await guardExpenseSession()
  return children
}
