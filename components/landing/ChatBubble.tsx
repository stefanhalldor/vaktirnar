'use client'

import { VerifiedCheck } from './VerifiedCheck'

interface ChatBubbleProps {
  direction: 'left' | 'right'
  senderName: string
  onSenderClick?: () => void
  childName: string
  onChildClick?: () => void
  verified?: boolean
  children: React.ReactNode
}

export function ChatBubble({
  direction,
  senderName,
  onSenderClick,
  childName,
  onChildClick,
  verified = false,
  children,
}: ChatBubbleProps) {
  const isRight = direction === 'right'

  return (
    <div className={`flex flex-col gap-1 ${isRight ? 'items-end' : 'items-start'}`}>
      <div className={`flex items-center gap-1 text-xs text-gray-400 ${isRight ? 'flex-row-reverse' : ''}`}>
        <button
          onClick={onSenderClick}
          className="font-medium text-gray-600 hover:text-violet-600 transition-colors"
        >
          {senderName}
        </button>
        {verified && <VerifiedCheck size="sm" />}
        <button onClick={onChildClick} className="hover:text-violet-500 transition-colors">
          · forsj. {childName}
        </button>
      </div>
      <div
        className={`max-w-xs px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
          isRight
            ? 'bg-violet-600 text-white rounded-tr-sm'
            : 'bg-gray-100 text-gray-800 rounded-tl-sm'
        }`}
      >
        {children}
      </div>
    </div>
  )
}
