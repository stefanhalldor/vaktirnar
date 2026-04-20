import type { Metadata } from 'next'
import { PreviewBanner } from '@/components/PreviewBanner'
import { Avatar } from '@/components/Avatar'
import { VerifiedCheck } from '@/components/VerifiedCheck'
import { Badge } from '@/components/Badge'
import { Plus } from 'lucide-react'
import { previewChildren } from '@/lib/preview-data'
import { ROLE_PERMISSIONS } from '@/lib/types'

export const metadata: Metadata = {
  robots: 'noindex',
}

const roleBadgeVariant = {
  FULL_FORSJA: 'info',
  UMSJON: 'success',
  ADSTOD: 'gray',
} as const

export default function PreviewChildJonaPage() {
  const child = previewChildren.jona

  return (
    <main className="min-h-screen bg-[#FAFAFA]">
      <PreviewBanner />

      <div className="max-w-sm mx-auto px-4 py-8 flex flex-col gap-4">

        {/* Header */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 flex flex-col items-center text-center gap-3">
          <Avatar initial={child.initial} color={child.color} size="lg" />
          <div>
            <p className="font-semibold text-gray-900">{child.name}</p>
            <p className="text-sm text-gray-400">{child.age}</p>
          </div>
        </div>

        {/* Lykilupplýsingar */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <p className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-4">Lykilupplýsingar</p>
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Ofnæmi</span>
              <span className="text-gray-800 font-medium">{child.allergy}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Læknir</span>
              <span className="text-gray-800">{child.doctor}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Neyðartengill</span>
              <span className="flex items-center gap-1 text-gray-800">
                {child.emergency} <VerifiedCheck size="sm" />
              </span>
            </div>
          </div>
        </div>

        {/* Teymi */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-semibold tracking-widest text-gray-400 uppercase">
              Forsjáraðilar & teymi
            </p>
            <span className="text-xs text-gray-400">{child.team.length} manns</span>
          </div>
          <div className="flex flex-col gap-2">
            {child.team.map((member) => {
              const role = ROLE_PERMISSIONS[member.role]
              return (
                <div key={member.name} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <Avatar
                      initial={member.name[0]}
                      color={member.verified ? 'blue' : 'gray'}
                      size="sm"
                    />
                    <div>
                      <div className="flex items-center gap-1">
                        <p className="text-sm font-medium text-gray-800">{member.name}</p>
                        {member.verified && <VerifiedCheck size="sm" />}
                      </div>
                      <p className="text-xs text-gray-400">{member.relation}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant={roleBadgeVariant[member.role]}>{role.label}</Badge>
                    <p className="text-xs text-gray-400">{role.description}</p>
                  </div>
                </div>
              )
            })}
          </div>

          <button className="mt-3 w-full flex items-center justify-center gap-2 border border-dashed border-gray-200 rounded-xl py-2.5 text-sm text-gray-400 hover:border-gray-300 hover:text-gray-600 transition-colors">
            <Plus size={14} />
            Bæta við í teymið
          </button>
        </div>

        {/* Footer */}
        <p className="text-xs text-gray-400 text-center px-2">{child.footer}</p>
      </div>
    </main>
  )
}
