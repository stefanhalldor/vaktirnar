import { notFound } from 'next/navigation'
import { SplitPreview } from '@/components/receipt-split/preview/SplitPreview'

export const dynamic = 'force-dynamic'
export const metadata = { robots: { index: false, follow: false } }
export default function SplitPreviewPage() {
  // This synthetic candidate must never become a production receipt route.
  if (process.env.NODE_ENV !== 'development') notFound()
  return <SplitPreview />
}
