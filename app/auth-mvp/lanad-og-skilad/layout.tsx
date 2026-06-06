import { guardLoanAccess } from '@/lib/loans/guard'

// Guards all sub-routes: page, /ny, /breyta/[id]
// Redirects unauthenticated, non-allowlisted, or flag-off users.
export default async function LoanLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await guardLoanAccess()
  return <>{children}</>
}
