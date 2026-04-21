import type { Metadata } from 'next'
import { PreviewBanner } from '@/components/PreviewBanner'
import { GuardianCard } from '@/components/GuardianCard'

export const metadata: Metadata = {
  robots: 'noindex',
}

export default function PreviewProfileAnnaPage() {
  return (
    <main className="min-h-screen bg-[#FAFAFA]">
      <PreviewBanner />
      <div className="max-w-sm mx-auto px-4 py-8">
        <GuardianCard />
      </div>
    </main>
  )
}
