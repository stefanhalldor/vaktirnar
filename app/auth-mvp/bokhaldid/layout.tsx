import { guardBookkeepingAccess } from '@/lib/bookkeeping/guard'

export default async function BookkeepingLayout({ children }: { children: React.ReactNode }) {
  await guardBookkeepingAccess()
  return children
}
