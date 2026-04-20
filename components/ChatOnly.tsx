'use client'

import { Avatar } from './Avatar'
import { VerifiedCheck } from './VerifiedCheck'
import { ChatBubble } from './ChatBubble'
import { ChatSystemMessage } from './ChatSystemMessage'

export function ChatOnly() {
  return (
    <div className="flex flex-col gap-4 py-2">
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
          <span className="flex items-center gap-1">Bergur <VerifiedCheck size="sm" /></span>
          <span className="flex items-center gap-1">Kristjana <VerifiedCheck size="sm" /></span>
        </div>
      </div>

      <ChatBubble direction="right" senderName="Stebbi" childName="Sigga" verified>
        Hófí datt inn líka 🙂 Sæki allar þrjár á sama tíma, 17?
      </ChatBubble>

      <ChatBubble direction="left" senderName="Kristjana" childName="Hófíar" verified>
        Takk fyrir! Hentar okkur fullkomlega 🙏
      </ChatBubble>

      <p className="text-xs text-gray-400 text-center pt-1">
        Spjall eyðist þegar leikvakt er lokið
      </p>
    </div>
  )
}
