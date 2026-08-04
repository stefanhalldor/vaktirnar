import { guardExpenseAccess } from '@/lib/expenses/guard'

export default async function ExpenseLayout({ children }: { children: React.ReactNode }) {
  await guardExpenseAccess()
  return children
}
