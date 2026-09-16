import { SplitJoin } from '@/components/receipt-split/SplitJoin'
import { notFound } from 'next/navigation'
export const metadata = { robots: { index: false, follow: false } }
export default function SplitInvitePage() {
  if (process.env.AUTH_MVP_ENABLED !== 'true' || process.env.EXPENSE_RECEIPT_AI_ENABLED !== 'true') notFound()
  return <SplitJoin />
}
