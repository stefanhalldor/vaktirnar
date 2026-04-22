'use client'

import { Avatar } from './Avatar'
import { VerifiedCheck } from './VerifiedCheck'
import { ExternalLink } from 'lucide-react'
import { previewProfiles } from '@/lib/preview-data'

export function GuardianCard() {
  const profile = previewProfiles.anna

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Avatar initial={profile.initial} color={profile.color} size="md" src={profile.src} />
        <div>
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold text-gray-900">{profile.name}</p>
            <VerifiedCheck size="sm" />
          </div>
          <p className="text-xs text-gray-400">{profile.role}</p>
        </div>
      </div>

      {/* Samfélagsmiðlar */}
      <div className="flex flex-col gap-1">
        {profile.socials.map((s) => (
          <a
            key={s.label}
            href={s.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between text-sm group hover:bg-gray-50 rounded-lg px-2 py-1.5 -mx-2 transition-colors"
          >
            <span className="font-medium text-gray-700 group-hover:text-violet-600 transition-colors w-24 flex-shrink-0">
              {s.label}
            </span>
            <span className="flex items-center gap-1 text-xs text-gray-400 flex-1">
              {s.detail}
              {s.verified && <VerifiedCheck size="sm" />}
            </span>
            <ExternalLink size={12} className="text-gray-300 group-hover:text-violet-400 transition-colors flex-shrink-0" />
          </a>
        ))}
      </div>

      {/* Símanúmer */}
      <div className="flex flex-col gap-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-400">Símanúmer</span>
          <span className="text-gray-700">{profile.phone}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Vara</span>
          <span className="text-gray-700">{profile.phoneBackup}</span>
        </div>
      </div>

    </div>
  )
}
