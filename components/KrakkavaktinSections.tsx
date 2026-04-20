'use client'

import { useState, useRef } from 'react'
import { ChevronDown, Plus } from 'lucide-react'
import { ChatOnly } from './ChatOnly'
import { Avatar } from './Avatar'
import { VerifiedCheck } from './VerifiedCheck'
import { Badge } from './Badge'
import { ROLE_PERMISSIONS } from '@/lib/types'
import { previewProfiles, previewChildren } from '@/lib/preview-data'

interface Section {
  id: string
  title: string
  content: React.ReactNode
}

function DrawerSection({
  title,
  isOpen,
  onToggle,
  sectionRef,
  children,
}: {
  title: string
  isOpen: boolean
  onToggle: () => void
  sectionRef: (el: HTMLDivElement | null) => void
  children: React.ReactNode
}) {
  return (
    <div ref={sectionRef} className="border-b border-gray-100 last:border-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <span className={`text-sm font-semibold ${isOpen ? 'text-gray-900' : 'text-gray-500'}`}>
          {title}
        </span>
        <ChevronDown
          size={16}
          className={`text-gray-400 flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      {isOpen && (
        <div className="px-5 pb-5">
          {children}
        </div>
      )}
    </div>
  )
}

const roleBadgeVariant = {
  FULL_FORSJA: 'info',
  UMSJON: 'success',
  ADSTOD: 'gray',
} as const

interface KrakkavaktinSectionsProps {
  labels: {
    chat: string
    guardian: string
    childTeam: string
    featureChat: string
    featureChatDesc: string
    featureChild: string
    featureChildDesc: string
    featureDisappear: string
    featureDisappearDesc: string
    featureCalm: string
    featureCalmDesc: string
  }
}

export function KrakkavaktinSections({ labels }: KrakkavaktinSectionsProps) {
  const [openId, setOpenId] = useState<string | null>(null)
  const refs = useRef<Record<string, HTMLDivElement | null>>({})

  const profile = previewProfiles.anna
  const child = previewChildren.jona

  function toggle(id: string) {
    const isOpening = openId !== id
    setOpenId(isOpening ? id : null)
    if (isOpening) {
      setTimeout(() => {
        refs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 50)
    }
  }

  const sections = [
    {
      id: 'chat',
      title: labels.chat,
      content: (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2.5">
              <div className="flex -space-x-1.5">
                <Avatar initial="S" color="amber" size="sm" />
                <Avatar initial="J" color="blue" size="sm" />
                <Avatar initial="H" color="green" size="sm" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-800">Siggi, Jóna & Hófí</p>
                <p className="text-xs text-gray-400">4 forsjáraðilar · hjá Stebba</p>
              </div>
            </div>
            <span className="text-xs font-semibold tracking-widest text-violet-600 uppercase">Leikvakt</span>
          </div>
          <div className="px-4 py-4">
            <ChatOnly />
          </div>
        </div>
      ),
    },
    {
      id: 'guardian',
      title: labels.guardian,
      content: (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Avatar initial={profile.initial} color={profile.color} size="md" />
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-semibold text-gray-900">{profile.name}</p>
                <VerifiedCheck size="sm" />
              </div>
              <p className="text-xs text-gray-400">{profile.role}</p>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {profile.socials.map((s) => (
              <div key={s.label} className="flex items-center justify-between text-sm">
                <div>
                  <span className="font-medium text-gray-700">{s.label}</span>
                  <span className="text-gray-400 ml-2 text-xs">{s.detail}</span>
                </div>
                {s.verified && <VerifiedCheck size="sm" />}
              </div>
            ))}
          </div>
          <div className="bg-gray-50 rounded-xl px-4 py-3 flex flex-col gap-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Leikskóli</span>
              <span className="text-gray-700">{profile.child.school}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Ofnæmi</span>
              <span className="text-gray-700 font-medium">{profile.child.allergy}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Aðrir forsj.</span>
              <span className="flex items-center gap-1 text-gray-700">
                {profile.child.otherGuardian} <VerifiedCheck size="sm" />
              </span>
            </div>
          </div>
          <p className="text-xs text-gray-400 italic">{profile.shared}</p>
          <p className="text-xs text-gray-300">{profile.footer}</p>
        </div>
      ),
    },
    {
      id: 'childteam',
      title: labels.childTeam,
      content: (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Avatar initial={child.initial} color={child.color} size="md" />
            <div>
              <p className="text-sm font-semibold text-gray-900">{child.name}</p>
              <p className="text-xs text-gray-400">{child.age}</p>
            </div>
          </div>
          <div className="bg-gray-50 rounded-xl px-4 py-3 flex flex-col gap-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Ofnæmi</span>
              <span className="text-gray-700 font-medium">{child.allergy}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Læknir</span>
              <span className="text-gray-700">{child.doctor}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Neyðartengill</span>
              <span className="flex items-center gap-1 text-gray-700">
                {child.emergency} <VerifiedCheck size="sm" />
              </span>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold tracking-widest text-gray-400 uppercase">
                Forsjáraðilar & teymi
              </p>
              <span className="text-xs text-gray-400">{child.team.length} manns</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {child.team.map((member) => {
                const role = ROLE_PERMISSIONS[member.role]
                return (
                  <div key={member.name} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Avatar initial={member.name[0]} color={member.verified ? 'blue' : 'gray'} size="sm" />
                      <div>
                        <div className="flex items-center gap-1">
                          <p className="text-xs font-medium text-gray-800">{member.name}</p>
                          {member.verified && <VerifiedCheck size="sm" />}
                        </div>
                        <p className="text-xs text-gray-400">{member.relation}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                      <Badge variant={roleBadgeVariant[member.role]}>{role.label}</Badge>
                      <p className="text-xs text-gray-400">{role.description}</p>
                    </div>
                  </div>
                )
              })}
            </div>
            <button className="mt-2 w-full flex items-center justify-center gap-2 border border-dashed border-gray-200 rounded-xl py-2 text-xs text-gray-400 hover:border-gray-300 transition-colors">
              <Plus size={12} />
              Bæta við í teymið
            </button>
          </div>
          <p className="text-xs text-gray-300">{child.footer}</p>
        </div>
      ),
    },
    {
      id: 'f-chat',
      title: labels.featureChat,
      content: <p className="text-sm text-gray-500 leading-relaxed">{labels.featureChatDesc}</p>,
    },
    {
      id: 'f-child',
      title: labels.featureChild,
      content: <p className="text-sm text-gray-500 leading-relaxed">{labels.featureChildDesc}</p>,
    },
    {
      id: 'f-disappear',
      title: labels.featureDisappear,
      content: <p className="text-sm text-gray-500 leading-relaxed">{labels.featureDisappearDesc}</p>,
    },
    {
      id: 'f-calm',
      title: labels.featureCalm,
      content: <p className="text-sm text-gray-500 leading-relaxed">{labels.featureCalmDesc}</p>,
    },
  ]

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      {sections.map((section) => (
        <DrawerSection
          key={section.id}
          title={section.title}
          isOpen={openId === section.id}
          onToggle={() => toggle(section.id)}
          sectionRef={(el) => { refs.current[section.id] = el }}
        >
          {section.content}
        </DrawerSection>
      ))}
    </div>
  )
}
