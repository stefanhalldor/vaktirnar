'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { MessageCircle } from 'lucide-react'

interface Chat {
  id: string
  status: 'active' | 'ended'
  child_a: { id: string; name: string; avatar_emoji?: string }
  child_b: { id: string; name: string; avatar_emoji?: string }
  messages?: { content: string; created_at: string; type: string }[]
  updated_at: string
}

interface ChatListProps {
  chats: Chat[]
  userId: string
}

export function ChatList({ chats }: ChatListProps) {
  const t = useTranslations('chat')

  if (chats.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center text-gray-500">
        <MessageCircle className="h-12 w-12 text-gray-200" />
        <p className="text-sm">{t('noChats')}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {chats.map((chat) => {
        const lastMsg = chat.messages?.[chat.messages.length - 1]
        return (
          <Link
            key={chat.id}
            href={`/chat/${chat.id}`}
            className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm border border-gray-100 hover:border-violet-200 transition-colors"
          >
            <div className="flex -space-x-2">
              <Avatar emoji={chat.child_a?.avatar_emoji} name={chat.child_a?.name} size="md" />
              <Avatar emoji={chat.child_b?.avatar_emoji} name={chat.child_b?.name} size="md" className="ring-2 ring-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 text-sm">
                {chat.child_a?.name} & {chat.child_b?.name}
              </p>
              {lastMsg && (
                <p className="text-xs text-gray-500 truncate">
                  {lastMsg.type === 'activity' ? '🎯 ' : ''}{lastMsg.content}
                </p>
              )}
            </div>
            <Badge variant="success">{t('playdate')}</Badge>
          </Link>
        )
      })}
    </div>
  )
}
