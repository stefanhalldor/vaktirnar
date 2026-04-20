import type { Metadata } from 'next'
import { PreviewBanner } from '@/components/PreviewBanner'
import { Avatar } from '@/components/Avatar'
import { VerifiedCheck } from '@/components/VerifiedCheck'
import { Badge } from '@/components/Badge'
import { previewProfiles } from '@/lib/preview-data'

export const metadata: Metadata = {
  robots: 'noindex',
}

export default function PreviewProfileAnnaPage() {
  const profile = previewProfiles.anna

  return (
    <main className="min-h-screen bg-[#FAFAFA]">
      <PreviewBanner />

      <div className="max-w-sm mx-auto px-4 py-8 flex flex-col gap-4">

        {/* Header card */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 flex flex-col items-center text-center gap-3">
          <Avatar initial={profile.initial} color={profile.color} size="lg" />
          <div>
            <div className="flex items-center justify-center gap-1.5 mb-0.5">
              <p className="font-semibold text-gray-900">{profile.name}</p>
              <VerifiedCheck size="md" />
            </div>
            <p className="text-sm text-gray-400">{profile.role}</p>
          </div>
        </div>

        {/* Tengdir prófílar */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <p className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-4">Tengdir prófílar</p>
          <div className="flex flex-col gap-3">
            {profile.socials.map((s) => (
              <div key={s.label} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-800">{s.label}</p>
                  <p className="text-xs text-gray-400">{s.detail}</p>
                </div>
                {s.verified && <VerifiedCheck size="sm" />}
              </div>
            ))}
          </div>
        </div>

        {/* Um Jónu */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <p className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-4">Um {profile.child.name}</p>
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Leikskóli</span>
              <span className="text-gray-800">{profile.child.school}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Ofnæmi</span>
              <span className="text-gray-800">{profile.child.allergy}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Aðrir forsj.</span>
              <span className="flex items-center gap-1 text-gray-800">
                {profile.child.otherGuardian} <VerifiedCheck size="sm" />
              </span>
            </div>
          </div>
        </div>

        {/* Sameiginlegt */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <p className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-3">Sameiginlegt</p>
          <p className="text-sm text-gray-500 italic">{profile.shared}</p>
        </div>

        {/* Footer */}
        <p className="text-xs text-gray-400 text-center px-2">{profile.footer}</p>
      </div>
    </main>
  )
}
