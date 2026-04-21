import type { Metadata } from 'next'
import { PreviewBanner } from '@/components/PreviewBanner'
import { ChildTeamCard } from '@/components/ChildTeamCard'

export const metadata: Metadata = {
  robots: 'noindex',
}

export default function PreviewChildJonaPage() {
  return (
    <main className="min-h-screen bg-[#FAFAFA]">
      <PreviewBanner />
      <div className="max-w-sm mx-auto px-4 py-8">
        <ChildTeamCard />
      </div>
    </main>
  )
}
