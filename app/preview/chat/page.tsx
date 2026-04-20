import type { Metadata } from 'next'
import Link from 'next/link'
import { PreviewBanner } from '@/components/PreviewBanner'
import { Avatar } from '@/components/Avatar'
import { ChatBubble } from '@/components/ChatBubble'
import { ChatSystemMessage } from '@/components/ChatSystemMessage'
import { VerifiedCheck } from '@/components/VerifiedCheck'
import { previewChat } from '@/lib/preview-data'

export const metadata: Metadata = {
  robots: 'noindex',
}

export default function PreviewChatPage() {
  return (
    <main className="min-h-screen bg-[#FAFAFA]">
      <PreviewBanner />

      <div className="max-w-lg mx-auto px-4 py-8">
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2">
                {previewChat.children.map((c) => (
                  <Avatar key={c.initial} initial={c.initial} color={c.color} size="sm" />
                ))}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">{previewChat.title}</p>
                <p className="text-xs text-gray-400">{previewChat.subtitle}</p>
              </div>
            </div>
            <span className="text-xs font-semibold tracking-widest text-violet-600 uppercase">
              {previewChat.label}
            </span>
          </div>

          {/* Messages */}
          <div className="px-5 py-5 flex flex-col gap-4">
            <ChatSystemMessage>miðvikudagur · 14:02</ChatSystemMessage>

            <ChatBubble direction="left" senderName="Anna" childName="Jónu" verified>
              Getur Siggi leikið við Jónu eftir skóla í dag?
            </ChatBubble>

            <ChatBubble direction="right" senderName="Stebbi" childName="Sigga" verified>
              Já! Til 17. Hjá okkur?
            </ChatBubble>

            <ChatBubble direction="left" senderName="Anna" childName="Jónu" verified>
              Frábært, kem með hana um 15 👍
            </ChatBubble>

            <ChatSystemMessage>16:05 · Hófí bættist í leikvaktina</ChatSystemMessage>

            <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-xs text-gray-500 leading-relaxed">
              <p className="font-medium text-gray-700 mb-1">Stebbi bætti Hófí (5 ára) við leikvaktina</p>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                <Link href="/preview/profile/anna" className="flex items-center gap-1 hover:text-violet-600 transition-colors">
                  Bergur <VerifiedCheck size="sm" />
                </Link>
                <span className="flex items-center gap-1">
                  Kristjana <VerifiedCheck size="sm" />
                </span>
              </div>
            </div>

            <ChatBubble direction="right" senderName="Stebbi" childName="Sigga" verified>
              Hófí datt inn líka 🙂 Sæki allar þrjár á sama tíma, 17?
            </ChatBubble>

            <ChatBubble direction="left" senderName="Kristjana" childName="Hófíar" verified>
              Takk fyrir! Hentar okkur fullkomlega 🙏
            </ChatBubble>
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
            <p className="text-xs text-gray-400 text-center">
              Smelltu á nafn til að sjá staðfestan prófíl · spjall eyðist þegar leikvakt er lokið
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}
