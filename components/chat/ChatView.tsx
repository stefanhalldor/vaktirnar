'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { MessageBubble } from './MessageBubble'
import { MessageInput } from './MessageInput'
import { ActivityLogger } from './ActivityLogger'
import { Button } from '@/components/ui/Button'

interface Message {
  id: string
  content: string
  type: 'text' | 'activity' | 'system'
  sender_id: string
  created_at: string
  activity_category?: string
  activity_minutes?: number
  activity_child_ids?: string[]
}

interface ChatViewProps {
  chatId: string
  initialMessages: Message[]
  userId: string
  chatStatus: 'active' | 'ended'
}

export function ChatView({ chatId, initialMessages, userId, chatStatus }: ChatViewProps) {
  const t = useTranslations('chat')
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [showActivityLogger, setShowActivityLogger] = useState(false)
  const [ending, setEnding] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (chatStatus === 'ended') return

    const channel = supabase
      .channel(`chat:${chatId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message])
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [chatId, chatStatus, supabase])

  const sendMessage = useCallback(async (content: string) => {
    await fetch(`/api/chats/${chatId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, type: 'text' }),
    })
  }, [chatId])

  const logActivity = useCallback(async (category: string, minutes: number) => {
    await fetch(`/api/chats/${chatId}/activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, minutes }),
    })
  }, [chatId])

  async function endPlaydate() {
    if (!confirm(t('endPlaydateConfirm'))) return
    setEnding(true)
    await fetch(`/api/chats/${chatId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ended' }),
    })
    router.refresh()
  }

  return (
    <div className="flex flex-col">
      {/* Messages */}
      <div className="min-h-[60vh] px-4 py-4">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} isOwn={msg.sender_id === userId} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* End playdate button */}
      {chatStatus === 'active' && (
        <div className="px-4 pb-2">
          <Button
            variant="danger"
            size="sm"
            onClick={endPlaydate}
            loading={ending}
            className="w-full"
          >
            {t('endPlaydate')}
          </Button>
        </div>
      )}

      {chatStatus === 'ended' && (
        <div className="px-4 py-3 text-center text-sm text-gray-500 bg-gray-50 rounded-xl mx-4 mb-2">
          {t('ended')}
        </div>
      )}

      {/* Input */}
      {chatStatus === 'active' && (
        <MessageInput
          onSend={sendMessage}
          onActivityClick={() => setShowActivityLogger(true)}
          disabled={false}
        />
      )}

      {/* Activity logger overlay */}
      {showActivityLogger && (
        <ActivityLogger
          onLog={logActivity}
          onClose={() => setShowActivityLogger(false)}
        />
      )}
    </div>
  )
}
