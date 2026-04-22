import type { Metadata } from 'next'
import { PreviewBanner } from '@/components/landing/PreviewBanner'
import { GuardianCard } from '@/components/landing/GuardianCard'

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
