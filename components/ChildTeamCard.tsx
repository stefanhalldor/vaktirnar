'use client'

import { Avatar } from './Avatar'
import { Plus } from 'lucide-react'
import { previewChildren } from '@/lib/preview-data'

export function ChildTeamCard() {
  const child = previewChildren.jona

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Avatar initial={child.initial} color={child.color} size="md" />
        <div>
          <p className="text-sm font-semibold text-gray-900">{child.name}</p>
          <p className="text-xs text-gray-400">{child.age}</p>
        </div>
      </div>

      {/* Lykilupplýsingar */}
      <div className="bg-gray-50 rounded-xl px-4 py-3 flex flex-col gap-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-400">Ofnæmi</span>
          <span className="text-gray-700 font-medium">{child.allergy}</span>
        </div>
      </div>

      {/* Aðstandendur */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-gray-400 max-w-xs">Aðstandendur í þeirri röð sem á að hringja ef engin svör berast í Krakkavaktinni</p>
          <span className="text-xs text-gray-400">Fá tilkynningar</span>
        </div>
        <div className="flex flex-col gap-1.5">
          {child.team.map((member) => (
            <div key={member.name} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Avatar initial={member.name[0]} color={member.verified ? 'blue' : 'gray'} size="sm" />
                <div>
                  <p className="text-xs font-medium text-gray-800">{member.name}</p>
                  <p className="text-xs text-gray-400">{member.relation}</p>
                  {member.phone && <p className="text-xs text-gray-400">{member.phone}</p>}
                  {!member.verified && (
                    <p className="text-xs text-amber-500">Á eftir að stofna notanda</p>
                  )}
                </div>
              </div>
              {/* Notification toggle */}
              <button
                className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors ${
                  member.notification ? 'bg-violet-600' : 'bg-gray-200'
                }`}
                aria-label="Tilkynningar"
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    member.notification ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
        <button className="mt-2 w-full flex items-center justify-center gap-2 border border-dashed border-gray-200 rounded-xl py-2 text-xs text-gray-400 hover:border-gray-300 transition-colors">
          <Plus size={12} />
          Bæta við í teymið
        </button>
      </div>

      <p className="text-xs text-gray-300">{child.footer}</p>
    </div>
  )
}
