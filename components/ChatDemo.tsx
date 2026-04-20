'use client'

import { useState } from 'react'
import { Avatar } from './Avatar'
import { VerifiedCheck } from './VerifiedCheck'
import { Badge } from './Badge'
import { ChatBubble } from './ChatBubble'
import { ChatSystemMessage } from './ChatSystemMessage'
import { Plus, X } from 'lucide-react'
import { ROLE_PERMISSIONS } from '@/lib/types'
import { previewProfiles, previewChildren } from '@/lib/preview-data'

type PanelType = 'profile' | 'child' | null

export function ChatDemo() {
  const [panel, setPanel] = useState<PanelType>(null)

  const profile = previewProfiles.anna
  const child = previewChildren.jona

  const roleBadgeVariant = {
    FULL_FORSJA: 'info',
    UMSJON: 'success',
    ADSTOD: 'gray',
  } as const

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      {/* Chat header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <button onClick={() => setPanel('child')} className="flex -space-x-2 hover:opacity-80 transition-opacity">
            <Avatar initial="S" color="amber" size="sm" />
            <Avatar initial="J" color="blue" size="sm" />
            <Avatar initial="H" color="green" size="sm" />
          </button>
          <div>
            <button onClick={() => setPanel('child')} className="text-sm font-semibold text-gray-900 hover:text-violet-600 transition-colors block text-left">
              Siggi, Jóna & Hófí
            </button>
            <p className="text-xs text-gray-400">4 forsjáraðilar · hjá Stebba</p>
          </div>
        </div>
        <span className="text-xs font-semibold tracking-widest text-violet-600 uppercase">Leikvakt</span>
      </div>

      {/* Messages */}
      <div className="px-5 py-5 flex flex-col gap-4">
        <ChatSystemMessage>miðvikudagur · 14:02</ChatSystemMessage>

        <ChatBubble direction="left" senderName="Anna" onSenderClick={() => setPanel('profile')} childName="Jónu" onChildClick={() => setPanel('child')} verified>
          Getur Siggi leikið við Jónu eftir skóla í dag?
        </ChatBubble>

        <ChatBubble direction="right" senderName="Stebbi" onSenderClick={() => setPanel('profile')} childName="Sigga" onChildClick={() => setPanel('child')} verified>
          Já! Til 17. Hjá okkur?
        </ChatBubble>

        <ChatBubble direction="left" senderName="Anna" onSenderClick={() => setPanel('profile')} childName="Jónu" onChildClick={() => setPanel('child')} verified>
          Frábært, kem með hana um 15 👍
        </ChatBubble>

        <ChatSystemMessage>16:05 · Hófí bættist í leikvaktina</ChatSystemMessage>

        <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-xs text-gray-500 leading-relaxed">
          <p className="font-medium text-gray-700 mb-1">Stebbi bætti Hófí (5 ára) við leikvaktina</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <button onClick={() => setPanel('profile')} className="flex items-center gap-1 hover:text-violet-600 transition-colors">
              Bergur <VerifiedCheck size="sm" />
            </button>
            <span className="flex items-center gap-1">Kristjana <VerifiedCheck size="sm" /></span>
          </div>
        </div>

        <ChatBubble direction="right" senderName="Stebbi" onSenderClick={() => setPanel('profile')} childName="Sigga" onChildClick={() => setPanel('child')} verified>
          Hófí datt inn líka 🙂 Sæki allar þrjár á sama tíma, 17?
        </ChatBubble>

        <ChatBubble direction="left" senderName="Kristjana" onSenderClick={() => setPanel('profile')} childName="Hófíar" onChildClick={() => setPanel('child')} verified>
          Takk fyrir! Hentar okkur fullkomlega 🙏
        </ChatBubble>
      </div>

      {/* Chat footer */}
      <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
        <p className="text-xs text-gray-400 text-center">
          Smelltu á nafn til að sjá staðfestan prófíl · spjall eyðist þegar leikvakt er lokið
        </p>
      </div>

      {/* Inline panel */}
      {panel && (
        <div className="border-t border-gray-100">
          <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
              {panel === 'profile' ? 'Forsjáraðili' : 'Barnateymi'}
            </p>
            <button onClick={() => setPanel(null)} className="text-gray-400 hover:text-gray-600 transition-colors">
              <X size={16} />
            </button>
          </div>

          {panel === 'profile' && (
            <div className="px-5 py-5 flex flex-col gap-4">
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
                      <span className="text-gray-400 ml-2">{s.detail}</span>
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
                  <span className="flex items-center gap-1 text-gray-700">{profile.child.otherGuardian} <VerifiedCheck size="sm" /></span>
                </div>
              </div>

              <p className="text-xs text-gray-400 italic">{profile.shared}</p>
              <p className="text-xs text-gray-300">{profile.footer}</p>
            </div>
          )}

          {panel === 'child' && (
            <div className="px-5 py-5 flex flex-col gap-4">
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
                  <span className="flex items-center gap-1 text-gray-700">{child.emergency} <VerifiedCheck size="sm" /></span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold tracking-widest text-gray-400 uppercase">Forsjáraðilar & teymi</p>
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
          )}
        </div>
      )}
    </div>
  )
}
